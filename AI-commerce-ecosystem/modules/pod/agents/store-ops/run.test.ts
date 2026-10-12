/**
 * Store ops: an approved design becomes listings waiting for the operator.
 *
 * Against real SQL and a Printify mock that models the behaviours that bite —
 * publishing locks the product, a locked product refuses edits.
 */

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { requestApproval } from '@acf/core/approvals'
import type { ApprovalOutcome, GateDeps } from '@acf/core/approvals'
import { runAgent } from '@acf/core/runtime'
import type { AgentRecord, DivisionRecord, RunLoopDeps } from '@acf/core/runtime'
import { agentRuns, approvalRules, approvals, divisions, events } from '@acf/db'
import { createTestDatabase, POD_MIGRATIONS, type TestDatabase } from '@acf/db/testing'
import { createMockModelClient } from '@acf/integrations/anthropic'
import { createMockPrintifyClient, type MockPrintifyClient } from '@acf/integrations/printify'

import { concepts, designs, pricingRules, products } from '../../schema/index'
import { createStoreOpsAgent, validateCopy } from './run'
import { designIdFrom } from './schema'

let h: TestDatabase
const sentEvents: Array<{ name: string }> = []

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

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const goodCopy = {
  title: 'Nurse Coffee Mug Funny Gift for Night Shift Nurses',
  description:
    'A gift for the nurse who runs on caffeine and stubbornness.\n\n' +
    'Printed on a standard 11oz ceramic mug with a full wrap print area.\n\n' +
    'Dishwasher safe. Made to order, then shipped with tracking.',
  tags: [
    'nurse gift',
    'nurse mug',
    'funny mug',
    'coffee mug',
    'night shift',
    'rn gift',
    'healthcare worker',
    'nursing student',
    'graduation gift',
    'coworker gift',
    'ceramic mug',
    'christmas gift',
    'stocking filler',
  ],
}

async function seed(over: { products?: string[] } = {}) {
  const [division] = await h.db
    .insert(divisions)
    .values({
      name: 'Deadstock',
      slug: 'deadstock',
      type: 'pod',
      status: 'active',
      config: { printifyShopId: '1' },
    })
    .returning()

  const [concept] = await h.db
    .insert(concepts)
    .values({
      divisionId: division!.id,
      title: 'Powered by caffeine and chaos',
      promptBrief: 'Hand-lettered phrase around a coffee cup.',
      style: 'hand-lettered',
      products: over.products ?? ['mug_11oz'],
      audience: 'gift buyers for nurses',
      status: 'approved',
    })
    .returning()

  const [design] = await h.db
    .insert(designs)
    .values({
      divisionId: division!.id,
      conceptId: concept!.id,
      variantNo: 2,
      imageUrl: 'https://mock.storage.local/designs/x/2.png',
      sourceModel: 'fal-ai/ideogram/v3',
      genPrompt: 'p',
      width: 1024,
      height: 1024,
      status: 'approved',
    })
    .returning()

  await h.db.insert(pricingRules).values([
    { divisionId: division!.id, productType: 'mug_11oz', markupMultiple: 2.4, roundToCents: 99, minPriceCents: 1499 },
    { divisionId: division!.id, productType: 'tee', markupMultiple: 2.2, roundToCents: 99, minPriceCents: 2199 },
  ])

  return { division: division!, concept: concept!, design: design! }
}

function gateDeps(): GateDeps {
  return {
    approvals: {
      async findByRef(divisionId, kind, refTable, refId) {
        const rows = await h.db.select().from(approvals).where(eq(approvals.refId, refId))
        return (rows.find(
          (r) => r.divisionId === divisionId && r.kind === kind && r.refTable === refTable && r.decision !== 'rejected',
        ) ?? null) as never
      },
      async insert(row) {
        const [i] = await h.db.insert(approvals).values(row as never).returning()
        return i as never
      },
      async findById(id) {
        const [r] = await h.db.select().from(approvals).where(eq(approvals.id, id))
        return (r ?? null) as never
      },
      async update(id, patch) {
        const [r] = await h.db.update(approvals).set(patch as never).where(eq(approvals.id, id)).returning()
        return r as never
      },
    },
    rules: {
      async get(divisionId, kind, category) {
        const rows = await h.db.select().from(approvalRules)
        return (rows.find((r) => r.divisionId === divisionId && r.kind === kind && r.category === category) ?? null) as never
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
      async emit(e) {
        await h.db.insert(events).values(e as never)
      },
    },
    bus: {
      async send(name) {
        sentEvents.push({ name })
      },
    },
    clock: { now: () => new Date() },
    newId: () => crypto.randomUUID(),
  }
}

async function runStoreOps(opts: {
  division: { id: string; name: string; config?: unknown }
  designId: string
  modelQueue: unknown[]
  printify?: MockPrintifyClient
}) {
  const printify = opts.printify ?? createMockPrintifyClient()
  const gate = gateDeps()

  const agent: AgentRecord = {
    id: '11111111-1111-1111-1111-111111111111',
    divisionId: opts.division.id,
    name: 'Listing dock',
    moduleAgentKey: 'store_ops',
    model: 'claude-sonnet-5-5',
    systemPrompt: 'You write listings.',
    tools: [],
    autonomy: 'propose',
    maxSteps: 12,
  }

  const division: DivisionRecord = {
    id: opts.division.id,
    name: opts.division.name,
    type: 'pod',
    config: opts.division.config ?? { printifyShopId: '1' },
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
        const [row] = await h.db.update(agentRuns).set(patch as never).where(eq(agentRuns.id, id)).returning()
        return row as never
      },
    },
    events: {
      async emit(e) {
        await h.db.insert(events).values({ ...e, agentId: null } as never)
      },
    },
    clock: { now: () => new Date() },
    sleeper: { async sleep() {} },
    memory: { async recall() { return [] }, async write() {} },
    requestApproval: (req) => requestApproval(req as never, gate) as Promise<ApprovalOutcome>,
  }

  const output = await runAgent(
    createStoreOpsAgent({
      db: h.db as never,
      model: createMockModelClient(opts.modelQueue),
      printify,
    }),
    { agent, division, task: null, input: { designId: opts.designId } },
    deps,
  )

  return { output, printify }
}

/* ------------------------------------------------------------------ *
 * validateCopy
 * ------------------------------------------------------------------ */

describe('validateCopy', () => {
  it('accepts copy that meets every rule', () => {
    expect(validateCopy(goodCopy)).toEqual([])
  })

  it('catches a title over the limit', () => {
    // Structured outputs drop maxLength from the schema, so the model is only hinted.
    // Re-checking turns a silent violation into a retry.
    const problems = validateCopy({ ...goodCopy, title: 'x'.repeat(141) })
    expect(problems[0]).toMatch(/141 characters/)
  })

  it('catches the wrong number of tags', () => {
    expect(validateCopy({ ...goodCopy, tags: ['one', 'two'] })[0]).toMatch(/2 tags/)
  })

  it('catches duplicate tags', () => {
    const tags = [...goodCopy.tags.slice(0, 12), goodCopy.tags[0]!]
    expect(validateCopy({ ...goodCopy, tags })).toContain('two tags are the same')
  })

  it('catches a description that is not three paragraphs', () => {
    expect(validateCopy({ ...goodCopy, description: 'one paragraph only' })[0]).toMatch(
      /1 paragraphs/,
    )
  })
})

/* ------------------------------------------------------------------ *
 * The agent
 * ------------------------------------------------------------------ */

describe('Store ops: design to listing', () => {
  it('creates a Printify product and files it for approval', async () => {
    const { division, design, concept } = await seed()

    const { output, printify } = await runStoreOps({
      division,
      designId: design.id,
      modelQueue: [goodCopy],
    })

    expect(output.status).toBe('approval_requested')
    expect(output.productIds).toHaveLength(1)

    expect(printify.calls.createProduct).toHaveLength(1)
    expect(printify.calls.createProduct[0]!.title).toBe(goodCopy.title)

    const [row] = await h.db.select().from(products)
    expect(row).toMatchObject({ type: 'mug_11oz', status: 'pending_approval', designId: design.id })
    expect(row!.mockupUrls.length).toBeGreaterThan(0)

    const [approval] = await h.db.select().from(approvals)
    expect(approval).toMatchObject({ kind: 'product', refTable: 'pod.designs', decision: 'pending' })
    expect(concept.title).toBeDefined()
  })

  it('prices from the pricing rule, rounded up to .99', async () => {
    const { division, design } = await seed()
    await runStoreOps({ division, designId: design.id, modelQueue: [goodCopy] })

    // Mock mug cost is 520c; 520 x 2.4 = 1248, below the 1499 floor, so 1499 → 1499.
    const [row] = await h.db.select().from(products)
    expect(row!.priceCents).toBe(1499)
    expect(row!.costCents).toBe(520)
  })

  it('does NOT publish — publishing is the operator’s decision', async () => {
    const { division, design } = await seed()
    const { printify } = await runStoreOps({ division, designId: design.id, modelQueue: [goodCopy] })

    // Publishing locks the product in Printify, so it waits for an approval.
    expect(printify.calls.publish).toEqual([])
    const [row] = await h.db.select().from(products)
    expect(row!.publishedAt).toBeNull()
  })

  it('uploads the artwork once and reuses it across product types', async () => {
    const { division, design } = await seed({ products: ['mug_11oz', 'tee'] })

    const { output, printify } = await runStoreOps({
      division,
      designId: design.id,
      modelQueue: [goodCopy, goodCopy],
    })

    expect(output.productIds).toHaveLength(2)
    // Paying to upload the same 300dpi file once per product type is pure waste.
    expect(printify.calls.uploads).toHaveLength(1)
  })

  it('retries listing copy that fails validation, telling the model what was wrong', async () => {
    const { division, design } = await seed()

    const { output } = await runStoreOps({
      division,
      designId: design.id,
      modelQueue: [{ ...goodCopy, tags: ['too', 'few'] }, goodCopy],
    })

    expect(output.productIds).toHaveLength(1)
  })

  it('skips a product type whose copy fails twice, rather than listing it badly', async () => {
    const { division, design } = await seed()
    const bad = { ...goodCopy, title: 'x'.repeat(200) }

    const { output } = await runStoreOps({
      division,
      designId: design.id,
      modelQueue: [bad, bad],
    })

    expect(output.status).toBe('no_priceable_variants')
    expect(output.skipped[0]!.reason).toMatch(/failed validation twice/)
    expect(await h.db.select().from(products)).toHaveLength(0)
  })

  it('refuses copy that promises a delivery date', async () => {
    const { division, design } = await seed()
    const promising = {
      ...goodCopy,
      description:
        'A gift for nurses.\n\nStandard 11oz ceramic mug.\n\nOrder today and it will arrive before Christmas.',
    }

    const { output } = await runStoreOps({
      division,
      designId: design.id,
      // Both attempts promise a date, so the type is skipped rather than listed.
      modelQueue: [promising, promising],
    })

    expect(output.skipped[0]!.reason).toMatch(/promises a delivery date/)
  })

  it('skips a product type with no pricing rule and says so', async () => {
    const { division, design } = await seed({ products: ['mug_11oz', 'hoodie'] })

    const { output } = await runStoreOps({
      division,
      designId: design.id,
      modelQueue: [goodCopy],
    })

    expect(output.productIds).toHaveLength(1)
    expect(output.skipped).toEqual([
      { productType: 'hoodie', reason: 'no pricing rule for this product type' },
    ])
  })
})

describe('Store ops refusals and idempotency', () => {
  it('refuses a design that does not exist', async () => {
    const { division } = await seed()
    await expect(
      runStoreOps({
        division,
        designId: '33333333-3333-3333-3333-333333333333',
        modelQueue: [goodCopy],
      }),
    ).rejects.toThrow(/does not exist/)
  })

  it('refuses a design belonging to another division', async () => {
    const { design } = await seed()
    const [other] = await h.db
      .insert(divisions)
      .values({ name: 'Other', slug: 'other', type: 'pod', config: { printifyShopId: '2' } })
      .returning()

    await expect(
      runStoreOps({ division: other!, designId: design.id, modelQueue: [goodCopy] }),
    ).rejects.toThrow(/does not belong to this division/)
  })

  it('refuses a division with no Printify shop configured', async () => {
    const { division, design } = await seed()
    await expect(
      runStoreOps({
        division: { ...division, config: {} },
        designId: design.id,
        modelQueue: [goodCopy],
      }),
    ).rejects.toThrow(/printifyShopId/)
  })

  it('does not create a second set of listings when the event is redelivered', async () => {
    const { division, design } = await seed()
    await runStoreOps({ division, designId: design.id, modelQueue: [goodCopy] })

    // An empty model queue is the assertion: a second run that writes copy at all
    // would throw. Duplicate listings would be real products in a real shop.
    const second = await runStoreOps({ division, designId: design.id, modelQueue: [] })

    expect(second.output.status).toBe('already_requested')
    expect(second.printify.calls.createProduct).toHaveLength(0)
    expect(await h.db.select().from(products)).toHaveLength(1)
  })
})

/* ------------------------------------------------------------------ *
 * Which design, which is where the whole pipeline used to stop
 * ------------------------------------------------------------------ */

describe('designIdFrom', () => {
  /**
   * The exact shape `dispatchInput` builds, copied from a real task row rather than
   * imagined. That is the point: this function was written against a shape
   * (`approval.payload`) that nothing in the dispatch path produces, there was no
   * test for it, and the pipeline died one step after the operator chose a variant.
   */
  const dispatched = (over: Record<string, unknown> = {}) => ({
    kind: 'design',
    refId: 'concept-uuid',
    refTable: 'pod.concepts',
    category: 'flat-vector',
    decision: 'edited',
    payload: { chosenDesignId: 'design-uuid', chosenVariantNo: 1 },
    ...over,
  })

  it('takes the variant the operator actually picked', () => {
    expect(designIdFrom(dispatched())).toBe('design-uuid')
  })

  it('does NOT fall back to the refId of a design approval, which is a concept', () => {
    /*
     * The bug. The pick was missed, this fell through to refId, and Store ops looked
     * up a concept id in the designs table. Loud, so it was recoverable — but a
     * version that happened to find a row would have built a listing for artwork
     * nobody chose.
     */
    expect(designIdFrom(dispatched({ payload: {} }))).toBeNull()
    expect(designIdFrom(dispatched({ payload: undefined }))).toBeNull()
  })

  it('still reads the nested shape, for a task that carries its own decision', () => {
    expect(
      designIdFrom({ approval: { payload: { chosenDesignId: 'design-uuid' } } }),
    ).toBe('design-uuid')
  })

  it('takes an explicit designId from a manual run', () => {
    expect(designIdFrom({ designId: 'design-uuid' })).toBe('design-uuid')
  })

  it('accepts a refId that really is a design', () => {
    expect(designIdFrom({ refId: 'design-uuid', refTable: 'pod.designs' })).toBe('design-uuid')
  })

  it('ignores a blank or non-string pick rather than passing it on', () => {
    for (const chosenDesignId of ['', '   ', 42, null, {}, []]) {
      expect(designIdFrom(dispatched({ payload: { chosenDesignId } }))).toBeNull()
    }
  })

  it('prefers the pick over an explicit designId, because three variants were on the card', () => {
    expect(designIdFrom({ ...dispatched(), designId: 'some-other-design' })).toBe('design-uuid')
  })
})
