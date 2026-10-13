/**
 * Reading somebody else's JSON, with money in it.
 *
 * These are written the way the last three reviews taught: not "does a good payload
 * work" but "here is the specific bad payload, what does it write". The payload
 * arrives over the open internet at a public URL, and the HMAC establishes only
 * that the sender holds the shop's secret — not that the document is sane.
 */

import { describe, expect, it } from 'vitest'

import {
  decimalToCents,
  MAX_PERSONALIZATION_CHARS,
  MAX_PERSONALIZATION_PROPS,
  MAX_WEBHOOK_LINES,
  shopifyOrderPayloadSchema,
  toIncomingOrder,
} from './shopify-order'

/* ------------------------------------------------------------------ *
 * Money
 * ------------------------------------------------------------------ */

describe('decimalToCents', () => {
  it('reads the ordinary cases exactly', () => {
    expect(decimalToCents('14.99')).toBe(1499)
    expect(decimalToCents('0.00')).toBe(0)
    expect(decimalToCents('100')).toBe(10_000)
    expect(decimalToCents('0.5')).toBe(50)
    expect(decimalToCents('  7.25  ')).toBe(725)
  })

  it('does not go through a float', () => {
    /*
     * `parseFloat('14.99') * 100` is 1498.9999999999998. Math.round saves it here
     * and does not save every value, and a system whose whole premise is exact
     * integer cents should not have a float in the one place money enters it.
     */
    for (const [text, cents] of [
      ['14.99', 1499],
      ['1.10', 110],
      ['29.97', 2997],
      ['1.005', 101],
      ['0.07', 7],
      ['1234567.89', 123456789],
    ] as const) {
      expect(decimalToCents(text), text).toBe(cents)
    }
  })

  it('rounds a third decimal on its own digits', () => {
    expect(decimalToCents('1.004')).toBe(100)
    expect(decimalToCents('1.005')).toBe(101)
    expect(decimalToCents('1.999')).toBe(200)
  })

  it('returns null rather than zero for anything it cannot read', () => {
    // Zero is a real price. It must not be what "I could not read this" looks like.
    for (const bad of ['', '  ', 'free', '1,299.00', '$14.99', '1e3', 'NaN', '--5', '1.2.3', null, undefined, {}, []]) {
      expect(decimalToCents(bad), String(bad)).toBeNull()
    }
  })

  it('reads a negative, so the caller can refuse it knowingly', () => {
    expect(decimalToCents('-5.00')).toBe(-500)
  })

  it('refuses a number too large to be an exact integer', () => {
    expect(decimalToCents('99999999999999999999.99')).toBeNull()
  })
})

/* ------------------------------------------------------------------ *
 * The payload
 * ------------------------------------------------------------------ */

function payload(over: Record<string, unknown> = {}) {
  return {
    id: 5544332211,
    name: '#1001',
    order_number: 1001,
    email: 'buyer@example.com',
    currency: 'USD',
    total_price: '14.99',
    financial_status: 'paid',
    created_at: '2026-10-09T12:00:00-05:00',
    shipping_address: { address1: '1 Any St', city: 'Denton', zip: '76201', country_code: 'US' },
    line_items: [
      { id: 999001, product_id: 777, sku: 'mug-11', quantity: 1, price: '14.99' },
    ],
    ...over,
  }
}

function map(over: Record<string, unknown> = {}) {
  const parsed = shopifyOrderPayloadSchema.safeParse(payload(over))
  if (!parsed.success) return { ok: false as const, reason: `schema: ${parsed.error.message}` }
  return toIncomingOrder(parsed.data)
}

describe('toIncomingOrder', () => {
  it('maps an ordinary paid order', () => {
    const result = map()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.order).toMatchObject({
      channel: 'shopify',
      channelOrderId: '5544332211',
      orderNumber: '#1001',
      customerEmail: 'buyer@example.com',
      totalCents: 1499,
      paid: true,
      hasValidAddress: true,
    })
    expect(result.order.lines[0]).toMatchObject({
      channelLineItemId: '999001',
      channelProductId: '777',
      quantity: 1,
      unitPriceCents: 1499,
    })
  })

  it('accepts a payload carrying fields it has never seen', () => {
    // Shopify adds keys constantly. A strict schema rejects a real order because an
    // optional field appeared, and a rejected order is a lost sale.
    expect(map({ some_new_2027_field: { nested: true } }).ok).toBe(true)
  })

  /* ---------------- money ---------------- */

  it('REFUSES a currency it cannot store rather than booking the number', () => {
    /*
     * orders.total_cents is a bare integer with no currency. A GBP order ingested
     * here is booked as though those were US cents, and every margin report built
     * on it is wrong in a way nothing downstream can detect.
     */
    const result = map({ currency: 'GBP' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/GBP/)
  })

  it('refuses an unreadable total', () => {
    expect(map({ total_price: 'free' }).ok).toBe(false)
    expect(map({ total_price: null }).ok).toBe(true) // null means 0.00, which is real
  })

  it('refuses a negative total', () => {
    const result = map({ total_price: '-14.99' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/negative/)
  })

  it('refuses a line with a price it cannot read', () => {
    expect(map({ line_items: [{ id: 1, price: 'ask us', quantity: 1 }] }).ok).toBe(false)
  })

  it('refuses a fractional or zero quantity', () => {
    for (const quantity of [0, -1, 1.5, 'two', null]) {
      const result = map({ line_items: [{ id: 1, price: '1.00', quantity }] })
      expect(result.ok, String(quantity)).toBe(false)
    }
  })

  /* ---------------- shape ---------------- */

  it('refuses an order with no lines', () => {
    const result = map({ line_items: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/no line items/)
  })

  it('refuses a line with no id, which could not be deduplicated', () => {
    // The whole idempotency story rests on (division, channel, order, line id). A
    // line with no id would be re-inserted on every redelivery.
    const result = map({ line_items: [{ id: '', price: '1.00', quantity: 1 }] })
    expect(result.ok).toBe(false)
  })

  it('refuses an implausible number of lines rather than ingesting them', () => {
    const many = Array.from({ length: MAX_WEBHOOK_LINES + 1 }, (_, i) => ({
      id: i + 1,
      price: '1.00',
      quantity: 1,
    }))
    const result = map({ line_items: many })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/more than/)
  })

  /* ---------------- what routing is allowed to believe ---------------- */

  it('treats anything other than "paid" as not paid', () => {
    // pending, authorized, partially_paid and refunded are all "money has not
    // arrived" for the purpose of spending on a supplier.
    for (const status of ['pending', 'authorized', 'partially_paid', 'refunded', 'voided', '']) {
      const result = map({ financial_status: status })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.order.paid, status).toBe(false)
    }
  })

  it('is not paid when the order is cancelled, whatever financial_status says', () => {
    const result = map({ financial_status: 'paid', cancelled_at: '2026-10-09T13:00:00Z' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.order.paid).toBe(false)
    expect(result.warnings.join(' ')).toMatch(/cancelled/)
  })

  it('needs a street, a city and a country before it calls an address valid', () => {
    for (const shipping_address of [
      null,
      {},
      { address1: '1 Any St' },
      { address1: '1 Any St', city: 'Denton' },
      { city: 'Denton', country_code: 'US' },
      { address1: '   ', city: 'Denton', country_code: 'US' },
    ]) {
      const result = map({ shipping_address })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.order.hasValidAddress, JSON.stringify(shipping_address)).toBe(false)
    }
  })

  /* ---------------- buyer-supplied text ---------------- */

  it('keeps what the buyer typed, as a personalised line', () => {
    const result = map({
      line_items: [
        {
          id: 1,
          price: '1.00',
          quantity: 1,
          properties: [{ name: 'Pet name', value: 'Biscuit' }],
        },
      ],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.order.lines[0]!.personalized).toBe(true)
    expect(result.order.lines[0]!.personalization).toEqual({ 'Pet name': 'Biscuit' })
  })

  it('drops Shopify’s own underscore properties, which no buyer typed', () => {
    const result = map({
      line_items: [
        {
          id: 1,
          price: '1.00',
          quantity: 1,
          properties: [
            { name: '_shopify_internal', value: 'xyz' },
            { name: 'Pet name', value: 'Biscuit' },
          ],
        },
      ],
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.order.lines[0]!.personalization).toEqual({ 'Pet name': 'Biscuit' })
  })

  it('bounds how much a buyer can decide to store, and SAYS it truncated', () => {
    /*
     * This goes into a jsonb column and onto a printed item. Silently shortening it
     * is how somebody receives a mug with half a name on it, so the truncation is a
     * warning the operator sees rather than something that just happens.
     */
    const result = map({
      line_items: [
        {
          id: 1,
          price: '1.00',
          quantity: 1,
          properties: [{ name: 'Note', value: 'x'.repeat(MAX_PERSONALIZATION_CHARS + 500) }],
        },
      ],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const value = String((result.order.lines[0]!.personalization ?? {})['Note'] ?? '')
    expect(value.length).toBeLessThanOrEqual(MAX_PERSONALIZATION_CHARS)
    expect(result.warnings.join(' ')).toMatch(/truncated/)
  })

  it('bounds the NUMBER of properties too, not only their length', () => {
    const properties = Array.from({ length: MAX_PERSONALIZATION_PROPS + 10 }, (_, i) => ({
      name: `p${i}`,
      value: 'v',
    }))
    const result = map({ line_items: [{ id: 1, price: '1.00', quantity: 1, properties }] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.order.lines[0]!.personalization ?? {}).length).toBeLessThanOrEqual(
      MAX_PERSONALIZATION_PROPS,
    )
    expect(result.warnings.join(' ')).toMatch(/truncated/)
  })

  it('does not turn a nested object into "[object Object]" on a mug', () => {
    const result = map({
      line_items: [
        {
          id: 1,
          price: '1.00',
          quantity: 1,
          properties: [{ name: 'Weird', value: { deeply: 'nested' } }],
        },
      ],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const text = JSON.stringify(result.order.lines[0]!.personalization)
    expect(text).not.toMatch(/object Object/)
  })

  it('leaves a line with no properties unpersonalised, so it is not held for review', () => {
    const result = map()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.order.lines[0]!.personalized).toBe(false)
  })

  /* ---------------- identifiers ---------------- */

  it('reads a numeric id as a string, because that is what the column holds', () => {
    const result = map({ id: 5544332211 })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.order.channelOrderId).toBe('5544332211')
  })

  it('falls back from name to order_number for the human-facing number', () => {
    const result = map({ name: null, order_number: 1001 })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.order.orderNumber).toBe('1001')
  })

  it('bounds an absurd id rather than storing it', () => {
    const result = map({ id: 'x'.repeat(5000) })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.order.channelOrderId.length).toBeLessThanOrEqual(200)
  })

  it('ignores an unparseable created_at instead of writing an Invalid Date', () => {
    const result = map({ created_at: 'last tuesday' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.order.placedAt).toBeNull()
  })
})
