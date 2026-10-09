import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import type { MemoryStore, RecalledMemory } from '@acf/core/runtime'
import { agentMemory, type Database } from '@acf/db'

import { localLexicalEmbeddingProvider, type EmbeddingProvider } from './tools/external-tools'

/**
 * Agent memory, backed by `agent_memory` and pgvector.
 *
 * Recall is three things unioned, in this order of trust:
 *
 *  1. Pinned entries. SPEC.md says these always load, whatever any ranking thinks.
 *  2. The most recent lessons, regardless of similarity — a lesson about a mistake is
 *     worth loading even when it does not resemble today's task, which is exactly when
 *     it would be ranked out.
 *  3. The nearest entries by cosine distance.
 *
 * HOW GOOD THE RANKING IS depends on the embedding provider, and the provider says so.
 * The default is local and lexical: it finds shared vocabulary, not shared meaning. It
 * beats recency and it is not semantic search, and `providerIsSemantic` on the result
 * lets a caller tell the difference rather than assume.
 */
export interface MemoryStoreOptions {
  embeddings?: EmbeddingProvider
}

/**
 * Postgres vector literal, for raw SQL only.
 *
 * The column itself takes a plain number[] — drizzle formats it. Passing a
 * pre-formatted string there gets it quoted a second time and Postgres rejects it
 * with "Vector contents must start with [".
 */
function toVectorLiteral(vector: number[]): string {
  return `[${vector.map((v) => (Number.isFinite(v) ? v : 0)).join(',')}]`
}

function sanitise(vector: number[]): number[] {
  return vector.map((v) => (Number.isFinite(v) ? v : 0))
}

export function memoryStore(db: Database, options: MemoryStoreOptions = {}): MemoryStore {
  const embeddings = options.embeddings ?? localLexicalEmbeddingProvider()

  return {
    async recall({ agentId, divisionId, query, limit, lessonLimit }) {
      const pinned = await db
        .select()
        .from(agentMemory)
        .where(and(eq(agentMemory.agentId, agentId), eq(agentMemory.pinned, true)))
        .orderBy(desc(agentMemory.importance))

      const lessons = await db
        .select()
        .from(agentMemory)
        .where(
          and(
            eq(agentMemory.agentId, agentId),
            eq(agentMemory.kind, 'lesson'),
            eq(agentMemory.pinned, false),
          ),
        )
        .orderBy(desc(agentMemory.createdAt))
        .limit(lessonLimit)

      // Nearest by cosine distance, among entries that actually have a vector.
      // An entry written before embeddings were available has a null embedding and
      // would sort as maximally distant, so it is excluded rather than ranked wrong.
      let nearest: Array<typeof agentMemory.$inferSelect> = []
      try {
        const vector = toVectorLiteral(await embeddings.embed(query))
        nearest = await db
          .select()
          .from(agentMemory)
          .where(
            and(
              eq(agentMemory.agentId, agentId),
              eq(agentMemory.pinned, false),
              sql`${agentMemory.embedding} IS NOT NULL`,
            ),
          )
          .orderBy(sql`${agentMemory.embedding} <=> ${vector}::vector`)
          .limit(limit)
      } catch {
        // Embedding or pgvector unavailable. Fall back to importance and recency,
        // which is worse but still useful, rather than failing the whole run over
        // something optional.
        nearest = await db
          .select()
          .from(agentMemory)
          .where(and(eq(agentMemory.agentId, agentId), eq(agentMemory.pinned, false)))
          .orderBy(desc(agentMemory.importance), desc(agentMemory.createdAt))
          .limit(limit)
      }

      const seen = new Set<string>()
      const out: RecalledMemory[] = []
      for (const row of [...pinned, ...lessons, ...nearest]) {
        if (seen.has(row.id)) continue
        seen.add(row.id)
        out.push({
          id: row.id,
          kind: row.kind,
          content: row.content,
          importance: row.importance,
          pinned: row.pinned,
          createdAt: row.createdAt,
        })
      }
      return out
    },

    async write({ agentId, divisionId, taskId, entries }) {
      if (entries.length === 0) return

      // Embedded on write, so recall can rank without re-embedding the corpus every
      // time. A failure here must not lose the memory: the row is still written, just
      // without a vector, and recall skips it rather than mis-ranking it.
      const vectors = await Promise.all(
        entries.map(async (e) => {
          try {
            return sanitise(await embeddings.embed(e.content))
          } catch {
            return null
          }
        }),
      )

      await db.insert(agentMemory).values(
        entries.map((e, i) => ({
          agentId,
          divisionId,
          taskId,
          kind: e.kind,
          content: e.content,
          importance: e.importance,
          pinned: e.pinned ?? false,
          embedding: vectors[i] ?? null,
          actor: `agent:${agentId}`,
        })),
      )
    },
  }
}

/** True when this store's vectors carry meaning rather than only word overlap. */
export function memoryIsSemantic(options: MemoryStoreOptions = {}): boolean {
  return (options.embeddings ?? localLexicalEmbeddingProvider()).semantic
}

/** Weekly prune: drop low-value memories that have aged out (SPEC.md §Core jobs). */
export async function pruneMemories(
  db: Database,
  { minImportance = 0.2, olderThanDays = 60 } = {},
): Promise<number> {
  const stale = await db
    .select({ id: agentMemory.id })
    .from(agentMemory)
    .where(
      and(
        eq(agentMemory.pinned, false),
        sql`${agentMemory.importance} < ${minImportance}`,
        sql`${agentMemory.createdAt} < now() - make_interval(days => ${olderThanDays})`,
      ),
    )

  if (stale.length === 0) return 0
  await db.delete(agentMemory).where(
    inArray(
      agentMemory.id,
      stale.map((s) => s.id),
    ),
  )
  return stale.length
}

/**
 * Give a vector to memories that do not have one.
 *
 * Needed whenever embeddings are switched on or the provider changes: recall skips
 * entries without a vector, so without this everything written beforehand silently
 * stops being recalled. Run it after changing providers too — vectors from different
 * models are not comparable, and mixing them ranks nonsense highly.
 */
export async function backfillMemoryEmbeddings(
  db: Database,
  options: MemoryStoreOptions & { batchSize?: number; all?: boolean } = {},
): Promise<{ embedded: number; failed: number }> {
  const embeddings = options.embeddings ?? localLexicalEmbeddingProvider()
  const batchSize = options.batchSize ?? 200

  const rows = await db
    .select({ id: agentMemory.id, content: agentMemory.content })
    .from(agentMemory)
    .where(options.all ? sql`true` : sql`${agentMemory.embedding} IS NULL`)
    .limit(batchSize)

  let embedded = 0
  let failed = 0

  for (const row of rows) {
    try {
      const vector = sanitise(await embeddings.embed(row.content))
      await db.update(agentMemory).set({ embedding: vector }).where(eq(agentMemory.id, row.id))
      embedded += 1
    } catch {
      // One bad row must not abandon the rest of the backfill.
      failed += 1
    }
  }

  return { embedded, failed }
}
