/**
 * Reading a Shopify order webhook payload, which is somebody else's JSON.
 *
 * Everything in here treats the payload as untrusted input rather than as an API
 * response. It arrives over the open internet at a public URL; the HMAC establishes
 * that it came from a party holding the shop's secret, and nothing more than that.
 * A compromised app, a Shopify bug, or a shop owner with a weird catalogue all
 * produce the same thing: a document whose shape is a claim.
 *
 * The part that matters most is the money. Shopify sends prices as DECIMAL STRINGS
 * — "14.99", not 1499 — and this system stores exact integer cents because the
 * alternative rounds a half-cent somewhere and nobody notices until the margin
 * report. `parseFloat(x) * 100` is the obvious conversion and it is wrong often
 * enough to matter, so it is not used here.
 */

import * as z from 'zod'

import type { IncomingOrder, IncomingOrderLine } from '../fulfillment'

/**
 * Lines one webhook may carry.
 *
 * A real order has a handful. A thousand-line payload is either a mistake or
 * somebody probing how much work one request can make this process do, and either
 * way it should be refused rather than ingested.
 */
export const MAX_WEBHOOK_LINES = 250

/** Longest channel id or sku we will store. Past this it is not an identifier. */
export const MAX_ID_CHARS = 200

/**
 * Buyer-supplied personalisation kept per line.
 *
 * Capped because it goes into a jsonb column, is shown to the operator, and is
 * written by whoever placed the order. A buyer who pastes a novel into a gift-note
 * field should not be able to decide how big this division's rows are.
 */
export const MAX_PERSONALIZATION_PROPS = 20
export const MAX_PERSONALIZATION_CHARS = 2_000

/** The only currency this system can store. `orders.total_cents` has no currency. */
export const SUPPORTED_CURRENCY = 'USD'

/**
 * A money string, as cents, without going through a float.
 *
 * `Math.round(parseFloat('14.99') * 100)` happens to give 1499, and the reason it
 * works is luck about where the binary representation falls — `parseFloat('14.99')
 * * 100` is actually 1498.9999999999998. Values exist where the rounding goes the
 * other way, and a system whose whole point is exact integer cents should not have
 * a float in the one place money enters it.
 *
 * Returns null rather than 0 for anything unparseable. Zero is a real price and
 * must not be what "I could not read this" looks like.
 */
export function decimalToCents(value: unknown): number | null {
  if (typeof value === 'number') {
    // Shopify sends strings, but a proxy or a test fixture may normalise them.
    if (!Number.isFinite(value)) return null
    return Math.round(value * 100)
  }
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  // Optional sign, digits, optional fraction. No exponents, no thousands
  // separators, no currency symbols: those are not Shopify money strings, and
  // guessing at one would be guessing at an amount.
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(trimmed)
  if (!match) return null

  const [, sign, whole, fraction = ''] = match
  // Pad or round the fraction to exactly two places. A third decimal is rounded
  // half-up on its own digits rather than by floating point.
  const cents2 = (fraction + '00').slice(0, 2)
  const third = fraction.length > 2 ? Number(fraction[2]) : 0

  const magnitude = Number(whole) * 100 + Number(cents2) + (third >= 5 ? 1 : 0)
  if (!Number.isSafeInteger(magnitude)) return null
  return sign === '-' ? -magnitude : magnitude
}

/**
 * The payload, loosely.
 *
 * Deliberately permissive: Shopify adds fields constantly and a strict schema would
 * reject a real order because a new optional key appeared. What is NOT permissive is
 * what happens after parsing — every value that reaches a row is re-checked below,
 * because a schema that accepts `z.unknown()` has established nothing.
 */
export const shopifyOrderPayloadSchema = z.object({
  id: z.union([z.string(), z.number()]),
  order_number: z.union([z.string(), z.number()]).nullish(),
  name: z.string().nullish(),
  email: z.string().nullish(),
  contact_email: z.string().nullish(),
  currency: z.string().nullish(),
  total_price: z.union([z.string(), z.number()]).nullish(),
  financial_status: z.string().nullish(),
  cancelled_at: z.string().nullish(),
  created_at: z.string().nullish(),
  shipping_address: z
    .object({
      address1: z.string().nullish(),
      city: z.string().nullish(),
      zip: z.string().nullish(),
      country_code: z.string().nullish(),
    })
    .nullish(),
  line_items: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]),
        /** Shopify's product id. The only reliable link back to our own row. */
        product_id: z.union([z.string(), z.number()]).nullish(),
        sku: z.string().nullish(),
        quantity: z.union([z.string(), z.number()]).nullish(),
        price: z.union([z.string(), z.number()]).nullish(),
        properties: z
          .array(z.object({ name: z.string().nullish(), value: z.unknown() }))
          .nullish(),
      }),
    )
    .nullish(),
})

export type ShopifyOrderPayload = z.infer<typeof shopifyOrderPayloadSchema>

export type MapResult =
  | { ok: true; order: IncomingOrder; warnings: string[] }
  | { ok: false; reason: string }

function idString(value: string | number): string {
  return String(value).trim().slice(0, MAX_ID_CHARS)
}

function wholeCount(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value.trim()) : value
  if (typeof n !== 'number' || !Number.isInteger(n)) return null
  return n
}

/**
 * Buyer-supplied properties, bounded.
 *
 * Kept as strings whatever arrived, because this is displayed to the operator and
 * handed to a printer. A nested object in here would reach a mug as "[object
 * Object]" or as nothing, and neither is something anybody chose.
 */
type LineProperty = { name?: string | null | undefined; value?: unknown }

function personalizationFrom(
  properties: readonly LineProperty[] | null | undefined,
): { value: Record<string, string> | null; truncated: boolean } {
  if (!Array.isArray(properties) || properties.length === 0) {
    return { value: null, truncated: false }
  }

  const out: Record<string, string> = {}
  let truncated = properties.length > MAX_PERSONALIZATION_PROPS
  let budget = MAX_PERSONALIZATION_CHARS

  for (const prop of properties.slice(0, MAX_PERSONALIZATION_PROPS)) {
    const name = typeof prop?.name === 'string' ? prop.name.trim().slice(0, 80) : ''
    if (!name) continue
    // Shopify uses underscore-prefixed properties for its own bookkeeping; they are
    // not something a buyer typed and not something a printer should see.
    if (name.startsWith('_')) continue

    const raw = prop.value
    const text =
      typeof raw === 'string'
        ? raw
        : typeof raw === 'number' || typeof raw === 'boolean'
          ? String(raw)
          : ''
    if (!text) continue

    const slice = text.slice(0, Math.max(0, budget))
    if (slice.length < text.length) truncated = true
    if (!slice) {
      truncated = true
      break
    }
    out[name] = slice
    budget -= slice.length
  }

  return { value: Object.keys(out).length > 0 ? out : null, truncated }
}

/**
 * Turn a verified payload into the shape `ingestOrder` takes.
 *
 * Refuses rather than guesses. Every `ok: false` below is a case where carrying on
 * would write a number nobody can stand behind, and an order that was refused with
 * a reason is recoverable — Shopify will redeliver, and the operator can see why.
 * An order silently booked at the wrong price is not.
 */
export function toIncomingOrder(payload: ShopifyOrderPayload): MapResult {
  const warnings: string[] = []

  const channelOrderId = idString(payload.id)
  if (!channelOrderId) return { ok: false, reason: 'the payload has no order id' }

  /*
   * Currency is checked, not recorded, because there is nowhere to record it:
   * `orders.total_cents` is a bare integer. A shop selling in GBP would have every
   * order booked as though those were US cents, and the margin reports built on top
   * would be wrong in a way nothing downstream could detect.
   */
  const currency = (payload.currency ?? SUPPORTED_CURRENCY).trim().toUpperCase()
  if (currency !== SUPPORTED_CURRENCY) {
    return {
      ok: false,
      reason:
        `the order is in ${currency} and this system stores only ${SUPPORTED_CURRENCY}; ` +
        'orders.total_cents has no currency, so ingesting it would book the wrong amount',
    }
  }

  const totalCents = decimalToCents(payload.total_price ?? '0')
  if (totalCents === null) {
    return { ok: false, reason: `total_price "${String(payload.total_price)}" is not an amount` }
  }
  if (totalCents < 0) {
    return { ok: false, reason: 'total_price is negative' }
  }

  const rawLines = payload.line_items ?? []
  if (rawLines.length === 0) {
    // An order with nothing in it is not an order, and routing would have nothing
    // to do. Refused rather than recorded as an empty shell somebody has to explain.
    return { ok: false, reason: 'the order has no line items' }
  }
  if (rawLines.length > MAX_WEBHOOK_LINES) {
    return {
      ok: false,
      reason: `the order has ${rawLines.length} lines, more than the ${MAX_WEBHOOK_LINES} this accepts`,
    }
  }

  const lines: IncomingOrderLine[] = []
  for (const raw of rawLines) {
    const channelLineItemId = idString(raw.id)
    if (!channelLineItemId) {
      return { ok: false, reason: 'a line item has no id, so it cannot be deduplicated' }
    }

    /*
     * Required, not defaulted to 1.
     *
     * Shopify always sends a quantity, so an absent or null one means the payload
     * is not what it claims to be — and the failure mode of guessing is that
     * somebody who ordered three mugs receives one. A refused order is redelivered
     * and visible; a short shipment is found by the customer.
     */
    const quantity = wholeCount(raw.quantity)
    if (quantity === null || quantity < 1) {
      return {
        ok: false,
        reason: `line ${channelLineItemId} has quantity "${String(raw.quantity)}"`,
      }
    }

    const unitPriceCents = decimalToCents(raw.price ?? '0')
    if (unitPriceCents === null || unitPriceCents < 0) {
      return {
        ok: false,
        reason: `line ${channelLineItemId} has price "${String(raw.price)}"`,
      }
    }

    const { value: personalization, truncated } = personalizationFrom(raw.properties)
    if (truncated) {
      // Said out loud. A personalised item is printed from this text, and silently
      // shortening what a buyer typed is how somebody receives a mug with half a
      // name on it.
      warnings.push(`line ${channelLineItemId}: buyer personalisation was truncated`)
    }

    lines.push({
      channelLineItemId,
      sku: raw.sku?.trim().slice(0, MAX_ID_CHARS) || null,
      /*
       * The channel's product id, carried so the ingester can find our row.
       *
       * Not the SKU: `products` has no sku column, and matching on a free-text
       * field a shop owner can retype is how a line silently attaches to the wrong
       * product. `shopify_product_id` is the id Shopify assigned when we published.
       */
      channelProductId:
        raw.product_id === null || raw.product_id === undefined
          ? null
          : idString(raw.product_id),
      // Ours, which only a database can resolve. Left for the ingester.
      productId: null,
      quantity,
      unitPriceCents,
      personalization,
      personalized: personalization !== null,
    })
  }

  /*
   * Paid and addressed are what routing is allowed to rely on, so both are read
   * from the payload rather than assumed.
   *
   * `financial_status` has several values that are not "money has arrived" —
   * pending, authorized, partially_paid, refunded. Only `paid` counts, and anything
   * else holds the order at the gate rather than sending it to a supplier.
   */
  const paid = (payload.financial_status ?? '').trim().toLowerCase() === 'paid'
  const addr = payload.shipping_address
  const hasValidAddress = Boolean(
    addr && addr.address1?.trim() && addr.city?.trim() && addr.country_code?.trim(),
  )

  if (payload.cancelled_at) {
    warnings.push('the order is cancelled in Shopify; it is recorded but must not be routed')
  }

  const placedAt = payload.created_at ? new Date(payload.created_at) : null

  return {
    ok: true,
    warnings,
    order: {
      channel: 'shopify',
      channelOrderId,
      orderNumber:
        payload.name?.trim() ||
        (payload.order_number !== null && payload.order_number !== undefined
          ? String(payload.order_number)
          : null),
      customerEmail: (payload.email ?? payload.contact_email ?? null)?.trim().slice(0, 320) || null,
      totalCents,
      // A cancelled order is never paid as far as routing is concerned, whatever
      // `financial_status` says about money that has since been refunded.
      paid: paid && !payload.cancelled_at,
      hasValidAddress,
      placedAt: placedAt && !Number.isNaN(placedAt.getTime()) ? placedAt : null,
      lines,
    },
  }
}
