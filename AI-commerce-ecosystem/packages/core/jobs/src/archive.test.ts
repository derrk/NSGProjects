/**
 * The archives, against real SQL.
 *
 * Search and export are the two things an operator reaches for when something has
 * already gone wrong, which is the worst time to discover they are subtly incomplete.
 */

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { agentRuns, agents, approvals, divisions, events, tasks } from '@acf/db'
import { createTestDatabase, type TestDatabase } from '@acf/db/testing'

import { loadTaskRecord, searchArchive, taskRecordToMarkdown } from './archive'

let h: TestDatabase

beforeAll(async () => {
  h = await createTestDatabase()
}, 120_000)

afterAll(async () => {
  await h.close()
})

beforeEach(async () => {
  await h.truncate()
})

async function seed(over: { title?: string; input?: unknown; status?: 'done' | 'blocked' } = {}) {
  const [division] = await h.db
    .insert(divisions)
    .values({ name: 'Deadstock', slug: 'deadstock', type: 'pod', status: 'active' })
    .returning()

  const [agent] = await h.db
    .insert(agents)
    .values({ divisionId: division!.id, name: 'Design bay', model: 'claude-sonnet-5-5' })
    .returning()

  const [task] = await h.db
    .insert(tasks)
    .values({
      divisionId: division!.id,
      agentId: agent!.id,
      title: over.title ?? 'Design the nurse mug',
      input: over.input ?? { conceptId: 'c1' },
      output: { designIds: ['d1', 'd2', 'd3'] },
      status: over.status ?? 'blocked',
      source: 'operator',
    })
    .returning()

  const [run] = await h.db
    .insert(agentRuns)
    .values({
      agentId: agent!.id,
      taskId: task!.id,
      divisionId: division!.id,
      status: 'ok',
      attempts: 2,
      tokensIn: 1200,
      tokensOut: 300,
      costCents: 0.734,
    })
    .returning()

  const [approval] = await h.db
    .insert(approvals)
    .values({
      divisionId: division!.id,
      kind: 'design',
      category: 'hand-lettered',
      refTable: 'pod.concepts',
      refId: 'c1',
      summary: 'Powered by caffeine and chaos',
      payload: { variants: 3 },
      taskId: task!.id,
      requestedBy: `agent:${agent!.id}`,
    })
    .returning()

  await h.db.insert(events).values([
    {
      divisionId: division!.id,
      agentId: agent!.id,
      kind: 'pod.planned',
      level: 'info',
      message: 'planned 3 variants',
      refTable: 'tasks',
      refId: task!.id,
    },
    {
      divisionId: division!.id,
      kind: 'approval.requested',
      level: 'info',
      message: 'design awaiting approval',
      refTable: 'approvals',
      refId: approval!.id,
    },
  ])

  return { division: division!, agent: agent!, task: task!, run: run!, approval: approval! }
}

describe('searchArchive', () => {
  it('returns recent tasks with their division and agent', async () => {
    const { task } = await seed()
    const results = await searchArchive(h.db as never)

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      taskId: task.id,
      divisionName: 'Deadstock',
      agentName: 'Design bay',
      source: 'operator',
    })
  })

  it('matches on the task title', async () => {
    await seed({ title: 'Design the nurse mug' })
    expect(await searchArchive(h.db as never, { query: 'nurse' })).toHaveLength(1)
    expect(await searchArchive(h.db as never, { query: 'sweatshirt' })).toHaveLength(0)
  })

  it('matches on text inside the task input', async () => {
    await seed({ title: 'Untitled', input: { brief: 'a sleepy cartoon dog' } })
    expect(await searchArchive(h.db as never, { query: 'sleepy' })).toHaveLength(1)
  })

  it('matches on an approval summary', async () => {
    await seed({ title: 'Untitled' })
    // The operator remembers "the caffeine one", which is text that lives on the
    // approval, not on the task.
    expect(await searchArchive(h.db as never, { query: 'caffeine' })).toHaveLength(1)
  })

  it('is case-insensitive', async () => {
    await seed({ title: 'Design the Nurse Mug' })
    expect(await searchArchive(h.db as never, { query: 'NURSE' })).toHaveLength(1)
  })

  it('filters by division', async () => {
    const { division } = await seed()
    const [other] = await h.db
      .insert(divisions)
      .values({ name: 'Other', slug: 'other', type: 'generic' })
      .returning()

    expect(await searchArchive(h.db as never, { divisionId: division.id })).toHaveLength(1)
    expect(await searchArchive(h.db as never, { divisionId: other!.id })).toHaveLength(0)
  })

  it('filters by status', async () => {
    await seed({ status: 'blocked' })
    expect(await searchArchive(h.db as never, { status: 'blocked' })).toHaveLength(1)
    expect(await searchArchive(h.db as never, { status: 'done' })).toHaveLength(0)
  })

  it('honours the limit', async () => {
    const { division, agent } = await seed()
    await h.db.insert(tasks).values(
      Array.from({ length: 5 }, (_, i) => ({
        divisionId: division.id,
        agentId: agent.id,
        title: `extra ${i}`,
        input: {},
        source: 'schedule' as const,
      })),
    )

    expect(await searchArchive(h.db as never, { limit: 3 })).toHaveLength(3)
  })
})

describe('loadTaskRecord', () => {
  it('gathers the whole chain under one task', async () => {
    const { task } = await seed()
    const record = await loadTaskRecord(h.db as never, task.id)

    expect(record).not.toBeNull()
    expect(record!.divisionName).toBe('Deadstock')
    expect(record!.runs).toHaveLength(1)
    expect(record!.approvals).toHaveLength(1)
    // Events reference whatever they were about — the task, the run, the approval —
    // so all of them belong to this record, not only the ones naming the task.
    expect(record!.events.length).toBeGreaterThanOrEqual(2)
  })

  it('returns null for a task that does not exist', async () => {
    expect(
      await loadTaskRecord(h.db as never, '00000000-0000-0000-0000-000000000000'),
    ).toBeNull()
  })
})

describe('taskRecordToMarkdown', () => {
  async function markdown() {
    const { task } = await seed()
    const record = await loadTaskRecord(h.db as never, task.id)
    return taskRecordToMarkdown(record!)
  }

  it('opens with front matter an Obsidian vault can index', async () => {
    const md = await markdown()
    expect(md.startsWith('---\n')).toBe(true)
    expect(md).toMatch(/^title: "Design the nurse mug"$/m)
    expect(md).toMatch(/^division: "Deadstock"$/m)
    expect(md).toMatch(/^tags: \[acf, task\]$/m)
  })

  it('includes the input, the output and the approval payload verbatim', async () => {
    const md = await markdown()
    expect(md).toContain('"conceptId": "c1"')
    expect(md).toContain('"designIds"')
    expect(md).toContain('Powered by caffeine and chaos')
  })

  it('labels cost as an estimate rather than a bill', async () => {
    const md = await markdown()
    // A figure copied into someone's notes outlives the context that would have told
    // them it was modelled, so the export carries the caveat with it.
    expect(md).toMatch(/est\. cost \(cents\)/)
    expect(md).toMatch(/ESTIMATE from a model price table, not a billed amount/)
    expect(md).toContain('0.7340')
  })

  it('records who decided what, and whether it was automatic', async () => {
    const md = await markdown()
    expect(md).toMatch(/decided automatically: no/)
    expect(md).toMatch(/requested by: agent:/)
  })

  it('includes the event log', async () => {
    const md = await markdown()
    expect(md).toContain('pod.planned')
    expect(md).toContain('planned 3 variants')
  })

  it('does not invent sections for a bare task', async () => {
    const [division] = await h.db
      .insert(divisions)
      .values({ name: 'Bare', slug: 'bare', type: 'generic' })
      .returning()
    const [task] = await h.db
      .insert(tasks)
      .values({ divisionId: division!.id, title: 'Nothing happened', input: {}, source: 'operator' })
      .returning()

    const md = taskRecordToMarkdown((await loadTaskRecord(h.db as never, task!.id))!)

    expect(md).toContain('# Nothing happened')
    expect(md).toContain('_none_')
    expect(md).toContain('_nothing_')
    // An absent output must not render as the string "undefined".
    expect(md).not.toContain('undefined')
  })
})
