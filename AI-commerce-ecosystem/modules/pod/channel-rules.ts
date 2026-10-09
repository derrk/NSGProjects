/**
 * What may be sold where, and what has to be true before it can be.
 *
 * These are platform policy, not preference. Etsy's rules in particular are the kind
 * that get a shop closed rather than warned: ordinary resale of a supplier's catalogue
 * item is disallowed there, and a print-on-demand item is only acceptable when the
 * design is the seller's own or the buyer personalised it, with the production partner
 * disclosed.
 *
 * So the rules live here as one tested function rather than as a paragraph in a prompt.
 * A prompt is a request; this is a gate. An agent cannot talk its way past it, and a
 * model that has been told to "be careful about Etsy policy" will eventually not be.
 *
 * Verified against Etsy's seller policy and dropshipping guidance as of Oct 2026.
 * Re-check before going live: these pages change, and this file is a copy of them.
 */

export type Channel = 'etsy' | 'shopify'

/** How the item is made and shipped. */
export type Fulfillment =
  /** Printed to order from our own artwork, by a disclosed production partner. */
  | 'pod'
  /** A supplier's existing catalogue item, shipped by them. */
  | 'dropship'
  /** Made or held by us. */
  | 'in_house'

export interface ListingCandidate {
  channel: Channel
  fulfillment: Fulfillment
  /** True when the artwork is ours, or the buyer personalises it. */
  originalDesign: boolean
  /** True when the buyer supplies text, a photo or a name. */
  personalized: boolean
  /** The production partner shown on the listing, e.g. "Printify (US)". */
  productionPartner?: string | null
  /** Where it ships from. Etsy requires this to be accurate. */
  shipsFrom?: string | null
  /** Whether the design was made with AI assistance. */
  aiAssisted?: boolean
  /** Set when the design's provenance has been recorded. */
  provenanceNote?: string | null
}

export interface RuleViolation {
  rule: string
  message: string
  /** `blocking` stops publication. `warning` is shown to the operator. */
  severity: 'blocking' | 'warning'
}

export const CHANNEL_RULES = {
  etsyNoResale: 'etsy.no-ordinary-resale',
  etsyOriginalDesign: 'etsy.original-or-personalized',
  etsyProductionPartner: 'etsy.production-partner-disclosed',
  etsyShipsFrom: 'etsy.ships-from-accurate',
  etsyAiDisclosure: 'etsy.ai-disclosed',
  provenanceRecorded: 'provenance.recorded',
} as const

/**
 * Check a listing against its channel's rules.
 *
 * Returns every problem rather than the first, so the operator fixes one listing once
 * instead of discovering a new violation on each attempt.
 */
export function checkListing(candidate: ListingCandidate): RuleViolation[] {
  const problems: RuleViolation[] = []

  if (candidate.channel === 'etsy') {
    /*
     * The rule that matters most.
     *
     * Reselling a supplier's catalogue item on Etsy is not a grey area — it is the
     * thing the policy exists to stop, and it closes shops. A dropshipped item belongs
     * on Shopify.
     */
    if (candidate.fulfillment === 'dropship') {
      problems.push({
        rule: CHANNEL_RULES.etsyNoResale,
        severity: 'blocking',
        message:
          'Etsy does not allow ordinary resale of a supplier’s catalogue item. ' +
          'Sell this on Shopify, or replace it with an original or personalised design.',
      })
    }

    // POD is acceptable on Etsy only for our own design or a buyer-personalised one.
    if (candidate.fulfillment === 'pod' && !candidate.originalDesign && !candidate.personalized) {
      problems.push({
        rule: CHANNEL_RULES.etsyOriginalDesign,
        severity: 'blocking',
        message:
          'A print-on-demand listing on Etsy must use an original design or be ' +
          'personalised by the buyer. Neither is recorded for this listing.',
      })
    }

    // Etsy requires the production partner to be disclosed for anything made by someone
    // else, which is every POD item.
    if (candidate.fulfillment === 'pod' && !candidate.productionPartner?.trim()) {
      problems.push({
        rule: CHANNEL_RULES.etsyProductionPartner,
        severity: 'blocking',
        message:
          'Etsy requires the production partner to be disclosed on a print-on-demand ' +
          'listing. Record which partner prints and ships it.',
      })
    }

    if (!candidate.shipsFrom?.trim()) {
      problems.push({
        rule: CHANNEL_RULES.etsyShipsFrom,
        severity: 'blocking',
        message: 'Etsy requires an accurate shipping origin. Record where this ships from.',
      })
    }

    // Etsy's Creativity Standards require AI involvement to be disclosed.
    if (candidate.aiAssisted && !candidate.provenanceNote?.trim()) {
      problems.push({
        rule: CHANNEL_RULES.etsyAiDisclosure,
        severity: 'blocking',
        message:
          'This design was made with AI assistance, which Etsy requires to be ' +
          'disclosed. Record how it was produced before publishing.',
      })
    }
  }

  // Shopify has no equivalent resale rule, but an undisclosed dropship origin still
  // misleads a buyer about delivery time, so it is worth flagging.
  if (candidate.channel === 'shopify' && candidate.fulfillment === 'dropship') {
    if (!candidate.shipsFrom?.trim()) {
      problems.push({
        rule: CHANNEL_RULES.etsyShipsFrom,
        severity: 'warning',
        message:
          'No shipping origin recorded. A buyer who is not told an item ships from ' +
          'overseas will treat a three-week delivery as a problem.',
      })
    }
  }

  if (candidate.aiAssisted && !candidate.provenanceNote?.trim()) {
    const already = problems.some((p) => p.rule === CHANNEL_RULES.etsyAiDisclosure)
    if (!already) {
      problems.push({
        rule: CHANNEL_RULES.provenanceRecorded,
        severity: 'warning',
        message: 'This design was made with AI assistance and no provenance note is recorded.',
      })
    }
  }

  return problems
}

/** True when nothing blocking stands in the way of publishing. */
export function mayPublish(candidate: ListingCandidate): boolean {
  return !checkListing(candidate).some((p) => p.severity === 'blocking')
}

/**
 * Why an order cannot go straight to production.
 *
 * A personalised item carries buyer-supplied text or images. Sending that to a printer
 * unreviewed is how a shop prints a typo, someone else's photo, or something it should
 * not — none of which is recoverable once it is on a mug.
 */
export interface OrderRoutingCandidate {
  personalized: boolean
  /** Has a human checked the buyer's input and the proof? */
  personalizationReviewed: boolean
  /** Has the operator approved this SKU and its routing policy? */
  skuApproved: boolean
  paid: boolean
  hasValidAddress: boolean
  /** What this order will cost us to fulfil, in cents. */
  fulfillmentCostCents: number
  /** The per-order ceiling from the division's config. */
  maxFulfillmentCostCents: number
}

export type RoutingDecision =
  | { route: true }
  | { route: false; reason: string; needs: 'review' | 'approval' | 'payment' | 'address' | 'policy' }

/**
 * Decide whether an order may be sent to a supplier automatically.
 *
 * Deliberately conservative: every "no" here costs the operator a click, and every
 * wrong "yes" costs a printed item, a refund and a review.
 */
export function mayRouteOrder(order: OrderRoutingCandidate): RoutingDecision {
  if (!order.paid) {
    return { route: false, reason: 'the order is not paid', needs: 'payment' }
  }
  if (!order.hasValidAddress) {
    return { route: false, reason: 'the shipping address is incomplete', needs: 'address' }
  }
  if (!order.skuApproved) {
    return {
      route: false,
      reason: 'this SKU and its routing policy have not been approved',
      needs: 'approval',
    }
  }
  if (order.personalized && !order.personalizationReviewed) {
    return {
      route: false,
      reason: 'a personalised order needs its buyer input and proof reviewed before production',
      needs: 'review',
    }
  }
  if (order.fulfillmentCostCents > order.maxFulfillmentCostCents) {
    return {
      route: false,
      reason:
        `fulfilment would cost ${(order.fulfillmentCostCents / 100).toFixed(2)}, over the ` +
        `${(order.maxFulfillmentCostCents / 100).toFixed(2)} per-order ceiling`,
      needs: 'policy',
    }
  }
  return { route: true }
}
