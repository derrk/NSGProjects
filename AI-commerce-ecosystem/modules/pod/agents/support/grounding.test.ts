import { describe, expect, it } from 'vitest'

import {
  checkReplyGrounding,
  DRAFTABLE_INTENTS,
  isDraftable,
  mayFileReply,
  type OrderFacts,
} from './grounding'

const shipped: OrderFacts = {
  orderNumber: '1001',
  status: 'shipped',
  placedAt: new Date('2026-10-01'),
  shippedAt: new Date('2026-10-03'),
  carrier: 'USPS',
  trackingNumber: 'DEMO9400100000000000',
  leadTimeDaysMin: 7,
  leadTimeDaysMax: 21,
  items: [{ sku: 'pet-hair-remover-v1', title: 'Reusable Pet Hair Remover', quantity: 1 }],
  refundDecided: false,
}

const inProduction: OrderFacts = {
  ...shipped,
  status: 'in_production',
  shippedAt: null,
  carrier: null,
  trackingNumber: null,
}

const codes = (draft: string, facts: OrderFacts) =>
  checkReplyGrounding(draft, facts).map((p) => p.check)

describe('checkReplyGrounding', () => {
  it('passes a reply that only states what the record says', () => {
    const draft =
      'Hi, order 1001 shipped on 3 October. USPS tracking: DEMO9400100000000000. ' +
      'It ships from our supplier, so allow 7–21 days.'
    expect(checkReplyGrounding(draft, shipped)).toEqual([])
    expect(mayFileReply(draft, shipped)).toBe(true)
  })

  it('refuses a promised arrival day', () => {
    // The sentence a model writes when it wants to be reassuring is the one that
    // generates the complaint it was trying to prevent.
    const draft = 'Order 1001 is on its way and should arrive by Friday.'
    expect(codes(draft, shipped)).toContain('promise.arrival')
    expect(mayFileReply(draft, shipped)).toBe(false)
  })

  it('refuses a promised arrival before a holiday', () => {
    const draft = 'Order 1001 will be delivered before Christmas.'
    expect(codes(draft, shipped)).toContain('promise.arrival')
  })

  it('refuses a refund the operator has not decided', () => {
    const draft = 'Sorry about that — we will refund you for order 1001 today.'
    expect(codes(draft, shipped)).toContain('promise.money')
  })

  it('allows the refund sentence once a human has decided one', () => {
    const draft = 'As agreed, we have refunded order 1001.'
    expect(codes(draft, { ...shipped, refundDecided: true })).not.toContain('promise.money')
  })

  it('refuses a tracking number that is not this order’s', () => {
    // A wrong number is worse than none: the customer now has two problems.
    const draft = 'Order 1001 tracking: DEMO9400100000000999.'
    const problems = checkReplyGrounding(draft, shipped)
    expect(problems.some((p) => p.check === 'tracking.unknown')).toBe(true)
    expect(problems.find((p) => p.check === 'tracking.unknown')!.message).toMatch(
      /not this order’s tracking number/,
    )
  })

  it('refuses any long identifier when the order has no tracking at all', () => {
    const draft = 'Order 1001 tracking: ABCD123456789.'
    expect(codes(draft, inProduction)).toContain('tracking.unknown')
  })

  it('does not flag the order number itself as an unknown identifier', () => {
    const facts = { ...shipped, orderNumber: 'ORDER12345678' }
    const draft = 'Your order ORDER12345678 is being made.'
    expect(codes(draft, { ...facts, shippedAt: null, trackingNumber: null })).not.toContain(
      'tracking.unknown',
    )
  })

  it('refuses a claim that it shipped when the record says otherwise', () => {
    const draft = 'Good news — order 1001 is on its way!'
    expect(codes(draft, inProduction)).toContain('status.not_shipped')
  })

  it('refuses a lead time quoted at its optimistic end', () => {
    // The most common self-inflicted ticket in dropshipping.
    const draft = 'Order 1001 ships from our supplier; allow 7 days.'
    expect(codes(draft, shipped)).toContain('leadtime.optimistic')
  })

  it('accepts the lead time when both ends are quoted', () => {
    const draft = 'Order 1001 ships from our supplier; allow 7–21 days. Tracking: DEMO9400100000000000.'
    expect(codes(draft, shipped)).not.toContain('leadtime.optimistic')
  })

  it('warns rather than blocks on an overclaim', () => {
    const draft = 'Order 1001 is guaranteed to be perfect.'
    const problems = checkReplyGrounding(draft, shipped)
    const certainty = problems.find((p) => p.check === 'promise.certainty')!
    expect(certainty.severity).toBe('warning')
  })

  it('warns when the draft never names the order', () => {
    const problems = checkReplyGrounding('Thanks for getting in touch.', shipped)
    const missing = problems.find((p) => p.check === 'reference.missing')!
    expect(missing.severity).toBe('warning')
    // A soft concern must not block, or the operator learns to click past both.
    expect(mayFileReply('Thanks for getting in touch.', shipped)).toBe(true)
  })

  it('blocks an empty draft and says nothing else', () => {
    expect(checkReplyGrounding('   ', shipped)).toEqual([
      { check: 'draft.empty', message: 'The draft is empty.', severity: 'blocking' },
    ])
  })

  it('reports every problem, not just the first', () => {
    const draft = 'We will refund order 1001 and it will arrive by Tuesday.'
    const found = codes(draft, shipped)
    expect(found).toContain('promise.money')
    expect(found).toContain('promise.arrival')
  })
})

describe('isDraftable', () => {
  it('lets an agent draft the questions that are only questions', () => {
    expect(isDraftable('where_is_it')).toBe(true)
    expect(isDraftable('product_question')).toBe(true)
    expect(isDraftable('personalization_question')).toBe(true)
  })

  it('will not draft a reply to anything that is a decision', () => {
    // These are not harder to write — they commit the operator to something, and a
    // plausible draft makes the wrong answer easy to send by reflex.
    expect(isDraftable('refund_request')).toBe(false)
    expect(isDraftable('cancel_or_change')).toBe(false)
    expect(isDraftable('damaged_or_wrong')).toBe(false)
    expect(isDraftable('other')).toBe(false)
  })

  it('keeps the draftable set small on purpose', () => {
    expect(DRAFTABLE_INTENTS.size).toBe(3)
  })
})
