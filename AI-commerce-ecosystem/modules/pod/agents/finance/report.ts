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
  ])

  const caveats: string[] = []

  if (provenance === 'simulated') {
    caveats.push(
      'This period contains simulated figures. Nothing here describes money that moved.',
    )
  } else if (provenance === 'estimated') {
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
    caveats.push(
      `${lossMakers.length} SKU(s) lose money on every sale. The worst is ${worst.sku} at ` +
        `$${(worst.contributionCents / 100).toFixed(2)} per order across ${worst.orders} order(s).`,
    )
  }

  // A SKU selling well on estimated costs is the one most likely to be quietly
  // unprofitable, because nothing has forced the estimate to be checked.
  const unverifiedTop = skus.find((s) => s.provenance !== 'verified' && s.orders >= 3)
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
