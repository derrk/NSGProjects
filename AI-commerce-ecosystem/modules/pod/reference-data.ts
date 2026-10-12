/**
 * The rows every POD division needs before its agents can be trusted.
 *
 * This is NOT demo data. The blocked phrases are the IP gate the Designer and the
 * Trend scout both check against before a model is ever called, and the pricing rules
 * are what Store ops reads to decide what a mug costs. A division missing either one
 * does not fail — it behaves, which is the problem.
 *
 * Lived in apps/web/scripts/seed.ts until now, where it ran for exactly one division
 * and every division created afterwards came up with an empty blocklist. The
 * difference between "nothing matched" and "nothing was checked" is invisible from
 * the outside, and it was invisible here for three divisions.
 *
 * The data is here, boot-safe and database-free. The write is in the composition
 * root, which is the only place allowed to hold both this and a connection.
 */

export interface BlockedPhraseSeed {
  phrase: string
  reason: string
}

export interface PricingRuleSeed {
  productType: string
  markupMultiple: number
  roundToCents: number
  minPriceCents: number
}

/**
 * Phrases no design, listing or niche may contain.
 *
 * Deliberately the obvious, expensive ones rather than an attempt at a complete
 * list — a complete list does not exist, and treating this as one is how a shop ends
 * up believing it is covered. `ip-risk.ts` adds structural patterns (™, "official",
 * "in the style of <artist>", quoted lyrics, team-and-year) on top, and the operator
 * is still the last check.
 */
export const POD_BLOCKED_PHRASES: readonly BlockedPhraseSeed[] = [
  { phrase: 'just do it', reason: 'Nike registered mark' },
  { phrase: 'i love new york', reason: 'New York State registered mark' },
  { phrase: 'super bowl', reason: 'NFL registered mark' },
  { phrase: 'march madness', reason: 'NCAA registered mark' },
  { phrase: 'olympic', reason: 'USOPC/IOC protected under the Ted Stevens Act' },
  { phrase: 'olympics', reason: 'USOPC/IOC protected under the Ted Stevens Act' },
  { phrase: 'life is good', reason: 'Life is Good Inc registered apparel mark' },
  { phrase: 'the happiest place on earth', reason: 'Disney registered mark' },
  { phrase: "let's get ready to rumble", reason: 'Michael Buffer registered mark' },
  { phrase: 'world cup', reason: 'FIFA registered mark' },
  { phrase: 'the big game', reason: 'NFL enforces this as a Super Bowl euphemism' },
  { phrase: 'bluey', reason: 'BBC Studios character' },
  { phrase: 'pokemon', reason: 'Nintendo/Creatures/GAME FREAK character franchise' },
  { phrase: 'taylor swift', reason: 'name and likeness of a living person' },
  { phrase: 'disney', reason: 'Disney registered mark' },
  { phrase: 'marvel', reason: 'Marvel registered mark' },
  { phrase: 'star wars', reason: 'Lucasfilm registered mark' },
  { phrase: 'harry potter', reason: 'Warner Bros registered mark' },
]

/**
 * What each product type costs to sell, before the operator edits it.
 *
 * Starting points, not recommendations. `minPriceCents` is the floor that stops a
 * markup calculation producing a price that loses money on a cheap blank.
 */
export const POD_PRICING_RULES: readonly PricingRuleSeed[] = [
  { productType: 'mug_11oz', markupMultiple: 2.4, roundToCents: 99, minPriceCents: 1499 },
  { productType: 'mug_15oz', markupMultiple: 2.4, roundToCents: 99, minPriceCents: 1799 },
  { productType: 'tee', markupMultiple: 2.2, roundToCents: 99, minPriceCents: 2199 },
  { productType: 'sweatshirt', markupMultiple: 2.2, roundToCents: 99, minPriceCents: 3499 },
  { productType: 'hoodie', markupMultiple: 2.2, roundToCents: 99, minPriceCents: 3999 },
]
