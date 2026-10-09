/**
 * Agent memory, against real Postgres with pgvector.
 *
 * Similarity ranking is the whole point of this file, and it cannot be tested with a
 * fake: the ordering comes from the `<=>` operator, not from our code.
 */

import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { agentMemory, agents, divisions } from '@acf/db'
import { createTestDatabase, type TestDatabase } from '@acf/db/testing'

import { memoryStore, pruneMemories } from './memory'

let h: TestDatabase
let divisionId: string
let agentId: string

beforeAll(async () => {
  h = await createTestDatabase()
}, 120_000)

afterAll(async () => {
  await h.close()
})

beforeEach(async () => {
  await h.truncate()
  const [division] = await h.db
    .insert(divisions)
    .values({ name: 'POD', slug: 'pod', type: 'pod', status: 'active' })
    .returning()
  const [agent] = await h.db
    .insert(agents)
    .values({ divisionId: division!.id, name: 'Design bay', model: 'claude-sonnet-5-5' })
    .returning()
  divisionId = division!.id
  agentId = agent!.id
})

function store() {
  return memoryStore(h.db as never)
}

async function remember(
  content: string,
  over: { kind?: 'decision' | 'result' | 'lesson' | 'fact'; importance?: number; pinned?: boolean } = {},
) {
  await store().write({
    agentId,
    divisionId,
    taskId: null,
    entries: [{ kind: over.kind ?? 'fact', content, importance: over.importance ?? 0.5, ...(over.pinned === undefined ? {} : { pinned: over.pinned }) }],
  })
}

describe('write', () => {
  it('stores the entry with an embedding', async () => {
    await remember('Ideogram mangles phrases longer than six words')

    const [row] = await h.db.select().from(agentMemory)
    expect(row!.content).toContain('Ideogram')
    // Without a vector on write, recall can never rank by distance.
    expect(row!.embedding).not.toBeNull()
  })

  it('still stores the memory when embedding fails', async () => {
    const broken = memoryStore(h.db as never, {
      embeddings: {
        name: 'broken',
        semantic: false,
        embed: async () => {
          throw new Error('provider is down')
        },
      },
    })

    await broken.write({
      agentId,
      divisionId,
      taskId: null,
      entries: [{ kind: 'lesson', content: 'worth keeping', importance: 0.9 }],
    })

    // Losing what an agent learned because an optional service was down would be a
    // bad trade.
    const [row] = await h.db.select().from(agentMemory)
    expect(row!.content).toBe('worth keeping')
    expect(row!.embedding).toBeNull()
  })

  it('writes nothing for an empty list', async () => {
    await store().write({ agentId, divisionId, taskId: null, entries: [] })
    expect(await h.db.select().from(agentMemory)).toHaveLength(0)
  })
})

describe('recall', () => {
  it('ranks by similarity to the query, not by recency', async () => {
    // Written oldest-first, so recency would return the filament one.
    await remember('mug designs for nurses sell well in december')
    await remember('filament spool storage humidity control')

    const out = await store().recall({
      agentId,
      divisionId,
      query: 'nurse mug design',
      limit: 1,
      lessonLimit: 0,
    })

    expect(out).toHaveLength(1)
    expect(out[0]!.content).toContain('nurses')
  })

  it('always loads pinned entries, whatever the ranking thinks', async () => {
    await remember('completely unrelated pinned note about shipping', { pinned: true })
    await remember('nurse mug design note')

    const out = await store().recall({
      agentId,
      divisionId,
      query: 'nurse mug',
      limit: 1,
      lessonLimit: 0,
    })

    expect(out.some((m) => m.pinned)).toBe(true)
  })

  it('loads recent lessons regardless of similarity', async () => {
    await remember('a lesson about something entirely different', { kind: 'lesson' })
    await remember('nurse mug design note')

    const out = await store().recall({
      agentId,
      divisionId,
      query: 'nurse mug',
      limit: 1,
      lessonLimit: 3,
    })

    // A lesson about a past mistake is worth loading exactly when it does not
    // resemble today's task, which is when ranking would drop it.
    expect(out.some((m) => m.kind === 'lesson')).toBe(true)
  })

  it('does not return the same entry twice', async () => {
    await remember('pinned lesson', { kind: 'lesson', pinned: true })

    const out = await store().recall({
      agentId,
      divisionId,
      query: 'lesson',
      limit: 5,
      lessonLimit: 5,
    })

    expect(out).toHaveLength(1)
  })

  it('skips entries that have no embedding rather than mis-ranking them', async () => {
    await remember('has a vector and mentions nurses')
    await h.db.insert(agentMemory).values({
      agentId,
      divisionId,
      kind: 'fact',
      content: 'no vector at all',
      importance: 0.5,
      embedding: null,
    })

    const out = await store().recall({
      agentId,
      divisionId,
      query: 'nurses',
      limit: 5,
      lessonLimit: 0,
    })

    // A null embedding sorts as maximally distant, which would put irrelevant old
    // entries at the top rather than the bottom.
    expect(out.map((m) => m.content)).toEqual(['has a vector and mentions nurses'])
  })

  it('keeps one agent’s memories out of another’s', async () => {
    const [other] = await h.db
      .insert(agents)
      .values({ divisionId, name: 'Store ops', model: 'claude-sonnet-5-5' })
      .returning()

    await remember('belongs to the designer')

    const out = await store().recall({
      agentId: other!.id,
      divisionId,
      query: 'designer',
      limit: 5,
      lessonLimit: 3,
    })

    expect(out).toHaveLength(0)
  })

  it('returns nothing when the agent has remembered nothing', async () => {
    expect(
      await store().recall({ agentId, divisionId, query: 'anything', limit: 5, lessonLimit: 3 }),
    ).toEqual([])
  })
})

describe('pruneMemories', () => {
  async function age(content: string, days: number) {
    await h.db
      .update(agentMemory)
      .set({ createdAt: sql`now() - make_interval(days => ${days})` })
      .where(eq(agentMemory.content, content))
  }

  it('drops low-importance memories that have aged out', async () => {
    await remember('trivial and old', { importance: 0.1 })
    await age('trivial and old', 90)

    expect(await pruneMemories(h.db as never)).toBe(1)
    expect(await h.db.select().from(agentMemory)).toHaveLength(0)
  })

  it('keeps an important old memory', async () => {
    await remember('important and old', { importance: 0.9 })
    await age('important and old', 90)

    expect(await pruneMemories(h.db as never)).toBe(0)
  })

  it('keeps a trivial recent memory', async () => {
    await remember('trivial but recent', { importance: 0.1 })
    expect(await pruneMemories(h.db as never)).toBe(0)
  })

  it('never drops a pinned memory, however old and trivial', async () => {
    await remember('pinned, old, trivial', { importance: 0.01, pinned: true })
    await age('pinned, old, trivial', 365)

    // Pinning is the operator saying "keep this"; a scheduled job must not overrule it.
    expect(await pruneMemories(h.db as never)).toBe(0)
  })
})
