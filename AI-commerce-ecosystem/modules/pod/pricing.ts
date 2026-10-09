/**
 * Turning Printify's production cost into a retail price.
 *
 * Small, pure and tested on its own because it is the one piece of the listing
 * pipeline where being wrong costs money on every single sale rather than failing
 * loudly once.
 */

export interface PricingRule {
  productType: string
  markupMultiple: number
  /** Round up to end in these cents, e.g. 99 for £x.99 pricing. */
  roundToCents: number
  minPriceCents?: number | null
  maxPriceCents?: number | null
}

export interface PricedVariant {
  variantId: number
  costCents: number
  priceCents: number
  marginCents: number
  marginPercent: number
}

/**
 * Round UP to the next price ending in `endingCents`.
 *
 * Always up, never to nearest: rounding down crosses below the markup the operator
 * set, and doing that silently on every variant is how a catalogue ends up unprofitable
 * without anyone noticing.
 */
export function roundToEnding(cents: number, endingCents: number): number {
  if (endingCents <= 0 || endingCents >= 100) return Math.ceil(cents)
  const base = Math.floor(cents / 100) * 100
  const candidate = base + endingCents
  return candidate >= cents ? candidate : candidate + 100
}

/** The price for one variant, with the margin it implies. */
export function priceVariant(costCents: number, rule: PricingRule): PricedVariant | null {
  if (!Number.isFinite(costCents) || costCents <= 0) return null

  let price = roundToEnding(costCents * rule.markupMultiple, rule.roundToCents)

  if (rule.minPriceCents && price < rule.minPriceCents) {
    price = roundToEnding(rule.minPriceCents, rule.roundToCents)
  }
  if (rule.maxPriceCents && price > rule.maxPriceCents) {
    price = roundToEnding(rule.maxPriceCents, rule.roundToCents)
  }

  const margin = price - costCents
  return {
    variantId: 0,
    costCents,
    priceCents: price,
    marginCents: margin,
    marginPercent: (margin / price) * 100,
  }
}

/** SPEC.md pauses any product whose margin falls below this. */
export const MIN_ACCEPTABLE_MARGIN_PERCENT = 25

export interface PricingProblem {
  variantId: number
  reason: string
}

export interface PricedProduct {
  variants: PricedVariant[]
  problems: PricingProblem[]
  /** The cheapest variant's price, shown on the listing. */
  fromPriceCents: number
  /** Worst margin across variants; what the operator should actually look at. */
  worstMarginPercent: number
}

/**
 * Price every variant of a product.
 *
 * A variant that cannot be priced profitably is reported rather than silently dropped
 * or sold at a loss — the operator decides whether to disable that size or raise the
 * price, and neither choice should be made by a rounding rule.
 */
export function priceProduct(
  variants: Array<{ id: number; cost?: number | undefined }>,
  rule: PricingRule,
): PricedProduct {
  const priced: PricedVariant[] = []
  const problems: PricingProblem[] = []

  for (const variant of variants) {
    const result = priceVariant(variant.cost ?? 0, rule)
    if (!result) {
      problems.push({ variantId: variant.id, reason: 'Printify did not report a production cost' })
      continue
    }
    const withId = { ...result, variantId: variant.id }
    if (withId.marginPercent < MIN_ACCEPTABLE_MARGIN_PERCENT) {
      problems.push({
        variantId: variant.id,
        reason: `margin would be ${withId.marginPercent.toFixed(1)}%, below the ${MIN_ACCEPTABLE_MARGIN_PERCENT}% floor`,
      })
    }
    priced.push(withId)
  }

  const prices = priced.map((p) => p.priceCents)
  const margins = priced.map((p) => p.marginPercent)

  return {
    variants: priced,
    problems,
    fromPriceCents: prices.length > 0 ? Math.min(...prices) : 0,
    worstMarginPercent: margins.length > 0 ? Math.min(...margins) : 0,
  }
}
