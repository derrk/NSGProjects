/**
 * The finance report.
 *
 * Deliberately not a model's job. Arithmetic over a ledger is something a program
 * does correctly every time and a language model does convincingly most of the time,
 * and "convincingly" is the wrong property for the number someone decides to stop
 * selling a product on. The agent's contribution is the covering note; the figures
 * come from here.
 *
 * The one thing this has to get right beyond the sums: never presenting an estimate
 * as though it were a fact. Every total carries the weakest provenance that went
 * into it, so a report built mostly on catalogue prices cannot read like a bank
 * statement.
 */

import { marginReport, type MarginReportRow, type Provenance } from '../../economics'

export interface LedgerEntry {
  /** Signed by effect on the company: revenue positive, costs negative. */
  amountCents: number
  category: string
  sku?: string | null
  provenance: Provenance
  occurredAt: Date
}

export interface OrderContribution {
  sku: string
  revenueCents: number
  contributionCents: number
  provenance: Provenance
}

export interface FinanceReportInput {
  periodStart: Date
  periodEnd: Date
  entries: LedgerEntry[]
  orders: OrderContribution[]
  /** Unit economics the operator has not yet confirmed against a statement. */
  unconfirmedAssumptions?: string[]
  /**
   * What the fee rates every contribution was computed THROUGH are worth.
   *
   * A contribution is not only its cost side. A commission, a payment rate and a
   * refund rate sit inside the same number, and a report whose marking says "traces to
   * an invoice" over rates nobody has checked is making the exact claim this file
   * exists to stop. It lowers the report's provenance without touching any row's own,
   * so the verified/estimated split across SKUs survives intact.
   *
   * Ignored when there are no contributions: a ledger-only period never passes through
   * a fee assumption, so nothing is owed to one.
   */
  assumptionProvenance?: Provenance
}

export interface FinanceReport {
  periodStart: Date
  periodEnd: Date
  revenueCents: number
  costsCents: number
  netCents: number
  /** The weakest provenance anywhere in the period. The whole report is worth this. */
  provenance: Provenance
  byCategory: Array<{ category: string; amountCents: number; provenance: Provenance }>
  skus: MarginReportRow[]
  /** SKUs losing money, worst first. Named separately because they are the action. */
  lossMakers: MarginReportRow[]
  /** Things that would change the conclusion, in plain words. */
  caveats: string[]
}

const RANK: Record<Provenance, number> = { simulated: 0, estimated: 1, manual: 2, verified: 3 }

function weakest(values: Provenance[]): Provenance {
  if (values.length === 0) return 'estimated'
  return values.reduce((a, b) => (RANK[b] < RANK[a] ? b : a))
}

function round(cents: number): number {
  return Math.round(cents * 100) / 100
}

/**
 * Build the period report.
 *
 * Pure, so the figures can be asserted exactly rather than approximately, and so the
 * report can be rendered without a database behind it.
 */
export function buildFinanceReport(input: FinanceReportInput): FinanceReport {
  const inPeriod = input.entries.filter(
    (e) => e.occurredAt >= input.periodStart && e.occurredAt <= input.periodEnd,
  )

  let revenue = 0
  let costs = 0
  const categories = new Map<string, { amountCents: number; provenances: Provenance[] }>()

  for (const entry of inPeriod) {
    if (entry.amountCents >= 0) revenue += entry.amountCents
    else costs += entry.amountCents

    const existing = categories.get(entry.category)
    if (existing) {
      existing.amountCents += entry.amountCents
      existing.provenances.push(entry.provenance)
    } else {
      categories.set(entry.category, {
        amountCents: entry.amountCents,
        provenances: [entry.provenance],
      })
    }
  }

  const skus = marginReport(input.orders)
  const lossMakers = skus
    .filter((s) => s.contributionCents < 0)
    .sort((a, b) => a.contributionCents - b.contributionCents)

  const provenance = weakest([
    ...inPeriod.map((e) => e.provenance),
    ...input.orders.map((o) => o.provenance),
    ...(input.orders.length > 0 && input.assumptionProvenance
      ? [input.assumptionProvenance]
      : []),
  ])

  const caveats: string[] = []
  // An empty period has no figures to be worth anything. Describing it as containing
  // catalogue estimates is a statement about costs that do not exist, and provenance
  // is the field the finance prompt calls the most important one on the page.
  const isEmpty = inPeriod.length === 0 && input.orders.length === 0

  if (!isEmpty && provenance === 'simulated') {
    caveats.push(
      'This period contains simulated figures. Nothing here describes money that moved.',
    )
  } else if (!isEmpty && provenance === 'estimated') {
    caveats.push(
      'Some costs in this period are catalogue estimates rather than amounts charged. ' +
        'Treat the net as a direction, not a balance.',
    )
  }

  for (const assumption of input.unconfirmedAssumptions ?? []) {
    caveats.push(`Unconfirmed: ${assumption}`)
  }

  if (inPeriod.length === 0) {
    caveats.push('No ledger entries fall in this period. The totals are zero because there is nothing in them, not because the business broke even.')
  }

  if (lossMakers.length > 0) {
    const worst = lossMakers[0]!
    /*
     * Divided by the order count before it is called a per-order figure.
     *
     * marginReport collapses a SKU's orders into one total, so reporting that total
     * "per order" multiplied the loss by the number of sales: a SKU losing $2 a unit
     * across three sales was reported as losing $6 a unit. This caveat is the
     * headline the finance agent is told to lead with, so the error arrived with
     * emphasis.
     */
    const perOrderCents =
      worst.orders > 0 ? worst.contributionCents / worst.orders : worst.contributionCents
    /*
     * "On aggregate", not "on every sale".
     *
     * lossMakers is computed from a SKU's TOTAL contribution, which can net negative
     * while individual sales of it were profitable — a cost rise part-way through the
     * period does exactly that. The stronger claim is the one an operator would act on
     * hardest, and it is the one the data does not support.
     */
    caveats.push(
      `${lossMakers.length} SKU(s) lost money on aggregate this period. The worst is ` +
        `${worst.sku}, averaging $${(perOrderCents / 100).toFixed(2)} across ` +
        `${worst.orders} sale(s) — an average, so individual sales may differ.`,
    )
  }

  /*
   * A SKU selling well on estimated costs is the one most likely to be quietly
   * unprofitable, because nothing has forced the estimate to be checked.
   *
   * "Selling well" has to mean contributing. The filter was only `orders >= 3`, so
   * on a list sorted by contribution it would fall through a verified winner to a
   * known loss-maker and describe it as something to scale — in the same report that
   * had just named it the worst loser.
   */
  const unverifiedTop = skus.find(
    (s) => s.provenance !== 'verified' && s.orders >= 3 && s.contributionCents > 0,
  )
  if (unverifiedTop) {
    caveats.push(
      `${unverifiedTop.sku} has ${unverifiedTop.orders} orders and its costs are still ` +
        `${unverifiedTop.provenance}. Confirm what it actually costs before scaling it.`,
    )
  }

  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    revenueCents: round(revenue),
    costsCents: round(costs),
    netCents: round(revenue + costs),
    provenance,
    byCategory: [...categories.entries()]
      .map(([category, v]) => ({
        category,
        amountCents: round(v.amountCents),
        provenance: weakest(v.provenances),
      }))
      .sort((a, b) => a.amountCents - b.amountCents),
    skus,
    lossMakers,
    caveats,
  }
}
