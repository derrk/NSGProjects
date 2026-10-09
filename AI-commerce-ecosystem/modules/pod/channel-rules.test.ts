/**
 * The channel rules, which are most of the acceptance criteria in the commerce brief.
 *
 * These are platform policy rather than preference — the Etsy ones get a shop closed
 * rather than warned — so they are tested as hard as the approval gate.
 */

import { describe, expect, it } from 'vitest'

import {
  CHANNEL_RULES,
  checkListing,
  mayPublish,
  mayRouteOrder,
  type ListingCandidate,
  type OrderRoutingCandidate,
} from './channel-rules'

function etsyPod(over: Partial<ListingCandidate> = {}): ListingCandidate {
  return {
    channel: 'etsy',
    fulfillment: 'pod',
    originalDesign: true,
    personalized: false,
    productionPartner: 'Printify (US)',
    shipsFrom: 'United States',
    aiAssisted: false,
    ...over,
  }
}

function shopifyDropship(over: Partial<ListingCandidate> = {}): ListingCandidate {
  return {
    channel: 'shopify',
    fulfillment: 'dropship',
    originalDesign: false,
    personalized: false,
    shipsFrom: 'China',
    ...over,
  }
}

const rulesBroken = (c: ListingCandidate) => checkListing(c).map((p) => p.rule)
const blocking = (c: ListingCandidate) =>
  checkListing(c).filter((p) => p.severity === 'blocking').map((p) => p.rule)

describe('Etsy: ordinary resale', () => {
  it('BLOCKS a dropshipped item on Etsy', () => {
    // The headline acceptance test. Reselling a supplier's catalogue item on Etsy is
    // the thing the policy exists to stop, and it closes shops.
    const candidate = etsyPod({ fulfillment: 'dropship', originalDesign: false })

    expect(blocking(candidate)).toContain(CHANNEL_RULES.etsyNoResale)
    expect(mayPublish(candidate)).toBe(false)
  })

  it('says where it should go instead', () => {
    const [violation] = checkListing(etsyPod({ fulfillment: 'dropship' }))
    expect(violation!.message).toMatch(/Sell this on Shopify/)
  })

  it('allows the same dropshipped item on Shopify', () => {
    expect(mayPublish(shopifyDropship())).toBe(true)
  })
})

describe('Etsy: original or personalised', () => {
  it('allows POD with our own design', () => {
    expect(mayPublish(etsyPod())).toBe(true)
  })

  it('allows POD the buyer personalises, even without an original design', () => {
    expect(mayPublish(etsyPod({ originalDesign: false, personalized: true }))).toBe(true)
  })

  it('BLOCKS POD that is neither original nor personalised', () => {
    const candidate = etsyPod({ originalDesign: false, personalized: false })
    expect(blocking(candidate)).toContain(CHANNEL_RULES.etsyOriginalDesign)
  })
})

describe('Etsy: disclosures', () => {
  it('BLOCKS POD with no production partner disclosed', () => {
    expect(blocking(etsyPod({ productionPartner: null }))).toContain(
      CHANNEL_RULES.etsyProductionPartner,
    )
  })

  it('treats a blank production partner as missing', () => {
    expect(blocking(etsyPod({ productionPartner: '   ' }))).toContain(
      CHANNEL_RULES.etsyProductionPartner,
    )
  })

  it('BLOCKS a listing with no shipping origin', () => {
    expect(blocking(etsyPod({ shipsFrom: null }))).toContain(CHANNEL_RULES.etsyShipsFrom)
  })

  it('BLOCKS an AI-assisted design with no provenance recorded', () => {
    // Etsy's Creativity Standards require AI involvement to be disclosed.
    expect(blocking(etsyPod({ aiAssisted: true, provenanceNote: null }))).toContain(
      CHANNEL_RULES.etsyAiDisclosure,
    )
  })

  it('allows an AI-assisted design once provenance is recorded', () => {
    expect(
      mayPublish(
        etsyPod({ aiAssisted: true, provenanceNote: 'Generated with Ideogram v3, edited by hand.' }),
      ),
    ).toBe(true)
  })

  it('only warns about undisclosed AI on Shopify, which has no such rule', () => {
    const problems = checkListing(shopifyDropship({ aiAssisted: true }))
    expect(problems.every((p) => p.severity === 'warning')).toBe(true)
    expect(mayPublish(shopifyDropship({ aiAssisted: true }))).toBe(true)
  })
})

describe('reporting', () => {
  it('reports every problem, not just the first', () => {
    // One listing fixed once, rather than a new violation revealed on each attempt.
    const broken = rulesBroken(
      etsyPod({ originalDesign: false, productionPartner: null, shipsFrom: null }),
    )

    expect(broken).toContain(CHANNEL_RULES.etsyOriginalDesign)
    expect(broken).toContain(CHANNEL_RULES.etsyProductionPartner)
    expect(broken).toContain(CHANNEL_RULES.etsyShipsFrom)
  })

  it('warns rather than blocks when a Shopify dropship origin is missing', () => {
    const problems = checkListing(shopifyDropship({ shipsFrom: null }))
    expect(problems[0]).toMatchObject({ severity: 'warning' })
    // A buyer not told it ships from overseas treats three weeks as a fault.
    expect(problems[0]!.message).toMatch(/ships from overseas/)
    expect(mayPublish(shopifyDropship({ shipsFrom: null }))).toBe(true)
  })

  it('passes a clean listing with no problems at all', () => {
    expect(checkListing(etsyPod())).toEqual([])
  })
})

/* ------------------------------------------------------------------ *
 * Order routing
 * ------------------------------------------------------------------ */

function order(over: Partial<OrderRoutingCandidate> = {}): OrderRoutingCandidate {
  return {
    personalized: false,
    personalizationReviewed: false,
    skuApproved: true,
    paid: true,
    hasValidAddress: true,
    fulfillmentCostCents: 800,
    maxFulfillmentCostCents: 2_000,
    ...over,
  }
}

describe('mayRouteOrder', () => {
  it('routes an ordinary approved paid order', () => {
    expect(mayRouteOrder(order())).toEqual({ route: true })
  })

  it('holds an unpaid order', () => {
    expect(mayRouteOrder(order({ paid: false }))).toMatchObject({ route: false, needs: 'payment' })
  })

  it('holds an order with an incomplete address', () => {
    expect(mayRouteOrder(order({ hasValidAddress: false }))).toMatchObject({
      route: false,
      needs: 'address',
    })
  })

  it('holds an order whose SKU has not been approved', () => {
    expect(mayRouteOrder(order({ skuApproved: false }))).toMatchObject({
      route: false,
      needs: 'approval',
    })
  })

  it('HOLDS a personalised order until its proof is reviewed', () => {
    // Buyer-supplied text or images go to a printer unreviewed exactly once before
    // someone prints a typo, or someone else's photo. None of it is recoverable.
    expect(mayRouteOrder(order({ personalized: true }))).toMatchObject({
      route: false,
      needs: 'review',
    })
  })

  it('routes a personalised order once its proof has been reviewed', () => {
    expect(
      mayRouteOrder(order({ personalized: true, personalizationReviewed: true })),
    ).toEqual({ route: true })
  })

  it('holds an order that would cost more than the per-order ceiling', () => {
    const decision = mayRouteOrder(order({ fulfillmentCostCents: 5_000 }))
    expect(decision).toMatchObject({ route: false, needs: 'policy' })
    if (!decision.route) expect(decision.reason).toMatch(/50\.00.*20\.00/)
  })

  it('routes an order exactly at the ceiling', () => {
    expect(mayRouteOrder(order({ fulfillmentCostCents: 2_000 }))).toEqual({ route: true })
  })

  it('reports the FIRST blocker in a sensible order', () => {
    // Payment before address before approval: telling someone to review a proof on an
    // unpaid order wastes their time.
    expect(
      mayRouteOrder(order({ paid: false, hasValidAddress: false, skuApproved: false })),
    ).toMatchObject({ needs: 'payment' })
  })
})
