import { describe, expect, it } from 'vitest'

import {
  MIN_ACCEPTABLE_MARGIN_PERCENT,
  priceProduct,
  priceVariant,
  roundToEnding,
  type PricingRule,
} from './pricing'

const rule: PricingRule = {
  productType: 'tee',
  markupMultiple: 2.2,
  roundToCents: 99,
  minPriceCents: null,
  maxPriceCents: null,
}

describe('roundToEnding', () => {
  it.each([
    [2596, 99, 2599],
    [2600, 99, 2699],
    [2599, 99, 2599],
    [101, 99, 199],
    [1, 99, 99],
  ])('rounds %i up to end in %i → %i', (cents, ending, expected) => {
    expect(roundToEnding(cents, ending)).toBe(expected)
  })

  it('always rounds UP, never to nearest', () => {
    // Rounding 2601 down to 2599 would quietly undercut the markup the operator set,
    // on every sale, forever.
    expect(roundToEnding(2601, 99)).toBe(2699)
  })

  it('falls back to a whole cent for a nonsense ending', () => {
    expect(roundToEnding(1234.6, 0)).toBe(1235)
    expect(roundToEnding(1234.6, 100)).toBe(1235)
  })
})

describe('priceVariant', () => {
  it('applies the markup and the rounding', () => {
    // 1180 x 2.2 = 2596 → 2599
    expect(priceVariant(1180, rule)).toMatchObject({ costCents: 1180, priceCents: 2599 })
  })

  it('reports the margin the price implies', () => {
    const out = priceVariant(1180, rule)!
    expect(out.marginCents).toBe(2599 - 1180)
    expect(out.marginPercent).toBeCloseTo(54.6, 1)
  })

  it('raises a price below the floor', () => {
    const out = priceVariant(500, { ...rule, minPriceCents: 2199 })!
    expect(out.priceCents).toBe(2199)
  })

  it('caps a price above the ceiling', () => {
    const out = priceVariant(5000, { ...rule, maxPriceCents: 3999 })!
    expect(out.priceCents).toBe(3999)
  })

  it.each([[0], [-100], [Number.NaN]])('refuses to price a cost of %s', (cost) => {
    // A missing cost must not become a free product.
    expect(priceVariant(cost, rule)).toBeNull()
  })
})

describe('priceProduct', () => {
  it('prices every variant and reports the cheapest', () => {
    const out = priceProduct(
      [
        { id: 1, cost: 1180 },
        { id: 2, cost: 1400 },
      ],
      rule,
    )

    expect(out.variants).toHaveLength(2)
    expect(out.fromPriceCents).toBe(2599)
    expect(out.problems).toEqual([])
  })

  it('flags a variant Printify gave no cost for, instead of dropping it silently', () => {
    const out = priceProduct([{ id: 1, cost: 1180 }, { id: 2 }], rule)

    expect(out.variants).toHaveLength(1)
    expect(out.problems).toEqual([
      { variantId: 2, reason: 'Printify did not report a production cost' },
    ])
  })

  it('flags a variant whose margin falls below the floor', () => {
    const thin = priceProduct([{ id: 1, cost: 1180 }], {
      ...rule,
      markupMultiple: 1.2,
    })

    expect(thin.problems[0]!.reason).toMatch(/below the 25% floor/)
    // Still priced, not discarded: the operator chooses whether to disable the size
    // or raise the price, and a rounding rule should not make that call.
    expect(thin.variants).toHaveLength(1)
  })

  it('reports the WORST margin, not the average', () => {
    const out = priceProduct(
      [
        { id: 1, cost: 1180 },
        { id: 2, cost: 2400 },
      ],
      { ...rule, markupMultiple: 1.3 },
    )

    // An average would hide the one variant that loses money.
    expect(out.worstMarginPercent).toBeLessThan(MIN_ACCEPTABLE_MARGIN_PERCENT)
  })

  it('survives a product with no priceable variants', () => {
    const out = priceProduct([{ id: 1 }], rule)
    expect(out).toMatchObject({ fromPriceCents: 0, worstMarginPercent: 0 })
    expect(out.problems).toHaveLength(1)
  })
})
