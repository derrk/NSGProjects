/**
 * The Concept bench, against real SQL.
 *
 * The thing worth testing hardest here is not that it writes concepts. It is the
 * `style` check: that column is a Postgres enum, so a value outside it is not a
 * worse concept but a failed INSERT partway through a batch — some concepts
 * written, some lost, and an approval card describing a set that does not exist.
 * PGlite runs the real enum, so the test either catches that or the insert throws.
 */

import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { requestApproval } from '@acf/core/approvals'
import type { ApprovalOutcome, GateDeps } from '@acf/core/approvals'
import { runAgent } from '@acf/core/runtime'
import type { AgentRecord, DivisionRecord, RunLoopDeps } from '@acf/core/runtime'
import { agentRuns, approvalRules, approvals, divisions, events } from '@acf/db'
import { createTestDatabase, POD_MIGRATIONS, type TestDatabase } from '@acf/db/testing'
import { createMockModelClient, type MockModelClient } from '@acf/integrations/anthropic'

import { blockedPhrases, concepts, niches } from '../../schema/index'
import { benchInstructions, createConceptBenchAgent, vetConcepts } from './run'
import { MIN_BRIEF_CHARS, nicheIdFrom } from './schema'

let h: TestDatabase

beforeAll(async () => {
  h = await createTestDatabase({ moduleMigrations: [POD_MIGRATIONS] })
}, 120_000)

afterAll(async () => {
  await h.close()
})

beforeEach(async () => {
  await h.truncate()
})

const NOW = new Date('2026-10-09T12:00:00.000Z')
const PRODUCTS = ['mug_11oz', 'tee', 'hoodie']

const BRIEF =
  'A hand-lettered mug reading MY SCHEDULE IS WHATEVER THE DOG DECIDES, with a small ' +
  'line drawing of an old dog asleep across a closed laptop.'

function proposal(over: Record<string, unknown> = {}) {
  return {
    title: 'My schedule is whatever the dog decides',
    promptBrief: BRIEF,
    style: 'hand-lettered',
    products: ['mug_11oz', 'tee'],
    whyThisOne: 'The fostering evidence is about time, not money, and this is a time joke.',
    ...over,
  }
}

function extraction(concepts: unknown[], over: Record<string, unknown> = {}) {
  return { concepts, skipped: [], ...over }
}

async function seedDivision() {
  const [division] = await h.db
    .insert(divisions)
    .values({ name: 'Pet depot', slug: 'pet-depot', type: 'pod', status: 'active' })
    .returning()
  return division!
}

async function seedNiche(divisionId: string, over: Record<string, unknown> = {}) {
  const [row] = await h.db
    .insert(niches)
    .values({
      divisionId,
      name: 'Senior dog adopters',
      audience: 'People buying for a friend who fosters older rescue dogs',
      keywords: ['senior dog gift', 'foster dog mug'],
      season: 'christmas-2026',
      score: 74,
      scoreBreakdown: {
        whyNow: 'Searches rose 41% in September',
        productIdeas: [{ product: 'mug', angle: 'time, not money', why: 'reads from a thumbnail' }],
        citations: [
          {
            claim: 'Search interest rose 41% in September',
            url: 'https://report.example/pets',
            quote: 'Searches for senior dog gifts rose 41% in September.',
          },
        ],
      },
      status: 'approved',
      actor: 'operator',
      ...over,
    })
    .returning()
  return row!
}

function gateDeps(): GateDeps {
  return {
    approvals: {
      async findByRef(divisionId, kind, refTable, refId) {
        const rows = await h.db.select().from(approvals).where(eq(approvals.refId, refId))
        return (rows.find(
          (r) =>
            r.divisionId === divisionId &&
            r.kind === kind &&
            r.refTable === refTable &&
            r.decision !== 'rejected',
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
    events: { async emit(e) { await h.db.insert(events).values(e as never) } },
    bus: { async send() {} },
    clock: { now: () => NOW },
    newId: () => crypto.randomUUID(),
  }
}

async function runBench(opts: {
  division: { id: string; name: string }
  input: Record<string, unknown>
  modelQueue: unknown[]
  config?: Record<string, unknown>
}) {
  const gate = gateDeps()
  const model: MockModelClient = createMockModelClient(opts.modelQueue)
  const logged: Array<{ kind: string; message: string }> = []

  const agent: AgentRecord = {
    id: '44444444-4444-4444-4444-444444444444',
    divisionId: opts.division.id,
    name: 'Concept bench',
    moduleAgentKey: 'concept_bench',
    model: 'claude-sonnet-5-5',
    systemPrompt: 'You turn an approved market into design ideas.',
    tools: [],
    autonomy: 'propose',
    maxSteps: 8,
  }

  const division: DivisionRecord = {
    id: opts.division.id,
    name: opts.division.name,
    type: 'pod',
    config: opts.config ?? { productTypes: PRODUCTS },
  } as DivisionRecord

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
      async emit(e) {
        logged.push({ kind: String(e.kind), message: String(e.message) })
        await h.db.insert(events).values({ ...e, agentId: null } as never)
      },
    },
    clock: { now: () => NOW },
    sleeper: { async sleep() {} },
    memory: { async recall() { return [] }, async write() {} },
    tools: {
      definitionsFor: () => [],
      async invoke() { return { ok: false, error: 'no tools', costCents: 0 } },
    } as never,
    requestApproval: (req) => requestApproval(req as never, gate) as Promise<ApprovalOutcome>,
  }

  const output = await runAgent(
    createConceptBenchAgent({ db: h.db as never, model, now: () => NOW }),
    { agent, division, input: opts.input, task: null },
    deps,
  )

  return { output: output as unknown as Record<string, unknown>, logged }
}

/* ------------------------------------------------------------------ *
 * The vet
 * ------------------------------------------------------------------ */

describe('vetConcepts', () => {
  const vet = (proposals: unknown[], blocked: Array<{ phrase: string }> = []) =>
    vetConcepts(proposals as never, { allowedProducts: PRODUCTS, blocked })

  it('accepts a complete concept', () => {
    const { usable, rejected } = vet([proposal()])
    expect(rejected).toEqual([])
    expect(usable[0]!.style).toBe('hand-lettered')
    expect(usable[0]!.products).toEqual(['mug_11oz', 'tee'])
  })

  it('refuses a style that is not one of the five', () => {
    /*
     * A Postgres enum, not a preference. Patched to a default the insert would
     * succeed and hand the operator a design direction nobody chose — which they
     * would approve, because it looks like an answer.
     */
    const { usable, rejected } = vet([proposal({ style: 'photorealistic' })])
    expect(usable).toEqual([])
    expect(rejected[0]!.reason).toMatch(/not one of the five/)
  })

  it('accepts a style the model shouted', () => {
    expect(vet([proposal({ style: 'RETRO-BADGE' })]).usable[0]!.style).toBe('retro-badge')
  })

  it('refuses a brief too thin for the Designer to render from', () => {
    const { usable, rejected } = vet([proposal({ promptBrief: 'A dog mug' })])
    expect(usable).toEqual([])
    expect(rejected[0]!.reason).toContain(String(MIN_BRIEF_CHARS))
  })

  it('drops product types this division does not sell', () => {
    const { usable } = vet([proposal({ products: ['mug_11oz', 'phone_case', 'yacht'] })])
    expect(usable[0]!.products).toEqual(['mug_11oz'])
  })

  it('refuses a concept left with no sellable product at all', () => {
    // Store ops prices and lists per product type, so this is a design with nothing
    // to print it on rather than a design with a gap.
    const { usable, rejected } = vet([proposal({ products: ['phone_case'] })])
    expect(usable).toEqual([])
    expect(rejected[0]!.reason).toMatch(/no product type/)
  })

  it('throws out an infringing concept before anyone is asked to decide', () => {
    const { usable, rejected } = vet(
      [proposal({ title: 'Just do it, says the dog' })],
      [{ phrase: 'just do it' }],
    )
    expect(usable).toEqual([])
    expect(rejected[0]!.reason).toMatch(/^ip-blocked/)
  })

  it('checks the BRIEF for infringement, not only the title', () => {
    // The title is what a reader skims. The brief is what gets printed.
    const { usable } = vet(
      [proposal({ promptBrief: `${BRIEF} Styled after the Super Bowl trophy.` })],
      [{ phrase: 'super bowl' }],
    )
    expect(usable).toEqual([])
  })

  it('keeps a non-blocking IP warning on the concept rather than hiding it', () => {
    /*
     * "inspired by <Name>" is a warning, not a block: it is usually innocent and
     * occasionally a living artist. The concept survives and carries the finding, so
     * the operator decides rather than the regex.
     */
    const { usable } = vet([
      proposal({ promptBrief: `${BRIEF} Lettering inspired by Saul Bass.` }),
    ])
    expect(usable).toHaveLength(1)
    expect(usable[0]!.ipRisk).toBe('medium')
    expect(usable[0]!.ipFindings.length).toBeGreaterThan(0)
  })

  it('still blocks a concept claiming to be officially licensed', () => {
    const { usable, rejected } = vet([
      proposal({ promptBrief: `${BRIEF} Marked as officially licensed merchandise.` }),
    ])
    expect(usable).toEqual([])
    expect(rejected[0]!.reason).toMatch(/^ip-blocked/)
  })

  it('keeps the first of two concepts with the same title', () => {
    const { usable, rejected } = vet([proposal(), proposal({ style: 'line-art' })])
    expect(usable).toHaveLength(1)
    expect(usable[0]!.style).toBe('hand-lettered')
    expect(rejected[0]!.reason).toMatch(/duplicate/)
  })

  it('caps the batch rather than carrying whatever arrives', () => {
    const many = Array.from({ length: 20 }, (_, i) => proposal({ title: `Concept ${i}` }))
    expect(vet(many).usable.length).toBeLessThanOrEqual(4)
  })
})

describe('nicheIdFrom', () => {
  it('reads a direct nicheId', () => {
    expect(nicheIdFrom({ nicheId: 'a' })).toBe('a')
  })

  it('reads the dispatcher ref', () => {
    expect(nicheIdFrom({ refId: 'b', refTable: 'pod.niches' })).toBe('b')
  })

  it('refuses a ref to something that is not a niche', () => {
    // Otherwise a design id gets looked up in the niches table, and the bad case is
    // not "not found" — it is finding an unrelated row.
    expect(nicheIdFrom({ refId: 'c', refTable: 'pod.designs' })).toBeNull()
  })
})

describe('benchInstructions', () => {
  const brief = {
    name: 'Senior dog adopters',
    audience: 'friends of fosterers',
    keywords: ['senior dog gift'],
    season: null,
    whyNow: null,
    productIdeas: [{ product: 'mug', angle: 'time not money', why: 'thumbnail' }],
    citations: [{ claim: 'rose 41%', url: 'https://x.example/a', quote: 'rose 41% in September' }],
  }

  it('quotes the evidence rather than summarising it', () => {
    const text = benchInstructions(brief, PRODUCTS, 4, [])
    expect(text).toContain('rose 41% in September')
    expect(text).toContain('https://x.example/a')
  })

  it('says so plainly when a niche carries no quoted evidence', () => {
    const text = benchInstructions({ ...brief, citations: [] }, PRODUCTS, 4, [])
    expect(text).toMatch(/No quoted evidence/)
  })

  it('names only the products this division sells', () => {
    expect(benchInstructions(brief, ['mug_11oz'], 4, [])).toContain('mug_11oz')
  })
})

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

describe('the concept bench run', () => {
  it('turns an approved niche into concepts and ONE approval', async () => {
    const division = await seedDivision()
    const niche = await seedNiche(division.id)

    const { output } = await runBench({
      division,
      input: { refId: niche.id, refTable: 'pod.niches' },
      modelQueue: [extraction([proposal(), proposal({ title: 'Foster fail', style: 'line-art' })])],
    })

    expect(output['status']).toBe('approval_requested')
    expect(output['conceptIds']).toHaveLength(2)

    const rows = await h.db.select().from(concepts).where(eq(concepts.divisionId, division.id))
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.status === 'proposed')).toBe(true)
    expect(rows.every((r) => r.nicheId === niche.id)).toBe(true)

    const filed = await h.db.select().from(approvals).where(eq(approvals.divisionId, division.id))
    expect(filed).toHaveLength(1)
    expect(filed[0]!.kind).toBe('concept')
  })

  it('refuses to build concepts for a niche nobody approved', async () => {
    /*
     * It is runnable by hand from the agents page with any niche id, and a proposed
     * niche turned into concepts routes straight round the gate the scout files its
     * findings at — the operator ends up deciding on designs for a market they never
     * agreed to sell into.
     */
    const division = await seedDivision()
    const niche = await seedNiche(division.id, { status: 'proposed' })

    await expect(
      runBench({
        division,
        input: { nicheId: niche.id },
        modelQueue: [extraction([proposal()])],
      }),
    ).rejects.toThrow(/not approved/)

    expect(await h.db.select().from(concepts)).toHaveLength(0)
  })

  it('does not bench the same niche twice', async () => {
    // The approval event can be redelivered and Run now exists, so without this one
    // approved niche becomes three sets of concepts and three cards in the inbox.
    const division = await seedDivision()
    const niche = await seedNiche(division.id)
    const input = { nicheId: niche.id }

    await runBench({ division, input, modelQueue: [extraction([proposal()])] })
    const { output } = await runBench({ division, input, modelQueue: [extraction([proposal()])] })

    expect(output['status']).toBe('already_benched')
    expect(await h.db.select().from(concepts)).toHaveLength(1)
    expect(await h.db.select().from(approvals)).toHaveLength(1)
  })

  it('will not touch a niche belonging to another division', async () => {
    const mine = await seedDivision()
    const [theirs] = await h.db
      .insert(divisions)
      .values({ name: 'Other', slug: 'other', type: 'pod', status: 'active' })
      .returning()
    const niche = await seedNiche(theirs!.id)

    await expect(
      runBench({ division: mine, input: { nicheId: niche.id }, modelQueue: [extraction([proposal()])] }),
    ).rejects.toThrow(/does not exist in this division/)
  })

  it('writes nothing when every concept fails the vet', async () => {
    const division = await seedDivision()
    const niche = await seedNiche(division.id)

    const { output } = await runBench({
      division,
      input: { nicheId: niche.id },
      modelQueue: [
        extraction([proposal({ style: 'photorealistic' })]),
        extraction([proposal({ style: 'oil-painting' })]),
      ],
    })

    expect(output['status']).toBe('no_concepts')
    expect(await h.db.select().from(concepts)).toHaveLength(0)
    expect(await h.db.select().from(approvals)).toHaveLength(0)
  })

  it('throws out an infringing concept and records why', async () => {
    const division = await seedDivision()
    await h.db.insert(blockedPhrases).values({
      divisionId: division.id,
      phrase: 'world cup',
      reason: 'FIFA registered mark',
      actor: 'system',
    })
    const niche = await seedNiche(division.id)

    const { output, logged } = await runBench({
      division,
      input: { nicheId: niche.id },
      modelQueue: [
        extraction([proposal({ title: 'World cup of naps' }), proposal()]),
        extraction([proposal()]),
      ],
    })

    expect(output['status']).toBe('approval_requested')
    expect(output['conceptIds']).toHaveLength(1)
    expect(logged.some((l) => l.kind === 'pod.bench_ip_blocked')).toBe(true)
  })

  it('warns when the division has no blocklist, because an empty gate reads as a clean one', async () => {
    const division = await seedDivision()
    const niche = await seedNiche(division.id)

    const { logged } = await runBench({
      division,
      input: { nicheId: niche.id },
      modelQueue: [extraction([proposal()])],
    })

    expect(logged.some((l) => l.kind === 'pod.bench_no_blocklist')).toBe(true)
  })

  it('carries the scout’s evidence onto the approval card', async () => {
    // Approving a concept commits image credits, and the only reason to believe the
    // market is real is what the scout read on a page.
    const division = await seedDivision()
    const niche = await seedNiche(division.id)

    await runBench({
      division,
      input: { nicheId: niche.id },
      modelQueue: [extraction([proposal()])],
    })

    const [filed] = await h.db.select().from(approvals).where(eq(approvals.divisionId, division.id))
    const payload = filed!.payload as Record<string, unknown>
    const evidence = payload['evidence'] as Array<Record<string, unknown>>
    expect(evidence[0]!['quote']).toMatch(/41%/)
  })

  it('falls back to the default catalogue when the division configured none', async () => {
    const division = await seedDivision()
    const niche = await seedNiche(division.id)

    const { output } = await runBench({
      division,
      input: { nicheId: niche.id },
      config: {},
      modelQueue: [extraction([proposal({ products: ['sweatshirt'] })])],
    })

    expect(output['status']).toBe('approval_requested')
    const [row] = await h.db.select().from(concepts).where(eq(concepts.divisionId, division.id))
    expect(row!.products).toEqual(['sweatshirt'])
  })

  it('keeps pass one’s concepts when the correction pass answers about one of them', async () => {
    const division = await seedDivision()
    const niche = await seedNiche(division.id)

    const { output } = await runBench({
      division,
      input: { nicheId: niche.id },
      modelQueue: [
        extraction([proposal(), proposal({ title: 'Foster fail', style: 'nope' })]),
        extraction([proposal({ title: 'Foster fail', style: 'line-art' })]),
      ],
    })

    const accepted = output['accepted'] as Array<{ title: string }>
    expect(accepted.map((a) => a.title).sort()).toEqual([
      'Foster fail',
      'My schedule is whatever the dog decides',
    ])
  })

  it('reports what it declined to propose at all', async () => {
    const division = await seedDivision()
    const niche = await seedNiche(division.id)

    const { output } = await runBench({
      division,
      input: { nicheId: niche.id },
      modelQueue: [
        extraction([proposal()], { skipped: ['A Bluey parody — BBC character'] }),
      ],
    })

    expect((output['skipped'] as string[])[0]).toMatch(/Bluey/)
  })

  it('refuses a task with no niche at all rather than inventing one', async () => {
    const division = await seedDivision()
    await expect(
      runBench({ division, input: {}, modelQueue: [extraction([proposal()])] }),
    ).rejects.toThrow(/cannot invent one/)
  })
})

describe('the chain it closes', () => {
  it('leaves concepts the Designer can pick up by id', async () => {
    /*
     * The gap this agent exists for. The Designer triggers on `concept.approved` and
     * reads a conceptId; nothing in production wrote a concept, so an approved niche
     * went nowhere and the pipeline on the floor was two halves that never touched.
     */
    const division = await seedDivision()
    const niche = await seedNiche(division.id)

    await runBench({
      division,
      input: { nicheId: niche.id },
      modelQueue: [extraction([proposal()])],
    })

    const [concept] = await h.db
      .select()
      .from(concepts)
      .where(and(eq(concepts.divisionId, division.id), eq(concepts.nicheId, niche.id)))

    // Everything the Designer needs, present and non-empty.
    expect(concept!.promptBrief.length).toBeGreaterThanOrEqual(MIN_BRIEF_CHARS)
    expect(concept!.style).toBeTruthy()
    expect(concept!.products.length).toBeGreaterThan(0)
    expect(concept!.audience).toBeTruthy()
  })
})
