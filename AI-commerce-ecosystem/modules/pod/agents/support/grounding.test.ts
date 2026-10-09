import { describe, expect, it } from 'vitest'

import {
  checkReplyGrounding,
  DRAFTABLE_INTENTS,
  isDraftable,
  mayFileReply,
  type OrderFacts,
} from './grounding'

/**
 * Most of this file exists because the first version of it did not.
 *
 * Every original test asserted the one literal phrasing its own regex had been
 * written from, so the suite was green while a draft that asserted shipment, quoted
 * an invented tracking number, promised an arrival date and committed to a refund
 * returned zero problems. The cases marked below with the phrasing that used to pass
 * are the ones that matter: they assert a behaviour class rather than a string.
 */

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
  decidedRemedies: [],
}

const inProduction: OrderFacts = {
  ...shipped,
  status: 'in_production',
  shippedAt: null,
  carrier: null,
  trackingNumber: null,
}

const codes = (draft: string, facts: OrderFacts = shipped) =>
  checkReplyGrounding(draft, facts).map((p) => p.check)

describe('checkReplyGrounding', () => {
  it('passes a reply that only states what the record says', () => {
    const draft =
      'Hi, order 1001 shipped on 3 October. USPS tracking: DEMO9400100000000000. ' +
      'It ships from our supplier, so allow 7–21 days.'
    expect(checkReplyGrounding(draft, shipped)).toEqual([])
    expect(mayFileReply(draft, shipped)).toBe(true)
  })

  it('lets the full quoted range through while refusing either end alone', () => {
    const both = 'Order 1001 ships from our supplier; allow 7–21 days. Tracking: DEMO9400100000000000.'
    expect(codes(both)).toEqual([])

    expect(codes('Order 1001 ships from our supplier; allow 7 days.')).toContain(
      'leadtime.optimistic',
    )
    expect(codes('Order 1001 ships from our supplier; allow 21 days.')).toContain(
      'leadtime.optimistic',
    )
  })

  it('catches the four claims that together used to return nothing at all', () => {
    /*
     * This exact draft returned [] from the first version of this file. Four checks,
     * four misses, one clean draft against an order still in production.
     */
    const draft =
      'Hi — thanks for checking in on order 1001.\n\n' +
      "It's on its way now, and your tracking number is 9400 1000 0000 0000 0000 00. " +
      'Expect it next week; most orders like yours land in 3-5 business days. ' +
      "I've gone ahead and refunded the shipping as an apology.\n\n— Support"

    const found = codes(draft, inProduction)
    expect(found).toContain('status.not_shipped')
    expect(found).toContain('tracking.unknown')
    expect(found).toContain('promise.arrival')
    expect(found).toContain('promise.money')
    expect(mayFileReply(draft, inProduction)).toBe(false)
  })

  describe('arrival promises', () => {
    const promises = [
      "It's on its way and should arrive by Friday.",
      'Order 1001 will be delivered before Christmas.',
      // Every one below passed the first version.
      'Order 1001 will arrive tomorrow.',
      'Order 1001 should arrive within a week.',
      'Expect it next week.',
      'Most orders like yours land in 3-5 business days.',
      'Order 1001 will arrive within 5 days.',
      'It should arrive in time for the holidays.',
      'It will reach you in a few days.',
      'Your parcel will be with you on Tuesday.',
      'It should show up any day now.',
    ]

    for (const draft of promises) {
      it(`refuses: ${draft}`, () => {
        expect(codes(`${draft} (order 1001)`)).toContain('promise.arrival')
      })
    }

    it('does not fire on a statement about elapsed time', () => {
      // The one true, record-derived sentence a "where is it" reply can lead with.
      // The first version blocked it while letting invented futures through.
      const draft = 'You placed order 1001 seven days ago, and it is still with our supplier.'
      expect(codes(draft)).not.toContain('promise.arrival')
    })
  })

  describe('money and goods', () => {
    const commitments = [
      'Sorry about that — we will refund you for order 1001 today.',
      // All of these passed the first version.
      "I've gone ahead and refunded the shipping on order 1001.",
      'Your refund for order 1001 has been issued.',
      "We're issuing a refund on order 1001.",
      "We'll send out a replacement for order 1001 at no cost.",
      'I have credited order 1001 back to your card.',
      'We are sending you another one for order 1001.',
    ]

    for (const draft of commitments) {
      it(`refuses: ${draft}`, () => {
        expect(codes(draft)).toContain('promise.money')
      })
    }

    it('allows the refund sentence once a human has decided a refund', () => {
      const draft = 'As agreed, we have refunded order 1001.'
      expect(codes(draft, { ...shipped, decidedRemedies: ['refund'] })).not.toContain(
        'promise.money',
      )
    })

    it('does not let a decided refund unlock a replacement nobody decided', () => {
      /*
       * The first version had one boolean, so approving a partial refund switched off
       * every money check in the draft.
       */
      const draft = "As agreed we have refunded order 1001, and we'll send a replacement free."
      expect(codes(draft, { ...shipped, decidedRemedies: ['refund'] })).toContain('promise.money')
    })

    it('does not fire on merely mentioning that refunds exist', () => {
      const draft = 'If you would like a refund on order 1001, reply here and someone will look.'
      expect(codes(draft)).not.toContain('promise.money')
    })
  })

  describe('shipping claims', () => {
    const claims = [
      'Good news — order 1001 is on its way!',
      // All of these passed the first version.
      "Good news — order 1001, it's on its way.",
      'Order 1001 has been shipped.',
      'Order 1001 shipped out yesterday.',
      'Order 1001 is in transit.',
      'Order 1001 is out for delivery.',
      'Order 1001 was dispatched this morning.',
    ]

    for (const draft of claims) {
      it(`refuses when the record has no shipping date: ${draft}`, () => {
        expect(codes(draft, inProduction)).toContain('status.not_shipped')
      })
    }

    it('does not fire on a present-tense statement about where it ships from', () => {
      const draft = 'Order 1001 ships from our supplier, so allow 7–21 days.'
      expect(codes(draft, inProduction)).not.toContain('status.not_shipped')
    })

    const denials = [
      // The honest sentences an unshipped order deserves. Refusing these pushes the
      // agent away from the only truthful thing it can say.
      'Order 1001 has not shipped yet.',
      'Nothing has shipped on order 1001.',
      'Order 1001 has not been dispatched.',
      'There is no tracking on order 1001 because nothing has shipped.',
    ]

    for (const draft of denials) {
      it(`allows the denial: ${draft}`, () => {
        expect(codes(draft, inProduction)).not.toContain('status.not_shipped')
      })
    }

    it('still catches a claim made after a denial in the same sentence', () => {
      const draft = "Order 1001 has not shipped yet, but it's on its way."
      expect(codes(draft, inProduction)).toContain('status.not_shipped')
    })
  })

  describe('tracking numbers', () => {
    it('refuses a tracking number that is not this order’s', () => {
      const problems = checkReplyGrounding('Order 1001 tracking: DEMO9400100000000999.', shipped)
      expect(problems.some((p) => p.check === 'tracking.unknown')).toBe(true)
    })

    const formatted = [
      // Every one of these passed the first version: the regex had no `i` flag and
      // no tolerance for the separators a tracking number is actually printed with.
      'Order 1001 tracking: 9400 1000 0000 0000 0000 00.',
      'Order 1001 tracking: 9400-1000-0000-0000.',
      'Order 1001 tracking: ez4000000012345678.',
    ]

    for (const draft of formatted) {
      it(`sees a conventionally formatted number: ${draft}`, () => {
        expect(codes(draft, inProduction)).toContain('tracking.unknown')
      })
    }

    it('accepts the record’s own number however it is spaced', () => {
      const draft = 'Order 1001 shipped. Tracking: DEMO 9400 1000 0000 0000.'
      expect(codes(draft)).not.toContain('tracking.unknown')
    })

    it('does not flag the order number itself', () => {
      const facts = { ...inProduction, orderNumber: 'ORDER12345678' }
      expect(codes('Your order ORDER12345678 is being made.', facts)).not.toContain(
        'tracking.unknown',
      )
    })

    it('does not flag a long ordinary word', () => {
      const draft = 'Order 1001 is indistinguishable from the photographs, which is the point.'
      expect(codes(draft)).not.toContain('tracking.unknown')
    })
  })

  describe('lead times', () => {
    it('refuses a figure faster than anything the record supports', () => {
      // Passed the first version, which only ever compared against the minimum — so
      // an invented number beat the truthful one.
      expect(codes('Order 1001 — most orders land in 3-5 business days.')).toContain(
        'leadtime.invented',
      )
    })

    it('still fires when the order number happens to contain the max digits', () => {
      /*
       * The first version skipped the check whenever `text.includes('21')` was true,
       * which an order number like 1215 satisfies. Whether the most-advertised check
       * in the file ran depended on digits in an unrelated identifier.
       */
      const facts = { ...shipped, orderNumber: '1215' }
      expect(codes('Order 1215 ships from our supplier; allow 7 days.', facts)).toContain(
        'leadtime.optimistic',
      )
    })

    it('is not silenced by the max digits appearing elsewhere', () => {
      const draft = 'Order 1001 ships in 7 days. You placed it on 21 September.'
      expect(codes(draft)).toContain('leadtime.optimistic')
    })

    it('says nothing about lead time when the record has no range', () => {
      const noRange = { ...shipped, leadTimeDaysMin: null, leadTimeDaysMax: null }
      expect(codes('Order 1001 — allow 7 days.', noRange)).not.toContain('leadtime.optimistic')
    })
  })

  it('warns rather than blocks on an overclaim', () => {
    const problems = checkReplyGrounding('Order 1001 is guaranteed to be perfect.', shipped)
    expect(problems.find((p) => p.check === 'promise.certainty')!.severity).toBe('warning')
  })

  it('warns when the draft never names the order', () => {
    const problems = checkReplyGrounding('Thanks for getting in touch.', shipped)
    expect(problems.find((p) => p.check === 'reference.missing')!.severity).toBe('warning')
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
    const found = codes(draft)
    expect(found).toContain('promise.money')
    expect(found).toContain('promise.arrival')
  })

  it('does not report the same problem twice for one draft', () => {
    const draft =
      'Order 1001 will arrive on Tuesday. It will also reach you by Friday. Order 1001.'
    expect(codes(draft).filter((c) => c === 'promise.arrival')).toHaveLength(1)
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
