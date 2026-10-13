/**
 * Deciding whether a webhook really came from the shop it claims to.
 *
 * This is the only credential on a public URL that writes customer orders, so the
 * one rule that outranks everything else here is FAIL CLOSED: with no secret
 * configured, every request is refused. The alternative — accept anything until
 * someone sets a secret — is the shape of bug this project has already shipped
 * once, where an IP gate with an empty blocklist reported every design clean and
 * nothing on any screen could tell that from the gate working.
 *
 * An open webhook is worse than an open blocklist. Anyone who found the URL could
 * post orders into the ledger, and the only thing distinguishing their orders from
 * real ones would be that nobody shipped anything.
 */

import { constantTimeEqual, hmacSha256, toBase64 } from './webcrypto'

/** Shopify's header. Base64 of HMAC-SHA256 over the raw request body. */
export const SHOPIFY_HMAC_HEADER = 'x-shopify-hmac-sha256'
export const SHOPIFY_TOPIC_HEADER = 'x-shopify-topic'
export const SHOPIFY_SHOP_HEADER = 'x-shopify-shop-domain'

/**
 * Bodies larger than this are refused unread.
 *
 * A real order payload is a few kilobytes. This is not a Shopify limit, it is a
 * limit on how much work one unauthenticated request can make this process do
 * before the signature has been checked — and the signature cannot be checked
 * until the whole body has been read.
 */
export const MAX_WEBHOOK_BODY_BYTES = 1_000_000

export type SecretLookup = (name: string) => string | undefined

/**
 * The signing secret for one division's shop.
 *
 * Per division, because two divisions are two Shopify custom apps with two
 * different secrets, and verifying division B's webhook against division A's
 * secret would either reject every real order or — far worse, if someone ever
 * "fixed" it by trying all of them — let any shop post orders into any division.
 *
 * Environment variables, never division config. Config is plain jsonb that is read
 * back to the browser on the settings screen and included in the archive export.
 *
 * `SHOPIFY_WEBHOOK_SECRET_<SLUG>` first, then `SHOPIFY_WEBHOOK_SECRET` as the
 * single-shop default, so one store needs one variable and a second store does not
 * require renaming the first.
 */
export function webhookSecretFor(slug: string, env: SecretLookup): string | null {
  const suffix = slug.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')
  const specific = suffix ? env(`SHOPIFY_WEBHOOK_SECRET_${suffix}`) : undefined
  const fallback = env('SHOPIFY_WEBHOOK_SECRET')
  const secret = (specific ?? fallback ?? '').trim()
  return secret === '' ? null : secret
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; reason: string }

/**
 * Verify the signature over the RAW body bytes.
 *
 * Bytes, not a reparsed string. The signature covers exactly what was sent, and
 * `JSON.parse` then `JSON.stringify` produces different bytes for the same document
 * — different key order, different number formatting, different escaping. Any
 * verification done against re-serialised JSON passes only by accident.
 */
export async function verifyShopifySignature(
  rawBody: ArrayBuffer | Uint8Array,
  headerValue: string | null,
  secret: string | null,
): Promise<VerifyResult> {
  if (!secret) {
    /*
     * 503, not 401, and not 200.
     *
     * 200 would mean a misconfigured deployment silently accepts forged orders.
     * 401 would tell Shopify the secret is wrong and have it disable the webhook
     * after enough failures. 503 says this end is not ready, which is true, and
     * Shopify retries — so orders queue rather than vanish while it is fixed.
     */
    return {
      ok: false,
      status: 503,
      reason:
        'no webhook signing secret is configured for this division, so no signature can be ' +
        'checked and nothing will be accepted. Set SHOPIFY_WEBHOOK_SECRET.',
    }
  }

  if (!headerValue || headerValue.trim() === '') {
    return { ok: false, status: 401, reason: 'the request carries no signature' }
  }

  const expected = toBase64(await hmacSha256(secret, rawBody))
  if (!(await constantTimeEqual(headerValue.trim(), expected))) {
    return { ok: false, status: 401, reason: 'the signature does not match' }
  }

  return { ok: true }
}

/**
 * Topics this endpoint does something with.
 *
 * An unlisted topic gets a 200 and is ignored rather than retried forever. Shopify
 * retries a non-2xx for days, so returning an error for a topic somebody enabled by
 * mistake turns a harmless misconfiguration into a queue that never drains.
 */
export const HANDLED_TOPICS = new Set([
  'orders/create',
  'orders/paid',
  'orders/updated',
])

/** Whether this topic should result in an order being recorded. */
export function topicIngests(topic: string): boolean {
  return HANDLED_TOPICS.has(topic.trim().toLowerCase())
}
