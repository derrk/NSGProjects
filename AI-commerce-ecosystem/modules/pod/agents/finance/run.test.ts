/**
 * The Counting house: a period of ledger rows and orders becomes figures, a covering
 * note, and one proposal the operator has to decide.
 *
 * Against real SQL, because the thing most worth proving is which rows fall inside a
 * period and which cost a line is charged at — both of which a hand-rolled fake would
 * simply agree with.
 */

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { requestApproval } from '@acf/core/approvals'
import type { ApprovalOutcome, GateDeps } from '@acf/core/approvals'
import { runAgent } from '@acf/core/runtime'
import type { AgentRecord, DivisionRecord, MemoryEntry, RunLoopDeps } from '@acf/core/runtime'
import { agentRuns, approvalRules, approvals, divisions, events, ledger } from '@acf/db'
import { createTestDatabase, POD_MIGRATIONS, type TestDatabase } from '@acf/db/testing'
import { createMockModelClient } from '@acf/integrations/anthropic'

import {
  defaultEtsyAssumptions,
  defaultShopifyAssumptions,
  type FeeAssumptions,
} from '../../economics'
import { orderLines, orders, products, supplierOrders } from '../../schema/index'
import {
  createFinanceAgent,
  periodRef,
  PERIOD_REF_TABLE,
  provenanceOf,
  resolvePeriod,
  unhedgedClaims,
  validateNote,
} from './run'
import { buildFinanceReport, type FinanceReport } from './report'
import { financeOutputSchema, markingFor, renderCoveringNote } from './schema'

let h: TestDatabase
const sentEvents: Array<{ name: string }> = []
const remembered: MemoryEntry[] = []

/** 07:00 on the 8th, so the previous complete seven days are the 1st to the 7th. */
const NOW = new Date('2026-10-08T07:00:00.000Z')
const INSIDE = new Date('2026-10-04T12:00:00.000Z')
const EXPECTED_START = new Date('2026-10-01T00:00:00.000Z')
const EXPECTED_END = new Date('2026-10-07T23:59:59.999Z')

beforeAll(async () => {
  h = await createTestDatabase({ moduleMigrations: [POD_MIGRATIONS] })
}, 120_000)

afterAll(async () => {
  await h.close()
})

beforeEach(async () => {
  await h.truncate()
  sentEvents.length = 0
  remembered.length = 0
})

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

/**
 * A note that survives the hedging check: every sentence quoting a figure says in that
 * same sentence what the figure rests on.
 */
const hedgedNote = {
  findings: [
    {
      whatISee:
        'The poster looks like it is losing roughly $5.60 an order, on catalogue costs nobody has confirmed.',
      whatItProbablyMeans:
        'The listing was priced from an older supplier quote and the catalogue figure moved under it.',
      whatIWouldCheckNext:
        'Pull the last supplier invoice for that poster and compare it against the catalogue cost on the product row.',
    },
  ],
  leastSureAbout:
    'The first finding, because the fee rates behind it are the published schedule rather than our own account.',
}

/**
 * A note for the end-to-end runs, which seed their own ledgers.
 *
 * `whatISee` quotes no money figure at all, so the cross-check against the report's
 * own amounts is vacuous here and each test can seed whatever figures it is really
 * about. A note is not required to quote a number; it is required not to invent one.
 */
const plainNote = {
  findings: [
    {
      whatISee:
        'One SKU is contributing less than the others, on catalogue costs nobody has confirmed.',
      whatItProbablyMeans:
        'The listing was priced from an older supplier quote and the catalogue figure moved under it.',
      whatIWouldCheckNext:
        'Pull the last supplier invoice for that SKU and compare it against the catalogue cost on the product row.',
    },
  ],
  leastSureAbout:
    'The first finding, because the fee rates behind it are the published schedule rather than our own account.',
}

const simulatedNote = {
  findings: [
    {
      whatISee:
        'Every row in this period is simulated demo data, so the net is not a result, and the poster still shows an estimated shortfall of about $5.60 an order.',
      whatItProbablyMeans:
        'The demo seed prices the poster below what the seeded supplier charges, which is the drift it was built to show.',
      whatIWouldCheckNext:
        'Replace the seeded rows with an imported statement before reading anything here as a result.',
    },
  ],
  leastSureAbout: 'The first finding, because nothing in this period describes money that moved.',
}

async function seedDivision() {
  const [division] = await h.db
    .insert(divisions)
    .values({ name: 'Paw Order', slug: 'paw-order', type: 'pod', status: 'active', config: {} })
    .returning()
  return division!
}

async function addLedger(
  divisionId: string,
  rows: Array<{
    kind: 'revenue' | 'cogs' | 'expense' | 'api_cost'
    amountCents: number
    source: string
    occurredAt?: Date
  }>,
) {
  await h.db.insert(ledger).values(
    rows.map((r) => ({
      divisionId,
      kind: r.kind,
      amountCents: r.amountCents,
      source: r.source,
      occurredAt: r.occurredAt ?? INSIDE,
    })) as never,
  )
}

interface OrderSpec {
  channel: 'etsy' | 'shopify'
  sku: string | null
  unitPriceCents: number
  /** null means no product row at all, so nothing but a supplier charge can cost it. */
  catalogueCostCents: number | null
  supplierCostCents?: number
  quantity?: number
  placedAt?: Date | null
  createdAt?: Date
  ref: string
}

async function addOrder(divisionId: string, spec: OrderSpec) {
  const quantity = spec.quantity ?? 1

  let productId: string | null = null
  if (spec.catalogueCostCents !== null) {
    const [product] = await h.db
      .insert(products)
      .values({
        divisionId,
        type: 'other',
        title: spec.sku ?? spec.ref,
        description: 'seeded',
        priceCents: spec.unitPriceCents,
        costCents: spec.catalogueCostCents,
        status: 'published',
      })
      .returning()
    productId = product!.id
  }

  const [order] = await h.db
    .insert(orders)
    .values({
      divisionId,
      shopifyOrderId: spec.ref,
      orderNumber: spec.ref,
      totalCents: spec.unitPriceCents * quantity,
      status: 'shipped',
      placedAt: spec.placedAt === undefined ? INSIDE : spec.placedAt,
      ...(spec.createdAt ? { createdAt: spec.createdAt } : {}),
    })
    .returning()

  const [line] = await h.db
    .insert(orderLines)
    .values({
      divisionId,
      orderId: order!.id,
      channel: spec.channel,
      channelOrderId: spec.ref,
      channelLineItemId: `${spec.ref}-1`,
      productId,
      sku: spec.sku,
      quantity,
      unitPriceCents: spec.unitPriceCents,
    })
    .returning()

  if (spec.supplierCostCents !== undefined) {
    await h.db.insert(supplierOrders).values({
      divisionId,
      orderLineId: line!.id,
      status: 'shipped',
      costCents: spec.supplierCostCents,
    })
  }

  return { order: order!, line: line! }
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
        const [i] = await h.db
          .insert(approvals)
          .values(row as never)
          .returning()
        return i as never
      },
      async findById(id) {
        const [r] = await h.db.select().from(approvals).where(eq(approvals.id, id))
        return (r ?? null) as never
      },
      async update(id, patch) {
        const [r] = await h.db
          .update(approvals)
          .set(patch as never)
          .where(eq(approvals.id, id))
          .returning()
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

async function runFinance(opts: {
  division: { id: string; name: string }
  modelQueue: unknown[]
  input?: { periodStart?: string; periodEnd?: string }
  now?: Date
  /** Fee rates the operator has checked against their own account. */
  assumptions?: Partial<Record<'etsy' | 'shopify', FeeAssumptions>>
}) {
  const gate = gateDeps()
  const model = createMockModelClient(opts.modelQueue)

  const agent: AgentRecord = {
    id: '22222222-2222-2222-2222-222222222222',
    divisionId: opts.division.id,
    name: 'Counting house',
    moduleAgentKey: 'finance',
    model: 'claude-sonnet-5-5',
    systemPrompt: 'You are the finance analyst.',
    tools: [],
    autonomy: 'propose',
    maxSteps: 8,
  }

  const division: DivisionRecord = {
    id: opts.division.id,
    name: opts.division.name,
    type: 'pod',
    config: {},
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
      async emit(e) {
        await h.db.insert(events).values({ ...e, agentId: null } as never)
      },
    },
    clock: { now: () => new Date() },
    sleeper: {
      async sleep() {},
    },
    memory: {
      async recall() {
        return []
      },
      async write(input) {
        remembered.push(...input.entries)
      },
    },
    requestApproval: (req) => requestApproval(req as never, gate) as Promise<ApprovalOutcome>,
  }

  const output = await runAgent(
    createFinanceAgent({
      db: h.db as never,
      model,
      now: () => opts.now ?? NOW,
      ...(opts.assumptions ? { assumptions: opts.assumptions } : {}),
    }),
    { agent, division, task: null, input: opts.input ?? {} },
    deps,
    // One attempt: this agent throws only for things a retry cannot fix, and a test
    // that silently retried would hide a queue the agent drained four times.
    { maxAttempts: 1 },
  )

  return { output, model }
}

/** A loss-making poster and a healthy hair remover, the shape most tests want. */
async function seedTwoSkus(over: { posterSource?: string } = {}) {
  const division = await seedDivision()

  await addLedger(division.id, [
    { kind: 'revenue', amountCents: 2899, source: over.posterSource ?? 'invoice:etsy-2026-10' },
    { kind: 'cogs', amountCents: -2090, source: 'import:supplier-statement' },
  ])

  // Catalogue cost only, and it is above the price: this is the loss-maker.
  await addOrder(division.id, {
    channel: 'etsy',
    sku: 'pet-portrait-poster-a2',
    unitPriceCents: 1000,
    catalogueCostCents: 1400,
    ref: 'ETSY-1',
  })

  // A supplier charged us for this one, so its cost is a fact.
  await addOrder(division.id, {
    channel: 'shopify',
    sku: 'pet-hair-remover-v1',
    unitPriceCents: 1899,
    catalogueCostCents: 600,
    supplierCostCents: 690,
    ref: 'SHOP-1',
  })

  return division
}

/* ------------------------------------------------------------------ *
 * resolvePeriod
 * ------------------------------------------------------------------ */

describe('resolvePeriod', () => {
  it('defaults to the previous complete seven days, never a window ending now', () => {
    // A run at 07:00 that counted seven hours of today would read as a collapse in
    // revenue against a week that counted a full seventh day.
    const p = resolvePeriod({}, NOW)
    expect(p.periodStart.toISOString()).toBe(EXPECTED_START.toISOString())
    expect(p.periodEnd.toISOString()).toBe(EXPECTED_END.toISOString())
    expect(p.open).toBe(false)
  })

  it('takes an explicit period as given', () => {
    const p = resolvePeriod(
      { periodStart: '2026-09-01T00:00:00.000Z', periodEnd: '2026-09-30T23:59:59.999Z' },
      NOW,
    )
    expect(p.periodStart.toISOString()).toBe('2026-09-01T00:00:00.000Z')
    expect(p.open).toBe(false)
  })

  it('marks a period that has not ended yet as open', () => {
    const p = resolvePeriod(
      { periodStart: '2026-10-01T00:00:00.000Z', periodEnd: '2026-10-31T23:59:59.999Z' },
      NOW,
    )
    expect(p.open).toBe(true)
  })

  it('refuses one end of a period without the other', () => {
    expect(() => resolvePeriod({ periodStart: '2026-10-01T00:00:00.000Z' }, NOW)).toThrow(
      /both periodStart and periodEnd/,
    )
  })

  it('refuses a period that is not a pair of ISO timestamps', () => {
    expect(() => resolvePeriod({ periodStart: 'last week', periodEnd: 'now' }, NOW)).toThrow(
      /not a pair of ISO timestamps/,
    )
  })

  it('refuses a slash-formatted date even though Date happily parses one', () => {
    // "01/02/2026" is January in one country and February in another. Date picks one
    // without complaining, and the report that comes back is confident, well marked,
    // and about the wrong month.
    expect(() =>
      resolvePeriod({ periodStart: '01/02/2026', periodEnd: '01/09/2026' }, NOW),
    ).toThrow(/not a pair of ISO timestamps/)
  })

  it('accepts a date with no time on it', () => {
    const p = resolvePeriod({ periodStart: '2026-09-01', periodEnd: '2026-09-30' }, NOW)
    expect(p.periodStart.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })

  it('refuses a period that ends before it starts', () => {
    expect(() =>
      resolvePeriod(
        { periodStart: '2026-10-08T00:00:00.000Z', periodEnd: '2026-10-01T00:00:00.000Z' },
        NOW,
      ),
    ).toThrow(/falls before periodStart/)
  })
})

/* ------------------------------------------------------------------ *
 * provenanceOf
 * ------------------------------------------------------------------ */

describe('provenanceOf', () => {
  // These cases are lifted from provenanceOf() in apps/web/app/treasury/page.tsx. The
  // two copies must agree: a row Treasury calls simulated and this agent calls a fact
  // would look right on both screens and be wrong in the only place it matters.
  it.each([
    ['api_cost', 'agent:Counting house', 'estimated'],
    ['revenue', 'agent:Counting house', 'simulated'],
    ['revenue', 'simulated:etsy', 'simulated'],
    ['revenue', 'mockgateway', 'simulated'],
    ['cogs', 'operator:derrik', 'manual'],
    ['cogs', 'user:derrik', 'manual'],
    ['revenue', 'invoice:etsy-2026-10', 'verified'],
    ['cogs', 'import:supplier-statement', 'verified'],
    ['expense', 'something-else', 'estimated'],
  ])('reads %s from %s as %s', (kind, source, expected) => {
    expect(provenanceOf(kind, source)).toBe(expected)
  })
})

/* ------------------------------------------------------------------ *
 * The note guards
 * ------------------------------------------------------------------ */

/**
 * A report whose figures are the ones the note fixtures quote.
 *
 * It used to carry revenue 1000 and contribution 100 while every note talked about a
 * poster losing $5.60 an order — so the figure cross-check had nothing to check
 * against and the fixtures were testing the hedging wording alone. A note quoting
 * amounts its report does not contain is the exact thing validateNote now rejects.
 */
function reportWith(provenance: 'verified' | 'estimated' | 'simulated'): FinanceReport {
  return buildFinanceReport({
    periodStart: EXPECTED_START,
    periodEnd: EXPECTED_END,
    entries: [{ amountCents: 2999, category: 'revenue', provenance, occurredAt: INSIDE }],
    orders: [{ sku: 'poster', revenueCents: 2999, contributionCents: -560, provenance }],
  })
}

describe('unhedgedClaims', () => {
  it('passes a figure that says what it rests on in the same sentence', () => {
    expect(
      unhedgedClaims('Contribution looks like roughly $412, on costs we have not confirmed.'),
    ).toEqual([])
  })

  it('catches a figure stated as a settled fact', () => {
    expect(unhedgedClaims('Contribution was $412 for the week.')).toEqual([
      'Contribution was $412 for the week.',
    ])
  })

  it('judges each sentence on its own, not the paragraph', () => {
    // A hedge three sentences away does not reach the sentence a reader quotes.
    const claims = unhedgedClaims(
      'These costs are estimates. Margin was 31% last week. We would check the invoice.',
    )
    expect(claims).toEqual(['Margin was 31% last week.'])
  })

  it('ignores sentences with no figure in them at all', () => {
    expect(unhedgedClaims('The poster is selling well and the supplier shipped on time.')).toEqual(
      [],
    )
  })

  it('catches a figure written in cents, which is the unit the model is handed', () => {
    // The report given to the model is denominated in cents — revenueCents,
    // contributionCents — so this is the sentence it is most likely to write. A guard
    // that only knows dollars and percents cannot see the units of its own input.
    expect(unhedgedClaims('Contribution was 1372c for the week.')).toEqual([
      'Contribution was 1372c for the week.',
    ])
    expect(unhedgedClaims('The poster gave back 560 cents an order.')).toHaveLength(1)
    expect(unhedgedClaims('Net for the week came to 2899.')).toHaveLength(1)
  })

  it('is not satisfied by a plan to check the figure later', () => {
    // "would" hedges the checking, not the claim. The sentence still tells the
    // operator, flatly, what the contribution was.
    expect(unhedgedClaims('Contribution was $412 and I would check the invoice.')).toEqual([
      'Contribution was $412 and I would check the invoice.',
    ])
    expect(unhedgedClaims('Margin was 31% if you exclude the refund.')).toHaveLength(1)
  })

  it('is not satisfied by "about" used to mean "concerning"', () => {
    expect(
      unhedgedClaims('This note is about the poster, which lost $5.60 an order.'),
    ).toHaveLength(1)
  })

  it('is not satisfied by rounding the number it states as a fact', () => {
    // Fuzzing a figure's precision says nothing about where the figure came from,
    // which is the only thing the rejection message asks for.
    expect(unhedgedClaims('The poster lost roughly $5.60 an order.')).toHaveLength(1)
  })

  it('does not read the period stamp as a claim about money', () => {
    // The model is handed the period as ISO and quotes it back in its first sentence.
    // Reading 2026 as a four-digit figure would refuse every note ever written.
    expect(
      unhedgedClaims('The period 2026-10-01 to 2026-10-07 covers both channels.'),
    ).toEqual([])
  })
})

describe('validateNote', () => {
  it('does not let a hedge in one field cover a bare figure in another', () => {
    /*
     * The fields were joined into one blob before being split on terminal punctuation,
     * so a hedge anywhere in the note licensed a flat money claim anywhere else.
     */
    const split = {
      ...hedgedNote,
      findings: [
        {
          whatISee: 'The poster lost $5.60 an order.',
          whatItProbablyMeans: 'These are catalogue costs nobody has confirmed.',
          whatIWouldCheckNext: 'Pull the invoice.',
        },
      ],
    }
    expect(validateNote(split, reportWith('estimated'))[0]).toMatch(/whatISee/)
  })

  it('does not let a field with no full stop borrow the next field’s hedge', () => {
    /*
     * The sharper version of the same hole. unhedgedClaims splits on terminal
     * punctuation, so a field ending without one merged into the following field and
     * the guard never saw the claim as its own sentence.
     */
    const merged = {
      ...hedgedNote,
      findings: [
        {
          // No full stop.
          whatISee: 'The poster lost $5.60 an order',
          whatItProbablyMeans: 'on catalogue costs nobody has confirmed.',
          whatIWouldCheckNext: 'Pull the invoice.',
        },
      ],
    }
    expect(validateNote(merged, reportWith('estimated')).length).toBeGreaterThan(0)
  })

  it('no longer accepts "probably" as a hedge, since the schema asks for it by name', () => {
    // The note's own field is called whatItProbablyMeans. A guard satisfied by a word
    // the prompt puts in the model's mouth is a formality, not a guard.
    expect(unhedgedClaims('The poster probably lost $5.60 an order.')).toEqual([
      'The poster probably lost $5.60 an order.',
    ])
    expect(unhedgedClaims('The poster likely lost $5.60 an order.')).toHaveLength(1)
  })

  it('rejects a figure that appears nowhere in the report', () => {
    /*
     * The agent is told it does not compute the figures. Nothing checked that it
     * did not — and for a `verified` report the prose was not examined at all, which
     * is where an invented number is most dangerous because nothing invites doubt.
     */
    const invented = {
      ...hedgedNote,
      findings: [
        {
          ...hedgedNote.findings[0]!,
          whatISee: 'The poster is losing $412.00 an order, on costs nobody has confirmed.',
        },
      ],
    }
    expect(validateNote(invented, reportWith('estimated'))[0]).toMatch(/appears nowhere/)
  })

  it('checks a verified report’s figures too, where the hedging check does not run', () => {
    const invented = {
      ...hedgedNote,
      findings: [{ ...hedgedNote.findings[0]!, whatISee: 'Contribution was $412.00.' }],
    }
    expect(validateNote(invented, reportWith('verified'))[0]).toMatch(/appears nowhere/)
  })

  it('allows a figure the report actually contains', () => {
    const quoted = {
      ...hedgedNote,
      findings: [
        {
          ...hedgedNote.findings[0]!,
          whatISee: 'Revenue was $29.99 this period, on catalogue costs nobody has confirmed.',
        },
      ],
    }
    expect(validateNote(quoted, reportWith('estimated'))).toEqual([])
  })

  it('allows a hypothetical figure in what it would check next', () => {
    // Interpretation and plan may reason beyond the report. "A $2 move would close the
    // gap" is the useful sentence, and rejecting it pushes the agent away from it.
    const plan = {
      ...hedgedNote,
      findings: [
        {
          ...hedgedNote.findings[0]!,
          whatIWouldCheckNext: 'Whether a $2.00 price rise would close the gap.',
        },
      ],
    }
    expect(validateNote(plan, reportWith('estimated'))).toEqual([])
  })

  it('accepts a hedged note over estimated figures', () => {
    expect(validateNote(hedgedNote, reportWith('estimated'))).toEqual([])
  })

  it('catches more than three findings', () => {
    // Structured outputs drop maxItems, so the model is only hinted at "at most three".
    const four = { ...hedgedNote, findings: Array.from({ length: 4 }, () => hedgedNote.findings[0]!) }
    expect(validateNote(four, reportWith('estimated'))[0]).toMatch(/4 findings; at most 3/)
  })

  it('catches a note with no findings at all', () => {
    expect(validateNote({ ...hedgedNote, findings: [] }, reportWith('estimated'))[0]).toMatch(
      /no findings/,
    )
  })

  it('catches an estimated figure written as a fact', () => {
    const confident = {
      ...hedgedNote,
      findings: [{ ...hedgedNote.findings[0]!, whatISee: 'The poster lost $5.60 an order.' }],
    }
    expect(validateNote(confident, reportWith('estimated'))[0]).toMatch(
      /states a estimated figure as though it were confirmed/,
    )
  })

  it('allows the same sentence when the figures really are verified', () => {
    const confident = {
      ...hedgedNote,
      findings: [{ ...hedgedNote.findings[0]!, whatISee: 'The poster lost $5.60 an order.' }],
    }
    expect(validateNote(confident, reportWith('verified'))).toEqual([])
  })

  it('catches a simulated period the note never admits to', () => {
    expect(validateNote(hedgedNote, reportWith('simulated'))).toContain(
      'the whole period is simulated and the note never says so',
    )
  })

  it('accepts a note that says the period is simulated', () => {
    expect(validateNote(simulatedNote, reportWith('simulated'))).toEqual([])
  })

  it('catches a finding with a blank field', () => {
    const blank = {
      ...hedgedNote,
      findings: [{ ...hedgedNote.findings[0]!, whatIWouldCheckNext: '  ' }],
    }
    expect(validateNote(blank, reportWith('estimated'))[0]).toMatch(
      /finding 1 leaves whatIWouldCheckNext blank/,
    )
  })

  it('catches a blank leastSureAbout, which is the whole point of asking', () => {
    expect(validateNote({ ...hedgedNote, leastSureAbout: '' }, reportWith('estimated'))).toContain(
      'leastSureAbout is blank; naming the weakest finding is the point of it',
    )
  })
})

/* ------------------------------------------------------------------ *
 * The marking
 * ------------------------------------------------------------------ */

describe('the marking travels with the note', () => {
  it('renders the marking before anything a reader could act on', () => {
    const rendered = renderCoveringNote({ marking: markingFor('estimated'), ...hedgedNote })
    expect(rendered.startsWith('ESTIMATED —')).toBe(true)
    expect(rendered.indexOf('ESTIMATED')).toBeLessThan(rendered.indexOf('$5.60'))
  })

  it('refuses an output whose note is marked better than its figures', () => {
    const base = {
      periodStart: EXPECTED_START.toISOString(),
      periodEnd: EXPECTED_END.toISOString(),
      revenueCents: 0,
      costsCents: 0,
      netCents: 0,
      provenance: 'simulated' as const,
      simulated: true,
      note: { marking: markingFor('verified'), ...hedgedNote },
      noteStatus: 'written' as const,
      noteProblems: [],
      skus: [],
      lossMakers: [],
      proposals: [],
      caveats: [],
      unpricedLineCount: 0,
      approvalId: null,
      status: 'no_action_proposed' as const,
    }

    expect(() => financeOutputSchema.parse(base)).toThrow(/but the figures are simulated/)
    expect(() =>
      financeOutputSchema.parse({ ...base, note: { marking: markingFor('simulated'), ...hedgedNote } }),
    ).not.toThrow()
  })

  it('refuses an output that claims a note it does not have', () => {
    expect(() =>
      financeOutputSchema.parse({
        periodStart: EXPECTED_START.toISOString(),
        periodEnd: EXPECTED_END.toISOString(),
        revenueCents: 0,
        costsCents: 0,
        netCents: 0,
        provenance: 'estimated',
        simulated: false,
        note: null,
        noteStatus: 'written',
        noteProblems: [],
        skus: [],
        lossMakers: [],
        proposals: [],
        caveats: [],
        unpricedLineCount: 0,
        approvalId: null,
        status: 'no_action_proposed',
      }),
    ).toThrow(/does not match whether a note is present/)
  })
})

/* ------------------------------------------------------------------ *
 * The agent
 * ------------------------------------------------------------------ */

describe('Counting house: a period becomes a report', () => {
  it('totals the ledger for the default period and marks the report at its weakest input', async () => {
    const division = await seedTwoSkus()

    const { output } = await runFinance({ division, modelQueue: [plainNote] })

    expect(output.periodStart).toBe(EXPECTED_START.toISOString())
    expect(output.periodEnd).toBe(EXPECTED_END.toISOString())
    expect(output.revenueCents).toBe(2899)
    expect(output.costsCents).toBe(-2090)
    expect(output.netCents).toBe(809)
    // The ledger rows are verified, but one SKU is costed from the catalogue, so the
    // whole report is worth no more than an estimate.
    expect(output.provenance).toBe('estimated')
    expect(output.simulated).toBe(false)
    expect(output.note?.marking).toBe(markingFor('estimated'))
  })

  it('costs a line from the supplier charge when there is one and the catalogue when there is not', async () => {
    const division = await seedTwoSkus()

    const { output } = await runFinance({ division, modelQueue: [plainNote] })

    const poster = output.skus.find((s) => s.sku === 'pet-portrait-poster-a2')!
    const remover = output.skus.find((s) => s.sku === 'pet-hair-remover-v1')!

    // We were charged 690c for the remover, so its contribution is a fact.
    expect(remover.provenance).toBe('verified')
    // Nobody has been billed for the poster; 1400c is a catalogue figure.
    expect(poster.provenance).toBe('estimated')
    expect(poster.contributionCents).toBeLessThan(0)
    expect(remover.contributionCents).toBeGreaterThan(0)
  })

  it('prefers the catalogue figure when a supplier order exists but has not been costed', async () => {
    // A routed job is not a charge. Treating ready_to_route as verified would mark a
    // number we have never been billed for as a fact.
    const division = await seedDivision()
    await addOrder(division.id, {
      channel: 'shopify',
      sku: 'routed-not-billed',
      unitPriceCents: 2000,
      catalogueCostCents: 500,
      supplierCostCents: 650,
      ref: 'SHOP-9',
    })
    const [routed] = await h.db
      .update(supplierOrders)
      .set({ costCents: null, status: 'ready_to_route' })
      .where(eq(supplierOrders.divisionId, division.id))
      .returning()
    expect(routed!.costCents).toBeNull()

    const { output } = await runFinance({ division, modelQueue: [plainNote] })
    expect(output.skus[0]!.provenance).toBe('estimated')
    // 500c catalogue, not the 650c that was never charged.
    expect(output.skus[0]!.contributionCents).toBeCloseTo(2000 - 500 - 88 - 40, 2)
  })

  it('charges the flat payment fee once per order, not once per line', async () => {
    // Shopify takes 30c per transaction. Charging it again on line two would invent a
    // cost the processor never took, and on a four-line order that is most of a dollar.
    const division = await seedDivision()
    const [order] = await h.db
      .insert(orders)
      .values({
        divisionId: division.id,
        shopifyOrderId: 'SHOP-TWO',
        totalCents: 4000,
        status: 'shipped',
        placedAt: INSIDE,
      })
      .returning()
    const [product] = await h.db
      .insert(products)
      .values({
        divisionId: division.id,
        type: 'other',
        title: 'bundle',
        description: 'seeded',
        priceCents: 2000,
        costCents: 500,
        status: 'published',
      })
      .returning()

    for (const n of [1, 2]) {
      await h.db.insert(orderLines).values({
        divisionId: division.id,
        orderId: order!.id,
        channel: 'shopify',
        channelOrderId: 'SHOP-TWO',
        channelLineItemId: `SHOP-TWO-${n}`,
        productId: product!.id,
        sku: 'bundle-item',
        quantity: 1,
        unitPriceCents: 2000,
      })
    }

    const { output } = await runFinance({ division, modelQueue: [plainNote] })

    // 1372 on the first line plus 1402 on the second. Double-charging would give 2744.
    expect(output.skus[0]!.contributionCents).toBeCloseTo(2774, 2)
  })

  it('does not mark a report verified while the fee rates inside it are unconfirmed', async () => {
    // Every cost here is an amount a supplier charged and every ledger row came off a
    // statement, so the cost side really is a fact. The contribution is still computed
    // through a 2.9% payment rate, a 30c flat fee and a 2% assumed refund rate that
    // nobody has checked — and "VERIFIED: every figure below traces to an invoice" is
    // not a true sentence about that number.
    const division = await seedDivision()
    await addLedger(division.id, [{ kind: 'revenue', amountCents: 1899, source: 'invoice:shopify' }])
    await addOrder(division.id, {
      channel: 'shopify',
      sku: 'pet-hair-remover-v1',
      unitPriceCents: 1899,
      catalogueCostCents: 600,
      supplierCostCents: 690,
      ref: 'SHOP-1',
    })

    const { output } = await runFinance({ division, modelQueue: [plainNote] })

    expect(output.provenance).toBe('estimated')
    expect(output.note!.marking).toBe(markingFor('estimated'))
    // The cost-side distinction is not lost — that is the whole point of the file.
    expect(output.skus[0]!.provenance).toBe('verified')
    expect(output.caveats.some((c) => /shopify fees —/.test(c))).toBe(true)
  })

  it('marks it verified once the operator confirms their own fee rates', async () => {
    const division = await seedDivision()
    await addLedger(division.id, [{ kind: 'revenue', amountCents: 1899, source: 'invoice:shopify' }])
    await addOrder(division.id, {
      channel: 'shopify',
      sku: 'pet-hair-remover-v1',
      unitPriceCents: 1899,
      catalogueCostCents: 600,
      supplierCostCents: 690,
      ref: 'SHOP-1',
    })

    const { output } = await runFinance({
      division,
      modelQueue: [plainNote],
      assumptions: {
        shopify: { ...defaultShopifyAssumptions(), confirmedAt: '2026-09-30T00:00:00.000Z' },
      },
    })

    expect(output.provenance).toBe('verified')
    expect(output.note!.marking).toBe(markingFor('verified'))
    expect(output.caveats.some((c) => /shopify fees —/.test(c))).toBe(false)
  })

  it('treats a zero catalogue cost as missing rather than as free', async () => {
    // pod.products.cost_cents is NOT NULL with no default, so a row nobody costed
    // holds 0. Reading that as a real cost turns the least complete rows in the
    // catalogue into the best performers in the report.
    const division = await seedDivision()
    await addOrder(division.id, {
      channel: 'etsy',
      sku: 'never-costed',
      unitPriceCents: 4000,
      catalogueCostCents: 0,
      ref: 'ETSY-Z',
    })

    const { output } = await runFinance({ division, modelQueue: [plainNote] })

    expect(output.unpricedLineCount).toBe(1)
    expect(output.skus).toEqual([])
    expect(output.proposals).toEqual([])
  })

  it('still charges the order its one flat payment fee when the first line cannot be costed', async () => {
    // The flat fee belongs to the order. Keying it to line zero meant an order whose
    // first line had no cost behind it paid the processor's 30c nowhere at all.
    const division = await seedDivision()
    const [order] = await h.db
      .insert(orders)
      .values({
        divisionId: division.id,
        shopifyOrderId: 'SHOP-MIXED',
        totalCents: 4000,
        status: 'shipped',
        placedAt: INSIDE,
      })
      .returning()
    const [product] = await h.db
      .insert(products)
      .values({
        divisionId: division.id,
        type: 'other',
        title: 'costed',
        description: 'seeded',
        priceCents: 2000,
        costCents: 500,
        status: 'published',
      })
      .returning()

    // Sorted by channel line id, so the uncostable line is unambiguously first.
    await h.db.insert(orderLines).values({
      divisionId: division.id,
      orderId: order!.id,
      channel: 'shopify',
      channelOrderId: 'SHOP-MIXED',
      channelLineItemId: 'SHOP-MIXED-A',
      productId: null,
      sku: 'mystery',
      quantity: 1,
      unitPriceCents: 2000,
    })
    await h.db.insert(orderLines).values({
      divisionId: division.id,
      orderId: order!.id,
      channel: 'shopify',
      channelOrderId: 'SHOP-MIXED',
      channelLineItemId: 'SHOP-MIXED-B',
      productId: product!.id,
      sku: 'costed-item',
      quantity: 1,
      unitPriceCents: 2000,
    })

    const { output } = await runFinance({ division, modelQueue: [plainNote] })

    expect(output.unpricedLineCount).toBe(1)
    // 2000 - 500 - 58 payment - 30 flat - 40 refund. Dropping the flat fee gives 1402.
    expect(output.skus[0]!.contributionCents).toBeCloseTo(1372, 2)
  })

  it('leaves a line with neither a charge nor a catalogue cost out instead of costing it at zero', async () => {
    const division = await seedDivision()
    await addOrder(division.id, {
      channel: 'etsy',
      sku: 'mystery-item',
      unitPriceCents: 4000,
      catalogueCostCents: null,
      ref: 'ETSY-X',
    })

    const { output } = await runFinance({ division, modelQueue: [plainNote] })

    // Costing it at zero would manufacture $34 of profit out of missing data.
    expect(output.unpricedLineCount).toBe(1)
    expect(output.skus).toEqual([])
    expect(output.caveats.some((c) => /neither a supplier charge nor a catalogue cost/.test(c))).toBe(
      true,
    )
  })

  it('dates an order with no placedAt by when the row was written rather than dropping it', async () => {
    const division = await seedDivision()
    await addOrder(division.id, {
      channel: 'etsy',
      sku: 'no-timestamp',
      unitPriceCents: 2500,
      catalogueCostCents: 900,
      placedAt: null,
      createdAt: INSIDE,
      ref: 'ETSY-NT',
    })

    const { output } = await runFinance({ division, modelQueue: [plainNote] })
    expect(output.skus.map((s) => s.sku)).toEqual(['no-timestamp'])
  })

  it('ignores orders and ledger rows outside the period', async () => {
    const division = await seedDivision()
    await addLedger(division.id, [
      { kind: 'revenue', amountCents: 5000, source: 'invoice:etsy', occurredAt: new Date('2026-09-30T23:00:00Z') },
      { kind: 'revenue', amountCents: 1000, source: 'invoice:etsy', occurredAt: INSIDE },
    ])
    await addOrder(division.id, {
      channel: 'etsy',
      sku: 'last-month',
      unitPriceCents: 9999,
      catalogueCostCents: 100,
      placedAt: new Date('2026-09-20T00:00:00Z'),
      ref: 'ETSY-OLD',
    })

    const { output } = await runFinance({ division, modelQueue: [plainNote] })
    expect(output.revenueCents).toBe(1000)
    expect(output.skus).toEqual([])
  })

  it('says so, loudly and in the output, when the whole period is simulated', async () => {
    const division = await seedTwoSkus({ posterSource: 'simulated:etsy' })

    const { output } = await runFinance({ division, modelQueue: [simulatedNote] })

    expect(output.provenance).toBe('simulated')
    expect(output.simulated).toBe(true)
    expect(output.note!.marking).toMatch(/^SIMULATED —/)
    expect(renderCoveringNote(output.note!).startsWith('SIMULATED —')).toBe(true)
  })

  it('carries one finding forward, with its provenance attached to it', async () => {
    const division = await seedTwoSkus()
    await runFinance({ division, modelQueue: [plainNote] })

    expect(remembered).toHaveLength(1)
    // A remembered "$5.60 shortfall" with no marking is how an estimate becomes a fact
    // three weeks later.
    expect(remembered[0]!.content).toMatch(/^\[estimated\] 2026-10-01\.\.2026-10-07/)
    expect(remembered[0]!.content).toContain('One SKU is contributing less than the others')
  })
})

describe('Counting house: the proposal', () => {
  it('files a price change for a loss-making SKU and leaves the price alone', async () => {
    const division = await seedTwoSkus()

    const { output } = await runFinance({ division, modelQueue: [plainNote] })

    expect(output.status).toBe('approval_requested')
    expect(output.approvalId).not.toBeNull()

    const [approval] = await h.db.select().from(approvals)
    expect(approval).toMatchObject({
      kind: 'price_change',
      category: 'loss_maker',
      refTable: PERIOD_REF_TABLE,
      decision: 'pending',
      autoDecided: false,
    })
    expect(approval!.refId).toBe(periodRef(EXPECTED_START, EXPECTED_END))

    // Nothing was repriced. price_change is never-auto, so the operator decides.
    const rows = await h.db.select().from(products)
    expect(rows.map((p) => p.priceCents).sort()).toEqual([1000, 1899])
  })

  it('hands over break-even arithmetic instead of picking a new price itself', async () => {
    const division = await seedTwoSkus()

    const { output } = await runFinance({ division, modelQueue: [plainNote] })

    const proposal = output.proposals.find((p) => p.sku === 'pet-portrait-poster-a2')!
    expect(proposal.observedUnitPriceCents).toBe(1000)
    // 1400c cost plus the Etsy flat fees over the proportional rates.
    expect(proposal.breakEvenPriceCents).toBe(1633)
    expect(proposal.provenance).toBe('estimated')
    expect(proposal.rationale).toMatch(/estimated costs nobody has confirmed/)

    // No pctChange: the agent proposes that somebody look, not what the number becomes.
    const [approval] = await h.db.select().from(approvals)
    expect(approval!.payload).not.toHaveProperty('pctChange')
  })

  it('says in the same sentence that the break-even price rests on unconfirmed fee rates', async () => {
    // This sentence sits on the inbox card next to a button that moves a price. The
    // rule the agent enforces on the model's prose has to hold for its own.
    const division = await seedTwoSkus()

    const { output } = await runFinance({ division, modelQueue: [plainNote] })

    const proposal = output.proposals.find((p) => p.sku === 'pet-portrait-poster-a2')!
    expect(proposal.rationale).toMatch(/1633c per unit under unconfirmed fee rates/)
    expect(proposal.rationale).toMatch(/Etsy published fee schedule/)
  })

  it('drops the caveat from the break-even sentence once the rates are confirmed', async () => {
    const division = await seedTwoSkus()

    const { output } = await runFinance({
      division,
      modelQueue: [plainNote],
      assumptions: {
        etsy: {
          ...defaultEtsyAssumptions(),
          confirmedAt: '2026-09-30T00:00:00.000Z',
        },
      },
    })

    const proposal = output.proposals.find((p) => p.sku === 'pet-portrait-poster-a2')!
    expect(proposal.rationale).not.toMatch(/unconfirmed fee rates/)
    expect(proposal.rationale).toMatch(/break even at 1633c per unit, against an observed 1000c/)
  })

  it('puts the marking in front of the findings in the approval payload', async () => {
    const division = await seedTwoSkus()
    await runFinance({ division, modelQueue: [plainNote] })

    const [approval] = await h.db.select().from(approvals)
    const payload = approval!.payload as { marking: string; renderedNote: string }
    expect(payload.marking).toBe(markingFor('estimated'))
    expect(payload.renderedNote.startsWith('ESTIMATED —')).toBe(true)
  })

  it('solves break-even from the dearest sale, not whichever came back last', async () => {
    /*
     * Every line overwrote the SKU's entry, so a SKU sold twice reported the
     * break-even and observed price of one arbitrary sale — and because the map is
     * keyed by SKU alone, that could be the PROFITABLE one, printed on the inbox card
     * beside a button that changes a price.
     */
    const division = await seedDivision()
    await addLedger(division.id, [
      { kind: 'revenue', amountCents: 2000, source: 'invoice:shopify' },
    ])
    // Cheap sale first, dear sale second: the dear one must drive the proposal.
    await addOrder(division.id, {
      channel: 'shopify',
      sku: 'drifty',
      unitPriceCents: 1000,
      catalogueCostCents: 300,
      supplierCostCents: 300,
      ref: 'SHOP-cheap',
    })
    await addOrder(division.id, {
      channel: 'shopify',
      sku: 'drifty',
      unitPriceCents: 1000,
      catalogueCostCents: 300,
      supplierCostCents: 2600,
      ref: 'SHOP-dear',
    })

    const { output } = await runFinance({ division, modelQueue: [plainNote] })
    const proposal = output.proposals.find((p) => p.sku === 'drifty')

    expect(proposal).toBeDefined()
    // Break-even has to cover the 2600c line, not the 300c one.
    expect(proposal!.breakEvenPriceCents).toBeGreaterThan(2600)
    expect(proposal!.rationale).toMatch(/did not all have the same cost/)
    expect(proposal!.rationale).toMatch(/worst of 2/)
  })

  it('proposes nothing when every SKU contributes', async () => {
    const division = await seedDivision()
    await addLedger(division.id, [{ kind: 'revenue', amountCents: 1899, source: 'invoice:shopify' }])
    await addOrder(division.id, {
      channel: 'shopify',
      sku: 'pet-hair-remover-v1',
      unitPriceCents: 1899,
      catalogueCostCents: 600,
      supplierCostCents: 690,
      ref: 'SHOP-1',
    })

    const { output } = await runFinance({ division, modelQueue: [plainNote] })

    expect(output.status).toBe('no_action_proposed')
    expect(output.approvalId).toBeNull()
    expect(output.proposals).toEqual([])
    expect(await h.db.select().from(approvals)).toHaveLength(0)
  })

  it('does not file a second proposal when the schedule tick is redelivered', async () => {
    const division = await seedTwoSkus()
    await runFinance({ division, modelQueue: [plainNote] })

    // Two identical proposals for one week means the operator approves both and the
    // same price moves twice.
    const second = await runFinance({ division, modelQueue: [plainNote] })

    expect(second.output.status).toBe('already_requested')
    expect(await h.db.select().from(approvals)).toHaveLength(1)
    expect(second.output.approvalId).toBe(
      (await h.db.select().from(approvals))[0]!.id,
    )
  })

  it('files a separate proposal for a different period', async () => {
    const division = await seedTwoSkus()
    await runFinance({ division, modelQueue: [plainNote] })

    // Last month is a different question, and the ref is the period for exactly this
    // reason.
    await runFinance({
      division,
      modelQueue: [plainNote],
      input: { periodStart: '2026-10-01T00:00:00.000Z', periodEnd: '2026-10-05T00:00:00.000Z' },
    })

    expect(await h.db.select().from(approvals)).toHaveLength(2)
  })
})

describe('Counting house: when the model gets it wrong', () => {
  it('retries once, telling the model exactly what was wrong', async () => {
    const division = await seedTwoSkus()
    const tooMany = { ...hedgedNote, findings: Array.from({ length: 5 }, () => hedgedNote.findings[0]!) }

    const { output, model } = await runFinance({ division, modelQueue: [tooMany, hedgedNote] })

    expect(output.noteStatus).toBe('written')
    expect(model.requests).toHaveLength(2)
    const retry = model.requests[1]!.parts[0] as { text: string }
    expect(retry.text).toMatch(/Your previous note was rejected: there are 5 findings/)
  })

  it('ships the figures without a note rather than withholding them', async () => {
    const division = await seedTwoSkus()
    const confident = {
      ...hedgedNote,
      findings: [{ ...hedgedNote.findings[0]!, whatISee: 'The poster lost $5.60 an order.' }],
    }

    const { output } = await runFinance({ division, modelQueue: [confident, confident] })

    expect(output.noteStatus).toBe('rejected')
    expect(output.note).toBeNull()
    expect(output.noteProblems[0]).toMatch(/as though it were confirmed/)
    // The arithmetic was never the model's, so it is still correct and still shipped.
    expect(output.netCents).toBe(809)
    expect(output.status).toBe('approval_requested')
  })

  it('refuses a period it cannot make sense of, without retrying', async () => {
    const division = await seedDivision()

    await expect(
      runFinance({ division, modelQueue: [], input: { periodStart: '2026-10-01T00:00:00.000Z' } }),
    ).rejects.toThrow(/both periodStart and periodEnd/)

    // Nothing was filed and no model call was paid for.
    expect(await h.db.select().from(approvals)).toHaveLength(0)
  })
})
