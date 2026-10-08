/**
 * End-to-end test for the week-1 acceptance criterion:
 * "a concept row in -> 3 PNGs in storage -> a `design` approval row".
 *
 * Runs against REAL SQL. PGlite is an in-process Postgres, and the schema is applied
 * from the actual generated migration, so the enums, NOT NULL constraints, foreign
 * keys and the partial unique index on approvals are all genuinely exercised — a
 * hand-rolled fake would have proved none of that.
 *
 * Everything that costs money (fal, Anthropic, Supabase Storage) is mocked.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { requestApproval } from '@acf/core/approvals'
import type { ApprovalOutcome, GateDeps } from '@acf/core/approvals'
import { runAgent } from '@acf/core/runtime'
import type { AgentRunRecord, AgentRunStore } from '@acf/core/runtime'
import * as schema from '@acf/db/schema'
import { createMockModelClient } from '@acf/integrations/anthropic'
import { createMockFalPipeline } from '@acf/integrations/fal'
import { createMockStorage } from '@acf/integrations/storage'

import { createDesignerAgent } from './run'

const here = dirname(fileURLToPath(import.meta.url))
const MIGRATION = resolve(here, '../../../db/drizzle/0000_talented_red_ghost.sql')

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

// ~1.5s to construct, so once per FILE. TRUNCATE between tests is ~3ms.
beforeAll(async () => {
  client = new PGlite()
  db = drizzle(client, { schema }) as unknown as ReturnType<typeof drizzle<typeof schema>>
  await client.exec(readFileSync(MIGRATION, 'utf8'))
}, 60_000)

afterAll(async () => {
  await client.close()
})

const TABLES = [
  'approvals',
  'approval_rules',
  'agent_runs',
  'events',
  'designs',
  'concepts',
  'niches',
  'shops',
]

beforeEach(async () => {
  await client.exec(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE;`)
})

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

async function seedConcept(over: Partial<typeof schema.concepts.$inferInsert> = {}) {
  const [shop] = await db
    .insert(schema.shops)
    .values({ name: 'Deadstock', slug: 'deadstock', audience: 'gift buyers' })
    .returning()

  const [niche] = await db
    .insert(schema.niches)
    .values({ name: 'Dog people', shopId: shop!.id, audience: 'dog owners' })
    .returning()

  const [concept] = await db
    .insert(schema.concepts)
    .values({
      shopId: shop!.id,
      nicheId: niche!.id,
      title: 'Professional dog tired',
      promptBrief: 'A sleepy cartoon dog slumped over a coffee cup.',
      style: 'hand-lettered',
      products: ['mug_11oz'],
      status: 'proposed',
      ...over,
    })
    .returning()

  return { shop: shop!, niche: niche!, concept: concept! }
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

/** A run store backed by the real agent_runs table. */
function runStore(): AgentRunStore {
  return {
    async start(record) {
      const [row] = await db
        .insert(schema.agentRuns)
        .values({ ...record, input: record.input, output: record.output })
        .returning()
      return row as AgentRunRecord
    },
    async finish(id, patch) {
      const [row] = await db
        .update(schema.agentRuns)
        .set(patch as never)
        .where(eq(schema.agentRuns.id, id))
        .returning()
      return row as AgentRunRecord
    },
  }
}

const sentEvents: Array<{ name: string; data: Record<string, unknown> }> = []

function gateDeps(): GateDeps {
  return {
    approvals: {
      async findByRef(kind, refId) {
        const rows = await db
          .select()
          .from(schema.approvals)
          .where(eq(schema.approvals.refId, refId))
        const match = rows.find((r) => r.kind === kind && r.decision !== 'rejected')
        return (match ?? null) as never
      },
      async insert(row) {
        const [inserted] = await db
          .insert(schema.approvals)
          .values(row as never)
          .returning()
        return inserted as never
      },
      async findById(id) {
        const [row] = await db.select().from(schema.approvals).where(eq(schema.approvals.id, id))
        return (row ?? null) as never
      },
      async update(id, patch) {
        const [row] = await db
          .update(schema.approvals)
          .set(patch as never)
          .where(eq(schema.approvals.id, id))
          .returning()
        return row as never
      },
    },
    rules: {
      async get(kind, category) {
        const rows = await db.select().from(schema.approvalRules)
        return (rows.find((r) => r.kind === kind && r.category === category) ?? null) as never
      },
      async upsert(rule) {
        await db
          .insert(schema.approvalRules)
          .values(rule as never)
          .onConflictDoUpdate({
            target: [schema.approvalRules.kind, schema.approvalRules.category],
            set: rule as never,
          })
        return rule
      },
    },
    events: {
      async emit(event) {
        await db.insert(schema.events).values(event)
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
  conceptId: string
  modelQueue: unknown[]
  fal?: ReturnType<typeof createMockFalPipeline>
  storage?: ReturnType<typeof createMockStorage>
}) {
  const images = opts.fal ?? createMockFalPipeline()
  const storage = opts.storage ?? createMockStorage()
  const gate = gateDeps()

  const agent = createDesignerAgent({
    db: db as never,
    model: createMockModelClient(opts.modelQueue),
    images,
    storage,
    today: () => '2026-10-09',
  })

  const output = await runAgent(agent, { conceptId: opts.conceptId }, 'event', {
    runs: runStore(),
    events: { async emit(e) { await db.insert(schema.events).values(e) } },
    clock: { now: () => new Date() },
    sleeper: { async sleep() {} },
    requestApproval: (req) => requestApproval(req as never, gate) as Promise<ApprovalOutcome>,
  })

  return { output, images, storage }
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

describe('Designer agent, concept to approval', () => {
  beforeEach(() => {
    sentEvents.length = 0
  })

  it('turns one concept into three stored designs and one approval', async () => {
    const { concept } = await seedConcept()

    const { output, images, storage } = await runDesigner({
      conceptId: concept.id,
      modelQueue: [plan(false)],
    })

    expect(output.status).toBe('approval_requested')
    expect(output.designIds).toHaveLength(3)
    expect(output.abandonedVariants).toEqual([])

    // Three images generated and three files stored.
    expect(images.calls.generate).toHaveLength(3)
    expect(storage.objects.size).toBe(3)
    expect([...storage.objects.keys()]).toEqual([
      `designs/${concept.id}/1.png`,
      `designs/${concept.id}/2.png`,
      `designs/${concept.id}/3.png`,
    ])

    // Three design rows, numbered 1..3, all pending approval.
    const rows = await db.select().from(schema.designs).where(eq(schema.designs.conceptId, concept.id))
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.variantNo).sort()).toEqual([1, 2, 3])
    expect(rows.every((r) => r.status === 'pending_approval')).toBe(true)
    expect(rows.every((r) => r.imageUrl.startsWith('https://mock.storage.local/'))).toBe(true)

    // Exactly one design approval, holding all three variants.
    const [approval] = await db.select().from(schema.approvals)
    expect(approval).toMatchObject({ kind: 'design', decision: 'pending', category: 'hand-lettered' })
    expect((approval!.payload as { variants: unknown[] }).variants).toHaveLength(3)
  })

  it('downloads every generated image rather than trusting the fal CDN', async () => {
    const { concept } = await seedConcept()
    const { images } = await runDesigner({ conceptId: concept.id, modelQueue: [plan(false)] })
    expect(images.calls.download).toHaveLength(3)
  })

  it('moves the concept to designed', async () => {
    const { concept } = await seedConcept()
    await runDesigner({ conceptId: concept.id, modelQueue: [plan(false)] })

    const [row] = await db.select().from(schema.concepts).where(eq(schema.concepts.id, concept.id))
    expect(row!.status).toBe('designed')
  })

  it('emits the approval.requested event that parks the pipeline', async () => {
    const { concept } = await seedConcept()
    await runDesigner({ conceptId: concept.id, modelQueue: [plan(false)] })

    expect(sentEvents.map((e) => e.name)).toEqual(['approval.requested'])
    expect(sentEvents.map((e) => e.name)).not.toContain('design.approved')
  })

  it('records the run, its attempts and its cost', async () => {
    const { concept } = await seedConcept()
    await runDesigner({ conceptId: concept.id, modelQueue: [plan(false)] })

    const [run] = await db.select().from(schema.agentRuns)
    expect(run).toMatchObject({ agent: 'designer', status: 'ok', trigger: 'event', attempts: 1 })
    expect(run!.tokensIn).toBeGreaterThan(0)
    expect(run!.costCents).toBeGreaterThan(0)
  })

  it('picks the lettering model only when the design has text', async () => {
    const { concept } = await seedConcept()

    const withText = await runDesigner({
      conceptId: concept.id,
      modelQueue: [plan(true), passingCheck, passingCheck, passingCheck],
    })
    expect(withText.images.calls.generate.every((c) => c.hasText)).toBe(true)
    expect(withText.images.calls.generate[0]!.width).toBe(1024)
  })

  it('never upscales before the operator has chosen', async () => {
    const { concept } = await seedConcept()
    const { images } = await runDesigner({ conceptId: concept.id, modelQueue: [plan(false)] })

    // Upscaling all three when two will be discarded is the most expensive mistake
    // available in this pipeline.
    expect(images.calls.upscale).toHaveLength(0)
    expect(images.calls.removeBackground).toHaveLength(0)
  })
})

describe('Designer lettering guardrail', () => {
  beforeEach(() => {
    sentEvents.length = 0
  })

  it('regenerates when the lettering is wrong and accepts the retry', async () => {
    const { concept } = await seedConcept()

    const { output, images } = await runDesigner({
      conceptId: concept.id,
      modelQueue: [
        plan(true),
        failingCheck, // variant 1, attempt 1
        passingCheck, // variant 1, attempt 2
        passingCheck, // variant 2
        passingCheck, // variant 3
      ],
    })

    expect(output.designIds).toHaveLength(3)
    expect(images.calls.generate).toHaveLength(4)
  })

  it('abandons a variant whose lettering never comes out right', async () => {
    const { concept } = await seedConcept()

    const { output } = await runDesigner({
      conceptId: concept.id,
      modelQueue: [
        plan(true),
        failingCheck,
        failingCheck,
        plan(true), // the simplify call, after the second failure
        failingCheck,
        passingCheck, // variant 2
        passingCheck, // variant 3
      ],
    })

    expect(output.abandonedVariants).toEqual([1])
    expect(output.designIds).toHaveLength(2)
    expect(output.status).toBe('approval_requested')
  })

  it('marks the concept needs_human instead of shipping a misspelled design', async () => {
    const { concept } = await seedConcept()

    // Every variant fails every attempt.
    const { output } = await runDesigner({
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
    expect(output.designIds).toEqual([])
    expect(output.abandonedVariants).toEqual([1, 2, 3])

    const [row] = await db.select().from(schema.concepts).where(eq(schema.concepts.id, concept.id))
    expect(row!.status).toBe('needs_human')

    // Nothing was queued for the operator, because there is nothing to approve.
    expect(await db.select().from(schema.approvals)).toHaveLength(0)
  })

  it('skips the proofreading call entirely for a design with no lettering', async () => {
    const { concept } = await seedConcept()
    // Only the plan is queued; any text check would exhaust the queue and throw.
    const { output } = await runDesigner({ conceptId: concept.id, modelQueue: [plan(false)] })
    expect(output.designIds).toHaveLength(3)
  })
})

describe('Designer refusals', () => {
  it('refuses a concept that does not exist, without retrying', async () => {
    await expect(
      runDesigner({ conceptId: crypto.randomUUID(), modelQueue: [plan(false)] }),
    ).rejects.toThrow(/does not exist/)

    const [run] = await db.select().from(schema.agentRuns)
    expect(run).toMatchObject({ status: 'error', attempts: 1 })
  })

  it('refuses to design a concept flagged ip_risk=high', async () => {
    const { concept } = await seedConcept({ ipRisk: 'high' })

    await expect(
      runDesigner({ conceptId: concept.id, modelQueue: [plan(false)] }),
    ).rejects.toThrow(/ip_risk=high/)

    expect(await db.select().from(schema.designs)).toHaveLength(0)
  })

  it('does not queue a second approval when the same concept is designed twice', async () => {
    const { concept } = await seedConcept()
    await runDesigner({ conceptId: concept.id, modelQueue: [plan(false)] })

    // An orchestrator retry re-runs the agent. It must not double-queue, and it must
    // not pay to regenerate images it already has — so an empty model queue here is
    // the assertion: a second run that calls the model at all would throw.
    const second = await runDesigner({ conceptId: concept.id, modelQueue: [] })

    expect(second.output.status).toBe('already_requested')
    expect(second.images.calls.generate).toHaveLength(0)
    expect(await db.select().from(schema.approvals)).toHaveLength(1)
    expect(await db.select().from(schema.designs)).toHaveLength(3)
  })
})
