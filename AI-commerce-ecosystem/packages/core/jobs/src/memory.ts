import { and, desc, eq, or, sql } from 'drizzle-orm'

import type { MemoryStore } from '@acf/core/runtime'
import { agentMemory, type Database } from '@acf/db'

/**
 * Agent memory, backed by `agent_memory`.
 *
 * WEEK 1 LIMITATION, stated plainly: recall is NOT yet similarity search. Nothing
 * computes embeddings, so the `embedding` column is null and cosine distance would
 * rank everything equally. Until the embedding tool lands, recall returns the pinned
 * entries, the most recent lessons, and the most recent entries overall — which is a
 * genuinely useful subset and, more importantly, is not pretending to be relevance
 * ranking when it is really recency.
 *
 * The signature is already the one similarity search needs, so adding it later
 * changes this file and nothing else.
 */
export function memoryStore(db: Database): MemoryStore {
  return {
    async recall({ agentId, limit, lessonLimit }) {
      // Pinned first: SPEC.md says these always load, whatever the ranking says.
      const pinned = await db
        .select()
        .from(agentMemory)
        .where(and(eq(agentMemory.agentId, agentId), eq(agentMemory.pinned, true)))
        .orderBy(desc(agentMemory.importance))

      // Lessons regardless of similarity — a lesson is worth loading even when it
      // does not resemble today's task.
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

      const recent = await db
        .select()
        .from(agentMemory)
        .where(
          and(
            eq(agentMemory.agentId, agentId),
            eq(agentMemory.pinned, false),
            or(
              sql`${agentMemory.kind} <> 'lesson'`,
              sql`true`,
            ),
          ),
        )
        .orderBy(desc(agentMemory.importance), desc(agentMemory.createdAt))
        .limit(limit)

      const seen = new Set<string>()
      const out = []
      for (const row of [...pinned, ...lessons, ...recent]) {
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
      await db.insert(agentMemory).values(
        entries.map((e) => ({
          agentId,
          divisionId,
          taskId,
          kind: e.kind,
          content: e.content,
          importance: e.importance,
          pinned: e.pinned ?? false,
          // Null until the embedding tool exists; recall does not rank on it yet.
          embedding: null,
          actor: `agent:${agentId}`,
        })),
      )
    },
  }
}

/** Weekly prune: drop low-value memories that have aged out (SPEC.md §Core jobs). */
export async function pruneMemories(
  db: Database,
  { minImportance = 0.2, olderThanDays = 60 } = {},
): Promise<void> {
  await db
    .delete(agentMemory)
    .where(
      and(
        eq(agentMemory.pinned, false),
        sql`${agentMemory.importance} < ${minImportance}`,
        sql`${agentMemory.createdAt} < now() - make_interval(days => ${olderThanDays})`,
      ),
    )
}
