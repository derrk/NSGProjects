/**
 * What one sale actually leaves you with.
 *
 * Every rate here is a configurable ASSUMPTION, never a constant. Platform fees change,
 * they differ by country and plan, and a number hardcoded in a file is a number nobody
 * revisits — which is how a catalogue quietly stops being profitable. The output
 * carries its assumptions with it so a margin figure can always be audited back to
 * what it was computed from.
 *
 * Rates below are starting points to confirm against your own account, not facts.
 */

export interface FeeAssumptions {
  /** Listing fee, charged per listing. Etsy's was $0.20. */
  listingFeeCents: number
  /** Commission on the item price. */
  transactionFeeRate: number
  /** Whether the platform also takes commission on the shipping the buyer paid. */
  transactionFeeAppliesToShipping: boolean
  /** Payment processing: a percentage plus a flat amount. */
  paymentFeeRate: number
  paymentFeeFlatCents: number
  /** Share of orders expected to be refunded or discounted. */
  refundRate: number
  /** Advertising allocated per order, if any. */
  adSpendPerOrderCents: number
  /** Where these numbers came from and when. */
  source: string
  confirmedAt?: string | null
}

/**
 * Starting assumptions.
 *
 * Deliberately exported as a function rather than a frozen constant, so nothing can
 * come to treat the returned object as authoritative shared state.
 */
export function defaultEtsyAssumptions(): FeeAssumptions {
  return {
    listingFeeCents: 20,
    transactionFeeRate: 0.065,
    transactionFeeAppliesToShipping: true,
    paymentFeeRate: 0.03,
    paymentFeeFlatCents: 25,
    refundRate: 0.02,
    adSpendPerOrderCents: 0,
    source: 'Etsy published fee schedule, to confirm against your own account',
    confirmedAt: null,
  }
}

export function defaultShopifyAssumptions(): FeeAssumptions {
  return {
    listingFeeCents: 0,
    transactionFeeRate: 0,
    transactionFeeAppliesToShipping: false,
    paymentFeeRate: 0.029,
    paymentFeeFlatCents: 30,
    refundRate: 0.02,
    adSpendPerOrderCents: 0,
    source: 'Shopify Basic + Shopify Payments, to confirm against your own account',
    confirmedAt: null,
  }
}

export interface OrderEconomicsInput {
  /** What the buyer pays for the item. */
  itemPriceCents: number
  /** What the buyer pays for shipping. Zero when it is built into the price. */
  shippingChargedCents: number
  /** What the item costs us to have made. */
  itemCostCents: number
  /** What we pay the supplier to ship it. */
  shippingCostCents: number
  assumptions: FeeAssumptions
}

export interface OrderEconomics {
  revenueCents: number
  costOfGoodsCents: number
  platformFeesCents: number
  paymentFeesCents: number
  expectedRefundCents: number
  adSpendCents: number
  /** What is left. This is the number that matters. */
  contributionCents: number
  contributionPercent: number
  /** Everything above, itemised, so a figure can be traced to its inputs. */
  breakdown: Array<{ label: string; cents: number; note?: string }>
  assumptions: FeeAssumptions
}

function round(cents: number): number {
  return Math.round(cents * 100) / 100
}

/** What one order contributes, after everything that comes out of it. */
export function orderEconomics(input: OrderEconomicsInput): OrderEconomics {
  const a = input.assumptions

  const revenue = input.itemPriceCents + input.shippingChargedCents
  const cogs = input.itemCostCents + input.shippingCostCents

  const transactionBase = a.transactionFeeAppliesToShipping ? revenue : input.itemPriceCents
  const transactionFee = transactionBase * a.transactionFeeRate
  const platformFees = transactionFee + a.listingFeeCents

  const paymentFees = revenue * a.paymentFeeRate + a.paymentFeeFlatCents

  // Applied to revenue, not to profit: a refunded order gives the money back but the
  // item was still made and shipped.
  const expectedRefund = revenue * a.refundRate

  const contribution =
    revenue - cogs - platformFees - paymentFees - expectedRefund - a.adSpendPerOrderCents

  return {
    revenueCents: round(revenue),
    costOfGoodsCents: round(cogs),
    platformFeesCents: round(platformFees),
    paymentFeesCents: round(paymentFees),
    expectedRefundCents: round(expectedRefund),
    adSpendCents: a.adSpendPerOrderCents,
    contributionCents: round(contribution),
    contributionPercent: revenue === 0 ? 0 : round((contribution / revenue) * 100),
    breakdown: [
      { label: 'Buyer pays', cents: round(revenue) },
      { label: 'Item cost', cents: -round(input.itemCostCents) },
      { label: 'Shipping we pay', cents: -round(input.shippingCostCents) },
      {
        label: 'Platform fees',
        cents: -round(platformFees),
        note: `${(a.transactionFeeRate * 100).toFixed(1)}% commission${
          a.transactionFeeAppliesToShipping ? ' including shipping' : ' on the item only'
        }, plus ${(a.listingFeeCents / 100).toFixed(2)} listing`,
      },
      {
        label: 'Payment processing',
        cents: -round(paymentFees),
        note: `${(a.paymentFeeRate * 100).toFixed(1)}% plus ${(a.paymentFeeFlatCents / 100).toFixed(2)}`,
      },
      {
        label: 'Expected refunds',
        cents: -round(expectedRefund),
        note: `${(a.refundRate * 100).toFixed(1)}% of orders, assumed`,
      },
      ...(a.adSpendPerOrderCents > 0
        ? [{ label: 'Advertising', cents: -a.adSpendPerOrderCents }]
        : []),
      { label: 'Contribution', cents: round(contribution) },
    ],
    assumptions: a,
  }
}

/**
 * The price at which an order contributes exactly zero.
 *
 * Solved rather than searched: every fee is linear in price, so
 *   price = (fixed costs) / (1 - proportional rates)
 * and a rate set that sums to 1 or more means no price breaks even, which is worth
 * saying out loud rather than returning a vast number.
 */
export function breakEvenPriceCents(
  input: Omit<OrderEconomicsInput, 'itemPriceCents'>,
): number | null {
  const a = input.assumptions

  const proportional =
    (a.transactionFeeAppliesToShipping ? a.transactionFeeRate : a.transactionFeeRate) +
    a.paymentFeeRate +
    a.refundRate

  if (proportional >= 1) return null

  const shippingSide = a.transactionFeeAppliesToShipping
    ? input.shippingChargedCents * (1 - proportional)
    : input.shippingChargedCents - input.shippingChargedCents * (a.paymentFeeRate + a.refundRate)

  const fixed =
    input.itemCostCents +
    input.shippingCostCents +
    a.listingFeeCents +
    a.paymentFeeFlatCents +
    a.adSpendPerOrderCents -
    shippingSide

  const price = fixed / (1 - proportional)
  return price > 0 ? Math.ceil(price) : 0
}

/** How much a figure can be trusted. Mirrors the Treasury screen's vocabulary. */
export type Provenance = 'estimated' | 'simulated' | 'manual' | 'verified'

export interface MarginReportRow {
  sku: string
  orders: number
  revenueCents: number
  contributionCents: number
  contributionPercent: number
  provenance: Provenance
}

/**
 * Roll per-order figures into a per-SKU report.
 *
 * Provenance is carried through rather than averaged away: a SKU whose numbers are
 * half verified and half estimated is reported as estimated, because the weakest
 * input is what the whole row is worth.
 */
export function marginReport(
  rows: ReadonlyArray<{
    sku: string
    revenueCents: number
    contributionCents: number
    provenance: Provenance
  }>,
): MarginReportRow[] {
  const rank: Record<Provenance, number> = { simulated: 0, estimated: 1, manual: 2, verified: 3 }
  const bySku = new Map<string, MarginReportRow>()

  for (const row of rows) {
    const existing = bySku.get(row.sku)
    if (!existing) {
      bySku.set(row.sku, {
        sku: row.sku,
        orders: 1,
        revenueCents: row.revenueCents,
        contributionCents: row.contributionCents,
        contributionPercent: 0,
        provenance: row.provenance,
      })
      continue
    }
    existing.orders += 1
    existing.revenueCents += row.revenueCents
    existing.contributionCents += row.contributionCents
    if (rank[row.provenance] < rank[existing.provenance]) {
      existing.provenance = row.provenance
    }
  }

  return [...bySku.values()]
    .map((r) => ({
      ...r,
      revenueCents: round(r.revenueCents),
      contributionCents: round(r.contributionCents),
      contributionPercent: r.revenueCents === 0 ? 0 : round((r.contributionCents / r.revenueCents) * 100),
    }))
    .sort((a, b) => b.contributionCents - a.contributionCents)
}
