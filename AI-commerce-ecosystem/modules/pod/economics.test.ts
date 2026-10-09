import { describe, expect, it } from 'vitest'

import {
  breakEvenPriceCents,
  defaultEtsyAssumptions,
  defaultShopifyAssumptions,
  marginReport,
  orderEconomics,
  type FeeAssumptions,
} from './economics'

const etsy = defaultEtsyAssumptions()

function order(over: Partial<Parameters<typeof orderEconomics>[0]> = {}) {
  return orderEconomics({
    itemPriceCents: 2999,
    shippingChargedCents: 0,
    itemCostCents: 1180,
    shippingCostCents: 450,
    assumptions: etsy,
    ...over,
  })
}

describe('orderEconomics', () => {
  it('subtracts every cost from what the buyer paid', () => {
    const out = order()

    expect(out.revenueCents).toBe(2999)
    expect(out.costOfGoodsCents).toBe(1630)
    expect(out.contributionCents).toBeLessThan(out.revenueCents - out.costOfGoodsCents)
    expect(out.contributionCents).toBeGreaterThan(0)
  })

  it('shows its working, so a figure can be traced to its inputs', () => {
    const labels = order().breakdown.map((b) => b.label)
    expect(labels).toEqual([
      'Buyer pays',
      'Item cost',
      'Shipping we pay',
      'Platform fees',
      'Payment processing',
      'Expected refunds',
      'Contribution',
    ])
  })

  it('explains the rate behind each fee line', () => {
    const fees = order().breakdown.find((b) => b.label === 'Platform fees')
    expect(fees!.note).toMatch(/6\.5% commission/)
  })

  it('carries its assumptions with the result', () => {
    // A margin figure is only auditable if it knows what it was computed from.
    expect(order().assumptions.source).toMatch(/Etsy published fee schedule/)
    expect(order().assumptions.confirmedAt).toBeNull()
  })

  it('charges commission on shipping when the platform does', () => {
    const withShipping = order({ shippingChargedCents: 500 })
    const noCommissionOnShipping = orderEconomics({
      itemPriceCents: 2999,
      shippingChargedCents: 500,
      itemCostCents: 1180,
      shippingCostCents: 450,
      assumptions: { ...etsy, transactionFeeAppliesToShipping: false },
    })

    expect(withShipping.platformFeesCents).toBeGreaterThan(
      noCommissionOnShipping.platformFeesCents,
    )
  })

  it('includes the ad allocation only when there is one', () => {
    expect(order().breakdown.some((b) => b.label === 'Advertising')).toBe(false)
    const withAds = order({ assumptions: { ...etsy, adSpendPerOrderCents: 300 } })
    expect(withAds.breakdown.some((b) => b.label === 'Advertising')).toBe(true)
    expect(withAds.contributionCents).toBeCloseTo(order().contributionCents - 300, 2)
  })

  it('reports a loss as a negative contribution rather than hiding it', () => {
    const loss = order({ itemPriceCents: 999 })
    expect(loss.contributionCents).toBeLessThan(0)
    expect(loss.contributionPercent).toBeLessThan(0)
  })

  it('costs Shopify less in platform fees than Etsy for the same sale', () => {
    const onShopify = order({ assumptions: defaultShopifyAssumptions() })
    // Shopify takes no commission with Shopify Payments; Etsy takes 6.5% plus a listing fee.
    expect(onShopify.platformFeesCents).toBeLessThan(order().platformFeesCents)
  })

  it('does not divide by zero on a free item', () => {
    const free = order({ itemPriceCents: 0, shippingChargedCents: 0 })
    expect(Number.isFinite(free.contributionPercent)).toBe(true)
  })
})

describe('breakEvenPriceCents', () => {
  it('finds the price where contribution is exactly zero', () => {
    const price = breakEvenPriceCents({
      shippingChargedCents: 0,
      itemCostCents: 1180,
      shippingCostCents: 450,
      assumptions: etsy,
    })!

    const atBreakEven = order({ itemPriceCents: price })
    expect(atBreakEven.contributionCents).toBeGreaterThanOrEqual(0)
    expect(atBreakEven.contributionCents).toBeLessThan(100)
  })

  it('rises when the item costs more', () => {
    const cheap = breakEvenPriceCents({
      shippingChargedCents: 0,
      itemCostCents: 500,
      shippingCostCents: 450,
      assumptions: etsy,
    })!
    const dear = breakEvenPriceCents({
      shippingChargedCents: 0,
      itemCostCents: 2000,
      shippingCostCents: 450,
      assumptions: etsy,
    })!

    expect(dear).toBeGreaterThan(cheap)
  })

  it('says no price works rather than returning a huge number', () => {
    // Rates summing past 100% means every extra pound of revenue loses money.
    const impossible: FeeAssumptions = { ...etsy, transactionFeeRate: 0.7, paymentFeeRate: 0.4 }
    expect(
      breakEvenPriceCents({
        shippingChargedCents: 0,
        itemCostCents: 1000,
        shippingCostCents: 0,
        assumptions: impossible,
      }),
    ).toBeNull()
  })
})

describe('marginReport', () => {
  it('groups orders by SKU and totals them', () => {
    const report = marginReport([
      { sku: 'mug-11', revenueCents: 2999, contributionCents: 800, provenance: 'verified' },
      { sku: 'mug-11', revenueCents: 2999, contributionCents: 800, provenance: 'verified' },
      { sku: 'tee', revenueCents: 2199, contributionCents: 400, provenance: 'verified' },
    ])

    expect(report).toHaveLength(2)
    expect(report[0]).toMatchObject({ sku: 'mug-11', orders: 2, contributionCents: 1600 })
  })

  it('ranks by contribution, not by revenue', () => {
    const report = marginReport([
      { sku: 'high-revenue', revenueCents: 10_000, contributionCents: 100, provenance: 'verified' },
      { sku: 'high-margin', revenueCents: 2_000, contributionCents: 900, provenance: 'verified' },
    ])

    expect(report[0]!.sku).toBe('high-margin')
  })

  it('reports a mixed SKU at its WEAKEST provenance', () => {
    const report = marginReport([
      { sku: 'mug-11', revenueCents: 2999, contributionCents: 800, provenance: 'verified' },
      { sku: 'mug-11', revenueCents: 2999, contributionCents: 800, provenance: 'simulated' },
    ])

    // One demo order in the pile makes the whole row worth no more than demo data.
    expect(report[0]!.provenance).toBe('simulated')
  })

  it('does not divide by zero for a SKU with no revenue', () => {
    const report = marginReport([
      { sku: 'free', revenueCents: 0, contributionCents: 0, provenance: 'estimated' },
    ])
    expect(report[0]!.contributionPercent).toBe(0)
  })

  it('returns nothing for no orders', () => {
    expect(marginReport([])).toEqual([])
  })
})
