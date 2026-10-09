/**
 * The week-1 acceptance path, end to end against real SQL:
 *
 *   a division created from the module  ->  a concept row in
 *   ->  3 PNGs in storage  ->  a `design` approval the operator can decide
 *
 * PGlite applies the actual generated migrations, so the enums, foreign keys, the
 * `pod` schema boundary and the partial unique index on approvals are all genuinely
 * exercised. Everything that costs money — fal, Anthropic, Supabase Storage — is
 * mocked.
 */

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { requestApproval } from '@acf/core/approvals'
import type { ApprovalOutcome, GateDeps } from '@acf/core/approvals'
import { runAgent } from '@acf/core/runtime'
import type { AgentRecord, DivisionRecord, RunLoopDeps, TaskRecord } from '@acf/core/runtime'
import { createTestDatabase, POD_MIGRATIONS, type TestDatabase } from '@acf/db/testing'
import { agentRuns, approvalRules, approvals, divisions, events, ledger, tasks } from '@acf/db'
import { createMockModelClient } from '@acf/integrations/anthropic'
import { createMockFalPipeline } from '@acf/integrations/fal'
import { createMockStorage } from '@acf/integrations/storage'

import { concepts, designs, niches } from '../../schema/index'
import { createDesignerAgent } from './run'

let h: TestDatabase

beforeAll(async () => {
  h = await createTestDatabase({ moduleMigrations: [POD_MIGRATIONS] })
}, 120_000)

afterAll(async () => {
  await h.close()
})

beforeEach(async () => {
  await h.truncate()
  sentEvents.length = 0
})

const sentEvents: Array<{ name: string; data: Record<string, unknown> }> = []

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

async function seedConcept(over: Record<string, unknown> = {}) {
  const [division] = await h.db
    .insert(divisions)
    .values({ name: 'Deadstock', slug: 'deadstock', type: 'pod', status: 'active' })
    .returning()

  const [niche] = await h.db
    .insert(niches)
    .values({ divisionId: division!.id, name: 'Dog people', audience: 'dog owners' })
    .returning()

  const [concept] = await h.db
    .insert(concepts)
    .values({
      divisionId: division!.id,
      nicheId: niche!.id,
      title: 'Professional dog tired',
      promptBrief: 'A sleepy cartoon dog slumped over a coffee cup.',
      style: 'hand-lettered',
      products: ['mug_11oz'],
      status: 'approved',
      ...over,
    })
    .returning()

  return { division: division!, concept: concept! }
}

function agentRecord(divisionId: string): AgentRecord {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    divisionId,
    name: 'Design bay',
    purpose: 'Turn concepts into variants',
    moduleAgentKey: 'designer',
    model: 'claude-sonnet-5-5',
    systemPrompt: '',
    tools: ['generate_image', 'requestApproval'],
    autonomy: 'propose',
    maxSteps: 12,
  }
}

/** A model plan with three variants, text on or off. */
function plan(hasText: boolean) {
  return {
    variants: [1, 2, 3].map((n) => ({
      prompt: `variant ${n} prompt`,
      composition: `composition ${n}`,
      hasText,
      textToRender: hasText ? 'Professional Dog Tired' : '',
      negativePrompt: '',
    })),
  }
}

const passingCheck = { matches: true, observedText: 'Professional Dog Tired', problem: '' }
const failingCheck = { matches: false, observedText: 'Profesional Dog Tired', problem: 'misspelled' }

function gateDeps(): GateDeps {
  return {
    approvals: {
      async findByRef(divisionId, kind, refTable, refId) {
        const rows = await h.db.select().from(approvals).where(eq(approvals.refId, refId))
        const match = rows.find(
          (r) =>
            r.divisionId === divisionId &&
            r.kind === kind &&
            r.refTable === refTable &&
            r.decision !== 'rejected',
        )
        return (match ?? null) as never
      },
      async insert(row) {
        const [inserted] = await h.db
          .insert(approvals)
          .values(row as never)
          .returning()
        return inserted as never
      },
      async findById(id) {
        const [row] = await h.db.select().from(approvals).where(eq(approvals.id, id))
        return (row ?? null) as never
      },
      async update(id, patch) {
        const [row] = await h.db
          .update(approvals)
          .set(patch as never)
          .where(eq(approvals.id, id))
          .returning()
        return row as never
      },
    },
    rules: {
      async get(divisionId, kind, category) {
        const rows = await h.db.select().from(approvalRules)
        return (rows.find(
          (r) => r.divisionId === divisionId && r.kind === kind && r.category === category,
        ) ?? null) as never
      },
      async upsert(rule) {
        await h.db
          .insert(approvalRules)
          .values(rule as never)
          .onConflictDoUpdate({
            target: [approvalRules.divisionId, approvalRules.kind, approvalRules.category],
            set: rule as never,
          })
        return rule
      },
    },
    events: {
      async emit(event) {
        await h.db.insert(events).values(event as never)
      },
    },
    bus: {
      async send(name, data) {
        sentEvents.push({ name, data })
      },
    },
    clock: { now: () => new Date() },
    newId: () => crypto.randomUUID(),
  }
}

async function runDesigner(opts: {
  division: { id: string; name: string }
  conceptId: string
  modelQueue: unknown[]
  withTask?: boolean
}) {
  const images = createMockFalPipeline()
  const storage = createMockStorage()
  const gate = gateDeps()
  const ledgerPosts: Array<{ amountCents: number }> = []
  const memoryWrites: Array<{ content: string }> = []

  const agent = agentRecord(opts.division.id)
  const division: DivisionRecord = { id: opts.division.id, name: opts.division.name, type: 'pod' }

  let task: TaskRecord | null = null
  if (opts.withTask) {
    // A real row: approvals.task_id is a foreign key, so an invented id would fail.
    const [row] = await h.db
      .insert(tasks)
      .values({
        divisionId: division.id,
        title: 'Design concept',
        input: { conceptId: opts.conceptId },
        source: 'event',
      })
      .returning()
    task = {
      id: row!.id,
      divisionId: division.id,
      agentId: agent.id,
      title: row!.title,
      input: row!.input,
      source: 'event',
    }
  }

  const deps: RunLoopDeps = {
    runs: {
      async start(record) {
        const [row] = await h.db
          .insert(agentRuns)
          .values({ ...record, agentId: null, taskId: null } as never)
          .returning()
        return row as never
      },
      async finish(id, patch) {
        const [row] = await h.db
          .update(agentRuns)
          .set(patch as never)
          .where(eq(agentRuns.id, id))
          .returning()
        return row as never
      },
    },
    events: {
      async emit(event) {
        await h.db.insert(events).values({ ...event, agentId: null } as never)
      },
    },
    clock: { now: () => new Date() },
    sleeper: { async sleep() {} },
    ledger: {
      async post(entry) {
        ledgerPosts.push({ amountCents: entry.amountCents })
        await h.db.insert(ledger).values(entry as never)
      },
    },
    memory: {
      async recall() {
        return []
      },
      async write(input) {
        memoryWrites.push(...input.entries.map((e) => ({ content: e.content })))
      },
    },
    requestApproval: (req) => requestApproval(req as never, gate) as Promise<ApprovalOutcome>,
  }

  const output = await runAgent(
    createDesignerAgent({
      db: h.db as never,
      model: createMockModelClient(opts.modelQueue),
      images,
      storage,
      today: () => '2026-10-09',
    }),
    { agent, division, task, input: { conceptId: opts.conceptId } },
    deps,
  )

  return { output, images, storage, ledgerPosts, memoryWrites }
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

describe('Designer: concept to approval', () => {
  it('turns one concept into three stored designs and one approval', async () => {
    const { division, concept } = await seedConcept()

    const { output, images, storage } = await runDesigner({
      division,
      conceptId: concept.id,
      modelQueue: [plan(false)],
    })

    expect(output.status).toBe('approval_requested')
    expect(output.designIds).toHaveLength(3)
    expect(output.abandonedVariants).toEqual([])

    expect(images.calls.generate).toHaveLength(3)
    expect([...storage.objects.keys()]).toEqual([
      `designs/${concept.id}/1.png`,
      `designs/${concept.id}/2.png`,
      `designs/${concept.id}/3.png`,
    ])

    const rows = await h.db.select().from(designs).where(eq(designs.conceptId, concept.id))
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.variantNo).sort()).toEqual([1, 2, 3])
    expect(rows.every((r) => r.status === 'pending_approval')).toBe(true)

    const [approval] = await h.db.select().from(approvals)
    expect(approval).toMatchObject({
      kind: 'design',
      decision: 'pending',
      category: 'hand-lettered',
      refTable: 'pod.concepts',
      divisionId: division.id,
    })
    expect((approval!.payload as { variants: unknown[] }).variants).toHaveLength(3)
  })

  it('downloads every generated image rather than trusting the fal CDN', async () => {
    const { division, concept } = await seedConcept()
    const { images } = await runDesigner({
      division,
      conceptId: concept.id,
      modelQueue: [plan(false)],
    })
    expect(images.calls.download).toHaveLength(3)
  })

  it('moves the concept to designed', async () => {
    const { division, concept } = await seedConcept()
    await runDesigner({ division, conceptId: concept.id, modelQueue: [plan(false)] })

    const [row] = await h.db.select().from(concepts).where(eq(concepts.id, concept.id))
    expect(row!.status).toBe('designed')
  })

  it('parks the pipeline rather than resuming it', async () => {
    const { division, concept } = await seedConcept()
    await runDesigner({ division, conceptId: concept.id, modelQueue: [plan(false)] })

    expect(sentEvents.map((e) => e.name)).toEqual(['approval.requested'])
    expect(sentEvents.map((e) => e.name)).not.toContain('design.approved')
  })

  it('records the run and posts its API cost to the ledger', async () => {
    const { division, concept } = await seedConcept()
    const { ledgerPosts } = await runDesigner({
      division,
      conceptId: concept.id,
      modelQueue: [plan(false)],
    })

    const [run] = await h.db.select().from(agentRuns)
    expect(run).toMatchObject({ status: 'ok', attempts: 1, divisionId: division.id })
    expect(run!.costCents).toBeGreaterThan(0)

    // Spend is posted, not merely counted, so the Company screen and the division
    // spend cap read the same number. Negative: a cost reduces the company.
    expect(ledgerPosts).toHaveLength(1)
    expect(ledgerPosts[0]!.amountCents).toBeLessThan(0)

    const [row] = await h.db.select().from(ledger)
    expect(row).toMatchObject({ kind: 'api_cost', divisionId: division.id })
  })

  it('links designs back to the task that produced them', async () => {
    const { division, concept } = await seedConcept()
    await runDesigner({
      division,
      conceptId: concept.id,
      modelQueue: [plan(false)],
      withTask: true,
    })

    const [taskRow] = await h.db.select().from(tasks)
    const rows = await h.db.select().from(designs)
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.taskId === taskRow!.id)).toBe(true)
  })

  it('never upscales before the operator has chosen', async () => {
    const { division, concept } = await seedConcept()
    const { images } = await runDesigner({
      division,
      conceptId: concept.id,
      modelQueue: [plan(false)],
    })

    // Upscaling all three when two will be discarded is the most expensive mistake
    // available in this pipeline.
    expect(images.calls.upscale).toHaveLength(0)
    expect(images.calls.removeBackground).toHaveLength(0)
  })
})

describe('Designer lettering guardrail', () => {
  it('regenerates when the lettering is wrong and accepts the retry', async () => {
    const { division, concept } = await seedConcept()

    const { output, images } = await runDesigner({
      division,
      conceptId: concept.id,
      modelQueue: [plan(true), failingCheck, passingCheck, passingCheck, passingCheck],
    })

    expect(output.designIds).toHaveLength(3)
    expect(images.calls.generate).toHaveLength(4)
  })

  it('abandons a variant whose lettering never comes out right', async () => {
    const { division, concept } = await seedConcept()

    const { output, memoryWrites } = await runDesigner({
      division,
      conceptId: concept.id,
      modelQueue: [
        plan(true),
        failingCheck,
        failingCheck,
        plan(true), // the simplify call, after the second failure
        failingCheck,
        passingCheck,
        passingCheck,
      ],
    })

    expect(output.abandonedVariants).toEqual([1])
    expect(output.designIds).toHaveLength(2)
    expect(output.status).toBe('approval_requested')
    // What it learned is worth keeping for next time.
    expect(memoryWrites.some((m) => /would not render/.test(m.content))).toBe(true)
  })

  it('marks the concept needs_human instead of shipping a misspelled design', async () => {
    const { division, concept } = await seedConcept()

    const { output } = await runDesigner({
      division,
      conceptId: concept.id,
      modelQueue: [
        plan(true),
        ...Array.from({ length: 3 }).flatMap(() => [
          failingCheck,
          failingCheck,
          plan(true),
          failingCheck,
        ]),
      ],
    })

    expect(output.status).toBe('needs_human')
    expect(output.abandonedVariants).toEqual([1, 2, 3])

    const [row] = await h.db.select().from(concepts).where(eq(concepts.id, concept.id))
    expect(row!.status).toBe('needs_human')

    // Nothing queued for the operator, because there is nothing to approve.
    expect(await h.db.select().from(approvals)).toHaveLength(0)
  })

  it('skips the proofreading call entirely for a design with no lettering', async () => {
    const { division, concept } = await seedConcept()
    // Only the plan is queued; any text check would exhaust the queue and throw.
    const { output } = await runDesigner({
      division,
      conceptId: concept.id,
      modelQueue: [plan(false)],
    })
    expect(output.designIds).toHaveLength(3)
  })
})

describe('Designer refusals and idempotency', () => {
  it('refuses a concept that does not exist, without retrying', async () => {
    const { division } = await seedConcept()

    await expect(
      runDesigner({
        division,
        conceptId: '33333333-3333-3333-3333-333333333333',
        modelQueue: [plan(false)],
      }),
    ).rejects.toThrow(/does not exist/)

    const [run] = await h.db.select().from(agentRuns)
    expect(run).toMatchObject({ status: 'error', attempts: 1 })
  })

  it('refuses a concept belonging to another division', async () => {
    const { concept } = await seedConcept()
    const [other] = await h.db
      .insert(divisions)
      .values({ name: 'Other', slug: 'other', type: 'pod' })
      .returning()

    // Division scoping is enforced in the query, not just in the prompt.
    await expect(
      runDesigner({ division: other!, conceptId: concept.id, modelQueue: [plan(false)] }),
    ).rejects.toThrow(/does not exist in this division/)
  })

  it('refuses to design a concept flagged ip_risk=high', async () => {
    const { division, concept } = await seedConcept({ ipRisk: 'high' })

    await expect(
      runDesigner({ division, conceptId: concept.id, modelQueue: [plan(false)] }),
    ).rejects.toThrow(/ip_risk=high/)

    expect(await h.db.select().from(designs)).toHaveLength(0)
  })

  it('does not pay to regenerate when the same concept is designed twice', async () => {
    const { division, concept } = await seedConcept()
    await runDesigner({ division, conceptId: concept.id, modelQueue: [plan(false)] })

    // An empty model queue is the assertion: a second run that calls the model at all
    // would throw. A redelivered event must not cost money.
    const second = await runDesigner({ division, conceptId: concept.id, modelQueue: [] })

    expect(second.output.status).toBe('already_requested')
    expect(second.images.calls.generate).toHaveLength(0)
    expect(await h.db.select().from(approvals)).toHaveLength(1)
    expect(await h.db.select().from(designs)).toHaveLength(3)
  })
})
