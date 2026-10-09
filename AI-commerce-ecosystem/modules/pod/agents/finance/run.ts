/**
 * The Counting house (SPEC.md §Module 1 → Finance analyst).
 *
 * A period in; the figures, a covering note, and — when something loses money on every
 * sale — one proposal sitting in the operator's inbox.
 *
 * The arithmetic is not the model's. `buildFinanceReport` totals the ledger and
 * `orderEconomics` works out what each line left behind, because a program does that
 * correctly every time and a language model does it convincingly most of the time. The
 * model's only job here is the covering note, and even that is refused if it describes
 * an estimate in the language of a fact.
 *
 * Nothing in this file changes a price, pauses a product or moves money. The one side
 * effect it can cause is an approval, and a person causes what happens next.
 */

import { ledger } from '@acf/db'
import type { AgentContext, AgentDefinition } from '@acf/core/runtime'
import { NonRetriableError } from '@acf/core/runtime'
import { MODELS, type ModelClient } from '@acf/integrations/anthropic'
import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm'

import {
  breakEvenPriceCents,
  defaultEtsyAssumptions,
  defaultShopifyAssumptions,
  orderEconomics,
  type FeeAssumptions,
  type Provenance,
} from '../../economics'
import type { Channel } from '../../channel-rules'
import { orderLines, orders, products, supplierOrders } from '../../schema/index'
import { FINANCE_SYSTEM_PROMPT } from './index'
import {
  buildFinanceReport,
  type FinanceReport,
  type LedgerEntry,
  type OrderContribution,
} from './report'
import {
  financeOutputSchema,
  markingFor,
  MAX_FINDINGS,
  modelNoteSchema,
  renderCoveringNote,
  type CoveringNote,
  type FinanceInput,
  type FinanceOutput,
  type ModelNote,
  type Proposal,
} from './schema'

/**
 * Read-only by construction.
 *
 * The Counting house selects. It has no insert and no update, so no bug in it can
 * restate the ledger it is reporting on.
 */
type Db = { select: (...args: never[]) => never } & Record<string, unknown>

// Imported rather than redeclared. channel-rules.ts already owns this vocabulary, and
// a second identical definition is how the two quietly diverge — and how the pod
// module's barrel ends up exporting the same name twice.
export type { Channel }

export interface FinanceDeps {
  db: Db
  model: ModelClient
  /**
   * Injected so a report is reproducible. `run()` never reads the wall clock: a report
   * that cannot be re-derived next month is not an audit trail, it is an anecdote.
   */
  now?: () => Date
  /**
   * Fee rates the operator has confirmed against their own account. Anything missing
   * falls back to the published schedule, which is an assumption and is caveated as one.
   */
  assumptions?: Partial<Record<Channel, FeeAssumptions>>
}

/** The default window: the previous complete seven days. */
export const DEFAULT_PERIOD_DAYS = 7

const DAY_MS = 86_400_000

/**
 * There is no `pod.finance_reports` table yet, so the approval points at the period
 * itself rather than at a row. That is the whole idempotency key: one live price-change
 * proposal per division per period. When a reports table exists this becomes its row id,
 * and this constant plus `periodRef` are the two things that have to change together.
 */
export const PERIOD_REF_TABLE = 'pod.finance_period'

export function periodRef(periodStart: Date, periodEnd: Date): string {
  return `${periodStart.toISOString()}..${periodEnd.toISOString()}`
}

/* ------------------------------------------------------------------ *
 * Provenance
 * ------------------------------------------------------------------ */

/**
 * How much a ledger row can be trusted, derived from the `source` string the writer
 * had to supply anyway rather than from a flag someone forgets to set.
 *
 * This is a deliberate copy of `provenanceOf()` in apps/web/app/treasury/page.tsx and
 * THE TWO MUST AGREE. A row the Treasury screen labels "simulated" while this agent
 * treats it as a fact is exactly the failure the marking exists to prevent, and it
 * would be invisible: both screens would look right on their own.
 *
 * There is no single home for it yet. The web app cannot import a module, a module
 * cannot import the web app, and core has no opinion about provenance — `ledger` stores
 * the source string and nothing more. It belongs in @acf/core the moment a second
 * module needs it; until then it is duplicated on purpose.
 */
export function provenanceOf(kind: string, source: string): Provenance {
  if (source.startsWith('agent:')) {
    // Priced from a model rate table at run time. Never a bill.
    return kind === 'api_cost' ? 'estimated' : 'simulated'
  }
  if (source.startsWith('mock') || source.includes('simulat')) return 'simulated'
  if (source.startsWith('operator') || source.startsWith('user:')) return 'manual'
  if (source.startsWith('invoice:') || source.startsWith('import:')) return 'verified'
  return 'estimated'
}

/* ------------------------------------------------------------------ *
 * The period
 * ------------------------------------------------------------------ */

export interface Period {
  periodStart: Date
  periodEnd: Date
  /** True when the window has not closed yet, so the figures will keep moving. */
  open: boolean
}

/** A date, or a date and a time, written the one way that means the same thing everywhere. */
const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/

/**
 * Work out which days this report covers.
 *
 * The default is the previous COMPLETE days, never a window ending now. A Monday
 * 07:00 run that counts seven hours of Monday reads as a collapse in revenue against
 * a week that counted a full seventh day, and the agent would file a price change
 * about it. Only a window that compares to itself is worth comparing.
 */
export function resolvePeriod(input: FinanceInput, now: Date): Period {
  const hasStart = typeof input.periodStart === 'string' && input.periodStart !== ''
  const hasEnd = typeof input.periodEnd === 'string' && input.periodEnd !== ''

  if (hasStart !== hasEnd) {
    throw new NonRetriableError(
      'a period needs both periodStart and periodEnd; one alone is a mistake, not a default',
    )
  }

  if (!hasStart) {
    const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    return {
      periodStart: new Date(midnight - DEFAULT_PERIOD_DAYS * DAY_MS),
      // The last instant of yesterday, because the report filter is inclusive at both
      // ends and a period ending at midnight would swallow one row from today.
      periodEnd: new Date(midnight - 1),
      open: false,
    }
  }

  const startText = input.periodStart as string
  const endText = input.periodEnd as string

  // Shape first, then parse. `new Date('01/02/2026')` succeeds and means January in
  // one country and February in another, so a parse-only check hands back a confident
  // report for a month the operator did not ask about.
  if (!ISO_TIMESTAMP.test(startText) || !ISO_TIMESTAMP.test(endText)) {
    throw new NonRetriableError(
      `period "${input.periodStart}".."${input.periodEnd}" is not a pair of ISO timestamps`,
    )
  }

  const periodStart = new Date(startText)
  const periodEnd = new Date(endText)

  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
    throw new NonRetriableError(
      `period "${input.periodStart}".."${input.periodEnd}" is not a pair of ISO timestamps`,
    )
  }
  if (periodEnd < periodStart) {
    throw new NonRetriableError('periodEnd falls before periodStart')
  }

  return { periodStart, periodEnd, open: periodEnd > now }
}

/* ------------------------------------------------------------------ *
 * Checking what structured outputs could not enforce
 * ------------------------------------------------------------------ */

/**
 * A period stamp, which is not a figure about money.
 *
 * Stripped before the figure test, because the model is handed the period as ISO and
 * quotes it back in its first sentence. Without this, "2026-10-01" reads as a four
 * digit number, every opening sentence is refused, and the agent files a noteless
 * report every week for a reason that has nothing to do with money.
 */
const DATE_LIKE = /\b\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+Z?)?/g

/**
 * A figure a reader would take as a claim about money.
 *
 * Over-broad ON PURPOSE, and this is the direction the over-breadth has to run: a
 * figure caught that did not need hedging costs one retry, a figure missed puts an
 * unqualified number in front of the operator.
 *
 * Cents are here because the report handed to the model is denominated in cents —
 * `revenueCents`, `contributionCents` — so "contribution was 1372c" is the sentence a
 * model is most likely to write, and a dollars-and-percent pattern cannot see it at
 * all. A guard blind to the units of its own input is not a guard.
 */
const FIGURE = new RegExp(
  [
    String.raw`\$\s?-?[\d,]+(?:\.\d+)?`, // $412, $5.60
    String.raw`-?[\d,]+(?:\.\d+)?\s?%`, // 31%
    String.raw`-?[\d,]+(?:\.\d+)?\s?(?:¢|c\b|cents?\b|dollars?\b|usd\b)`, // 1372c, 560 cents
    String.raw`-?\d[\d,]*\.\d+`, // 5.60
    String.raw`-?\d{1,3}(?:,\d{3})+`, // 1,372
    String.raw`-?\d{3,}`, // 1372
  ].join('|'),
  'i',
)

/**
 * Anything that stops a sentence reading as a settled fact.
 *
 * Narrow ON PURPOSE, which is the opposite of FIGURE and for the same reason. Every
 * word here has to do the job the rejection message asks for — say what the figure
 * rests on — because a word that merely co-occurs with money lets a model satisfy the
 * guard by accident.
 *
 * Three families were removed after they were found to pass sentences the guard exists
 * to catch:
 *   - `would`, `may`, `might`, `if` hedge an ACTION, not a figure. "Contribution was
 *     $412 and I would check the invoice" is a flat claim with a plan attached, and it
 *     passed.
 *   - `about` and `around` are the commonest words in English for "concerning". "A
 *     note about the poster, which lost $5.60 an order" passed on the preposition.
 *   - `roughly` and `approximately` fuzz the PRECISION of a number without saying
 *     anything about where it came from. "The poster lost roughly $5.60" is still a
 *     claim that the poster lost money.
 */
const HEDGE =
  /\b(estimat\w*|assum\w*|unconfirm\w*|unverified|not (?:been )?(?:confirmed|checked|verified)|nobody has|we have not|haven't|simulat\w*|demo\b|fictional|catalogue|catalog|appears?|looks? like|seems?|probabl\w*|likel\w*|direction rather than|rather than a balance)\b/i

/**
 * Words that admit the period is demo data.
 *
 * `demo\b` rather than `demo\w*`: "demonstrates" is not an admission, and a note
 * reading "this demonstrates a shortfall" must not count as one.
 */
const ADMITS_SIMULATION =
  /\b(simulat\w*|demo\b|fictional|not real|no money (?:actually )?moved|nothing .{0,30}moved)\b/i

/**
 * Sentences that state a figure and give the reader no reason to doubt it.
 *
 * Exported because it is the guard worth testing on its own: the model is perfectly
 * capable of writing "contribution was $412" over costs nobody has ever checked.
 */
export function unhedgedClaims(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => {
      if (s.length === 0 || HEDGE.test(s)) return false
      // Dates are stripped for the test only. The sentence is reported back to the
      // model as the model wrote it, or the rejection names a sentence it cannot find.
      return FIGURE.test(s.replace(DATE_LIKE, ' '))
    })
}

/** Every field of the note, as one body of prose. */
function noteText(note: ModelNote): string {
  return [
    ...note.findings.flatMap((f) => [f.whatISee, f.whatItProbablyMeans, f.whatIWouldCheckNext]),
    note.leastSureAbout,
  ].join(' ')
}

/**
 * Check what the JSON Schema could not.
 *
 * The SDK drops `maxItems`, so "at most three findings" reaches the model as a hint and
 * nothing more. The provenance rules never had a schema keyword to be dropped from.
 */
export function validateNote(note: ModelNote, report: FinanceReport): string[] {
  const problems: string[] = []

  if (note.findings.length === 0) {
    problems.push('there are no findings; if the period is empty, the finding is that it is empty')
  }
  if (note.findings.length > MAX_FINDINGS) {
    problems.push(
      `there are ${note.findings.length} findings; at most ${MAX_FINDINGS} are allowed`,
    )
  }

  note.findings.forEach((f, i) => {
    const blank = (
      [
        ['whatISee', f.whatISee],
        ['whatItProbablyMeans', f.whatItProbablyMeans],
        ['whatIWouldCheckNext', f.whatIWouldCheckNext],
      ] as const
    )
      .filter(([, v]) => v.trim() === '')
      .map(([k]) => k)
    if (blank.length > 0) {
      problems.push(`finding ${i + 1} leaves ${blank.join(' and ')} blank`)
    }
  })

  if (note.leastSureAbout.trim() === '') {
    problems.push('leastSureAbout is blank; naming the weakest finding is the point of it')
  }

  // The figures are only worth their weakest input, so prose written over them has to
  // say so. A sentence quoting a dollar amount with nothing qualifying it reads as a
  // bank statement whatever the header above it said.
  if (report.provenance !== 'verified') {
    for (const sentence of unhedgedClaims(noteText(note))) {
      problems.push(
        `"${sentence}" states a ${report.provenance} figure as though it were confirmed; ` +
          'say what it rests on in the same sentence',
      )
    }
  }

  if (report.provenance === 'simulated' && !ADMITS_SIMULATION.test(noteText(note))) {
    problems.push('the whole period is simulated and the note never says so')
  }

  return problems
}

/* ------------------------------------------------------------------ *
 * Contributions
 * ------------------------------------------------------------------ */

interface BreakEvenInputs {
  /** Per unit, so the break-even figure is a price someone could actually set. */
  itemCostCents: number
  shippingChargedCents: number
  shippingCostCents: number
  assumptions: FeeAssumptions
  observedUnitPriceCents: number
}

function assumptionsFor(deps: FinanceDeps, channel: Channel): FeeAssumptions {
  const supplied = deps.assumptions?.[channel]
  if (supplied) return supplied
  return channel === 'etsy' ? defaultEtsyAssumptions() : defaultShopifyAssumptions()
}

/* ------------------------------------------------------------------ *
 * The agent
 * ------------------------------------------------------------------ */

export function createFinanceAgent(
  deps: FinanceDeps,
): AgentDefinition<FinanceInput, FinanceOutput> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural db type
  const db = deps.db as any
  const clock = deps.now ?? (() => new Date())

  return {
    key: 'finance',
    outputSchema: financeOutputSchema,

    async run(ctx: AgentContext<FinanceInput>): Promise<FinanceOutput> {
      const divisionId = ctx.division.id
      const { periodStart, periodEnd, open } = resolvePeriod(ctx.input ?? {}, clock())

      /* ---------------- the ledger ---------------- */

      const ledgerRows = await db
        .select()
        .from(ledger)
        .where(
          and(
            eq(ledger.divisionId, divisionId),
            gte(ledger.occurredAt, periodStart),
            lte(ledger.occurredAt, periodEnd),
          ),
        )

      const entries: LedgerEntry[] = ledgerRows.map((row: Record<string, unknown>) => ({
        // numeric(18,6), because a single model call costs a fraction of a cent and
        // rounding each to the nearest one turns the whole API bill into zero.
        amountCents: Number(row['amountCents']),
        category: String(row['kind']),
        provenance: provenanceOf(String(row['kind']), String(row['source'])),
        occurredAt: row['occurredAt'] as Date,
      }))

      /* ---------------- the orders ---------------- */

      const orderRows = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.divisionId, divisionId),
            or(
              and(gte(orders.placedAt, periodStart), lte(orders.placedAt, periodEnd)),
              // An order with no placedAt is not an order outside the period — it is an
              // order whose channel sent no timestamp. Dropping it in SQL would
              // understate a week silently, so it comes back and is dated below.
              isNull(orders.placedAt),
            ),
          ),
        )

      const inPeriod = orderRows.filter((o: Record<string, unknown>) => {
        const at = (o['placedAt'] as Date | null) ?? (o['createdAt'] as Date)
        return at >= periodStart && at <= periodEnd
      })

      const orderIds = inPeriod.map((o: { id: string }) => o.id)
      const lineRows: Array<Record<string, unknown>> =
        orderIds.length === 0
          ? []
          : await db.select().from(orderLines).where(inArray(orderLines.orderId, orderIds))

      const lineIds = lineRows.map((l) => String(l['id']))
      const supplierRows: Array<Record<string, unknown>> =
        lineIds.length === 0
          ? []
          : await db
              .select()
              .from(supplierOrders)
              .where(inArray(supplierOrders.orderLineId, lineIds))

      const productIds = [
        ...new Set(lineRows.map((l) => l['productId']).filter((id): id is string => !!id)),
      ]
      const productRows: Array<Record<string, unknown>> =
        productIds.length === 0
          ? []
          : await db.select().from(products).where(inArray(products.id, productIds))

      const supplierByLine = new Map(supplierRows.map((s) => [String(s['orderLineId']), s]))
      const productById = new Map(productRows.map((p) => [String(p['id']), p]))

      const linesByOrder = new Map<string, Array<Record<string, unknown>>>()
      for (const line of lineRows) {
        const key = String(line['orderId'])
        const bucket = linesByOrder.get(key)
        if (bucket) bucket.push(line)
        else linesByOrder.set(key, [line])
      }

      // Postgres makes no promise about row order without an ORDER BY, and one fee
      // below is charged to exactly one line of each order. Left to the planner, the
      // same week could total differently on two runs and neither would be wrong.
      for (const bucket of linesByOrder.values()) {
        bucket.sort((a, b) =>
          String(a['channelLineItemId']).localeCompare(String(b['channelLineItemId'])),
        )
      }

      const contributions: OrderContribution[] = []
      const breakEvenBySku = new Map<string, BreakEvenInputs>()
      const channelsSeen = new Set<Channel>()
      let unpricedLineCount = 0

      for (const order of inPeriod) {
        const lines = linesByOrder.get(String(order['id'])) ?? []
        // The flat payment fee belongs to the ORDER. It is attached to the first line
        // that can actually be costed rather than to line zero, because a line with no
        // cost behind it never reaches the arithmetic — and keying on the index meant
        // an order whose first line was unpriced paid the processor's flat fee nowhere
        // at all, which quietly adds 25-30c of invented profit to every such order.
        let flatFeeCharged = false

        lines.forEach((line) => {
          const channel = String(line['channel']) as Channel
          channelsSeen.add(channel)

          const quantity = Number(line['quantity']) || 1
          const unitPriceCents = Number(line['unitPriceCents']) || 0
          const supplier = supplierByLine.get(String(line['id']))
          const product = line['productId']
            ? productById.get(String(line['productId']))
            : undefined

          /*
           * The distinction this agent exists for.
           *
           * A supplier_orders row carrying a cost is an amount we were CHARGED — a real
           * invoice line, so the contribution built on it is verified. products.cost_cents
           * is a catalogue figure somebody typed when the listing was created; it is what
           * we expect to pay, and the supplier's actual charge drifts from it (the demo
           * division ships with a deliberate 90c drift for exactly this reason). A
           * contribution built on it is an estimate and is marked as one, all the way
           * through to the covering note and the proposal.
           *
           * A supplier row with a NULL cost is not a charge — it is a job we have routed
           * and not yet been billed for — so it falls back to the catalogue the same way.
           */
          let itemCostCents: number
          let unitCostCents: number
          let costProvenance: Provenance

          const catalogueCostCents = Number(product?.['costCents'] ?? 0)

          if (supplier && supplier['costCents'] !== null && supplier['costCents'] !== undefined) {
            // The supplier order covers the whole line, so this is already the line's
            // cost in exact cents. The per-unit figure below is only for the break-even
            // price, and dividing one invoice line by quantity assumes the supplier
            // charged no setup fee — which is another reason break-even is proposed for
            // a person to check rather than applied.
            itemCostCents = Number(supplier['costCents'])
            unitCostCents = itemCostCents / quantity
            costProvenance = 'verified'
          } else if (product && catalogueCostCents > 0) {
            unitCostCents = catalogueCostCents
            itemCostCents = unitCostCents * quantity
            costProvenance = 'estimated'
          } else {
            /*
             * No charge and no usable catalogue figure. Costing it at zero would
             * manufacture a profit out of missing data, which is the one thing worse
             * than no number.
             *
             * A zero counts as missing, not as free. products.cost_cents is NOT NULL
             * with no default, so there is no value in the column that means "nobody
             * filled this in" — a row that was never costed holds 0, and nothing we
             * print or route costs nothing to make. Reading that 0 as a real cost is
             * how the most incomplete rows in the catalogue become the best-performing
             * SKUs in the report, which is exactly backwards.
             */
            unpricedLineCount += 1
            return
          }

          const base = assumptionsFor(deps, channel)
          const assumptions: FeeAssumptions = flatFeeCharged
            ? // The flat payment fee is taken once per order, not once per line. The
              // listing fee is genuinely per listing, so it stays. Charging the flat
              // fee again on line four invents a cost the processor never took.
              { ...base, paymentFeeFlatCents: 0 }
            : base
          flatFeeCharged = true

          const econ = orderEconomics({
            itemPriceCents: unitPriceCents * quantity,
            // Not stored per line — see the schema gap in the agent's report. Treating
            // shipping as built into the price is an assumption, and it is caveated.
            shippingChargedCents: 0,
            itemCostCents,
            shippingCostCents: 0,
            assumptions,
          })

          const sku =
            (line['sku'] as string | null) ??
            (line['productId'] ? `product:${String(line['productId'])}` : '(no sku)')

          contributions.push({
            sku,
            revenueCents: econ.revenueCents,
            contributionCents: econ.contributionCents,
            // The COST side only. Every fee above is an assumption in every case, which
            // is why the fee source is declared as an unconfirmed assumption instead of
            // quietly dragging every row down to `estimated`.
            provenance: costProvenance,
          })

          breakEvenBySku.set(sku, {
            itemCostCents: unitCostCents,
            shippingChargedCents: 0,
            shippingCostCents: 0,
            assumptions: base,
            observedUnitPriceCents: unitPriceCents,
          })
        })
      }

      /* ---------------- the report ---------------- */

      const unconfirmedAssumptions: string[] = []
      let feesConfirmed = true
      for (const channel of channelsSeen) {
        const a = assumptionsFor(deps, channel)
        if (!a.confirmedAt) {
          feesConfirmed = false
          unconfirmedAssumptions.push(
            `${channel} fees — ${a.source}: ` +
              `${(a.transactionFeeRate * 100).toFixed(1)}% commission, ` +
              `${(a.paymentFeeRate * 100).toFixed(1)}% + ${a.paymentFeeFlatCents}c payment, ` +
              `${(a.refundRate * 100).toFixed(1)}% assumed refunds. Every contribution below ` +
              'is computed through these.',
          )
        }
      }
      if (lineRows.length > 0) {
        unconfirmedAssumptions.push(
          'shipping charged to the buyer is not recorded per line, so every contribution ' +
            'assumes shipping is inside the item price',
        )
      }
      if (unpricedLineCount > 0) {
        unconfirmedAssumptions.push(
          `${unpricedLineCount} order line(s) have neither a supplier charge nor a catalogue ` +
            'cost above zero, and are left out of the contribution table entirely rather ' +
            'than costed at nothing',
        )
      }
      if (open) {
        unconfirmedAssumptions.push(
          'this period has not ended yet, so the figures are a part-period and will keep moving',
        )
      }

      const report = buildFinanceReport({
        periodStart,
        periodEnd,
        entries,
        orders: contributions,
        unconfirmedAssumptions,
        /*
         * The fee rates are an input to every contribution, so the report cannot be
         * marked better than they are.
         *
         * Each row's own `provenance` still describes its COST side — that distinction
         * is the point of the file and it survives into `skus[]` and into the proposal.
         * But the top-line marking is a sentence to a person, and "VERIFIED — every
         * figure below traces to an invoice" is not true of a net computed through a
         * 6.5% commission, a 3% payment rate and a 2% assumed refund rate that nobody
         * has checked against a statement. It also switches the hedging guard off: by
         * the standard this agent holds the model's prose to, calling that net verified
         * is itself presenting an estimate as a fact. Confirm the rates (pass
         * `assumptions` with a `confirmedAt`) and 'verified' is reachable again, which
         * is the right way round for the incentive to point.
         */
        assumptionProvenance: feesConfirmed ? 'verified' : 'estimated',
      })

      const marking = markingFor(report.provenance)

      await ctx.log(
        'pod.finance_report',
        `${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}: ` +
          `net ${report.netCents}c over ${contributions.length} line(s), ${report.provenance}`,
        { refTable: PERIOD_REF_TABLE, refId: periodRef(periodStart, periodEnd) },
      )

      if (unpricedLineCount > 0) {
        await ctx.log(
          'pod.finance_unpriced_lines',
          `${unpricedLineCount} order line(s) have no cost behind them and were left out`,
          { level: 'warn', refTable: PERIOD_REF_TABLE, refId: periodRef(periodStart, periodEnd) },
        )
      }

      /* ---------------- the covering note ---------------- */

      const reportForModel = JSON.stringify(
        {
          marking,
          provenance: report.provenance,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          revenueCents: report.revenueCents,
          costsCents: report.costsCents,
          netCents: report.netCents,
          byCategory: report.byCategory,
          skus: report.skus,
          lossMakers: report.lossMakers,
          caveats: report.caveats,
        },
        null,
        2,
      )

      let note: CoveringNote | null = null
      let noteProblems: string[] = []

      // Twice, not four times: the second attempt is told exactly what was wrong, and a
      // model that cannot hedge a sentence when handed the sentence will not get there
      // on the third try either.
      for (let attempt = 1; attempt <= 2 && note === null; attempt++) {
        const result = await deps.model.structured({
          model: MODELS.routine,
          system: ctx.agent.systemPrompt || FINANCE_SYSTEM_PROMPT,
          parts: [
            {
              kind: 'text',
              text: [
                `Period: ${periodStart.toISOString()} to ${periodEnd.toISOString()}`,
                `Provenance of this report: ${report.provenance}`,
                marking,
                '',
                'The report, already totalled. Every figure you cite must come from it:',
                reportForModel,
                '',
                report.provenance === 'verified'
                  ? ''
                  : 'These figures are NOT confirmed. Any sentence quoting an amount must say ' +
                    'in that same sentence what it rests on.',
                noteProblems.length > 0
                  ? `Your previous note was rejected: ${noteProblems.join('; ')}. Fix exactly those and change nothing else.`
                  : '',
              ]
                .filter(Boolean)
                .join('\n'),
            },
          ],
          schema: modelNoteSchema,
        })
        ctx.recordUsage(result.usage)

        noteProblems = validateNote(result.output, report)
        if (noteProblems.length === 0) {
          note = { marking, ...result.output }
        }
      }

      if (note === null) {
        /*
         * The figures still ship.
         *
         * They were computed in code and are correct whatever the prose did; withholding
         * them because the covering note could not be written would punish the operator
         * for the model's mistake. It is logged at error level because a station that
         * quietly files a noteless report every week is a station nobody notices has
         * stopped thinking.
         */
        await ctx.log(
          'pod.finance_note_rejected',
          `the covering note was refused twice: ${noteProblems.join('; ')}`,
          { level: 'error', refTable: PERIOD_REF_TABLE, refId: periodRef(periodStart, periodEnd) },
        )
      }

      /* ---------------- what to carry forward ---------------- */

      const topFinding = note?.findings[0]
      ctx.remember({
        kind: 'result',
        // The marking travels with it. A memory outlives the report it came from, and a
        // remembered "$412 contribution" with no provenance on it is how an estimate
        // becomes a fact three weeks later.
        content: topFinding
          ? `[${report.provenance}] ${periodStart.toISOString().slice(0, 10)}..${periodEnd
              .toISOString()
              .slice(0, 10)}: ${topFinding.whatISee} — ${topFinding.whatItProbablyMeans}`
          : `[${report.provenance}] ${periodStart.toISOString().slice(0, 10)}..${periodEnd
              .toISOString()
              .slice(0, 10)}: net ${report.netCents}c, ${report.lossMakers.length} loss-making SKU(s), no covering note written.`,
        importance: report.lossMakers.length > 0 ? 0.6 : 0.35,
      })

      /* ---------------- the proposal ---------------- */

      const proposals: Proposal[] = report.lossMakers.map((row) => {
        const inputs = breakEvenBySku.get(row.sku)
        const breakEven = inputs
          ? breakEvenPriceCents({
              itemCostCents: inputs.itemCostCents,
              shippingChargedCents: inputs.shippingChargedCents,
              shippingCostCents: inputs.shippingCostCents,
              assumptions: inputs.assumptions,
            })
          : null

        const rests =
          row.provenance === 'verified'
            ? 'on costs we were charged'
            : `on ${row.provenance} costs nobody has confirmed`

        /*
         * The break-even price is solved from the same fee rates, so when those rates
         * are the published schedule rather than this account's, the figure says so in
         * the same sentence it appears in.
         *
         * This is the rule the agent enforces on the model's prose, and it has to hold
         * for the prose the agent writes itself — more so, because this sentence is
         * what the operator reads on the inbox card next to a button that changes a
         * price. A row marked 'verified' on its cost side still has an unconfirmed
         * commission inside its break-even.
         */
        const feeSource = inputs?.assumptions
        const underRates =
          feeSource && !feeSource.confirmedAt
            ? ` under unconfirmed fee rates (${feeSource.source})`
            : ''

        return {
          sku: row.sku,
          contributionCents: row.contributionCents,
          observedUnitPriceCents: inputs?.observedUnitPriceCents ?? 0,
          breakEvenPriceCents: breakEven,
          provenance: row.provenance,
          rationale:
            `${row.sku} contributed ${row.contributionCents}c across ${row.orders} order(s), ` +
            `${rests}. ` +
            (breakEven === null
              ? `No price breaks even${underRates || ' under these fee assumptions'}, which is the finding.`
              : `It would break even at ${breakEven}c per unit${underRates}, against an observed ${
                  inputs?.observedUnitPriceCents ?? 0
                }c.`),
        }
      })

      let approvalId: string | null = null
      let status: FinanceOutput['status'] = 'no_action_proposed'

      if (proposals.length > 0) {
        /*
         * `price_change` is never-auto twice over — on this module's approval kind and
         * in the platform's hard-coded list — so this ALWAYS reaches a person. That is
         * the design, not a limitation: an agent that can reprice its own catalogue to
         * fix its own margin report has no check left on it.
         *
         * Note what is NOT in the payload: a pctChange. This agent proposes that
         * somebody look, and hands over the break-even arithmetic to look with; it does
         * not pick the new number. The gate reads a missing percentage as too large to
         * be automatic, which is the direction we want it to fail in.
         *
         * Idempotency lives in the reference. The gate's findByRef, backed by the
         * partial unique index on (division, kind, ref_table, ref_id), is the
         * existing-row check: a redelivered schedule tick for the same period gets the
         * same row back. Without it the operator finds two identical proposals for one
         * week in the inbox, approves both, and the same price moves twice.
         */
        const worst = report.lossMakers[0]!
        const outcome = await ctx.requestApproval({
          kind: 'price_change',
          // The bucket is the reason, not the SKU: a per-SKU bucket would never
          // accumulate enough decisions to mean anything. It cannot graduate either way.
          category: 'loss_maker',
          refTable: PERIOD_REF_TABLE,
          refId: periodRef(periodStart, periodEnd),
          summary:
            `${report.lossMakers.length} SKU(s) lose money on every sale, worst ${worst.sku} ` +
            `at ${worst.contributionCents}c — ${report.provenance} figures`,
          payload: {
            marking,
            provenance: report.provenance,
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
            netCents: report.netCents,
            lossMakers: report.lossMakers,
            proposals,
            caveats: report.caveats,
            note,
            // Rendered here so the inbox card cannot print the findings without the
            // marking in front of them.
            renderedNote: note ? renderCoveringNote(note) : null,
          },
        })

        approvalId = outcome.approval.id
        if (outcome.status === 'duplicate') status = 'already_requested'
        else if (outcome.status === 'auto_approved') {
          status = 'auto_approved'
          await ctx.log(
            'pod.finance_price_change_auto_approved',
            'a price change was auto-approved; price_change is marked never-auto and this ' +
              'should be unreachable',
            { level: 'error', refTable: 'approvals', refId: outcome.approval.id },
          )
        } else status = 'approval_requested'
      }

      return {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        revenueCents: report.revenueCents,
        costsCents: report.costsCents,
        netCents: report.netCents,
        provenance: report.provenance,
        simulated: report.provenance === 'simulated',
        note,
        noteStatus: note ? 'written' : 'rejected',
        noteProblems: note ? [] : noteProblems,
        skus: report.skus,
        lossMakers: report.lossMakers,
        proposals,
        caveats: report.caveats,
        unpricedLineCount,
        approvalId,
        status,
      }
    },
  }
}
