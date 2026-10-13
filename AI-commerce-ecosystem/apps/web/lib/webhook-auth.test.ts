/**
 * The only credential on a public URL that writes customer orders.
 *
 * The property these tests exist for is FAIL CLOSED. This project has already
 * shipped the other kind once — an IP gate reading an empty blocklist, reporting
 * every design clean, indistinguishable from a gate that was working. An open
 * webhook is the same mistake with a worse blast radius: anyone who found the URL
 * could post orders into the ledger.
 */

import { describe, expect, it } from 'vitest'

import { hmacSha256, toBase64 } from './webcrypto'
import {
  topicIngests,
  verifyShopifySignature,
  webhookSecretFor,
  type SecretLookup,
} from './webhook-auth'

const SECRET = 'shpss_a_real_looking_webhook_secret'
const BODY = '{"id":5544332211,"total_price":"14.99"}'

async function sign(body: string, secret = SECRET): Promise<string> {
  return toBase64(await hmacSha256(secret, body))
}

function env(values: Record<string, string>): SecretLookup {
  return (name) => values[name]
}

/* ------------------------------------------------------------------ *
 * Which secret
 * ------------------------------------------------------------------ */

describe('webhookSecretFor', () => {
  it('prefers the division-specific secret', () => {
    const lookup = env({
      SHOPIFY_WEBHOOK_SECRET: 'shared',
      SHOPIFY_WEBHOOK_SECRET_PAW_ORDER: 'theirs',
    })
    expect(webhookSecretFor('paw-order', lookup)).toBe('theirs')
  })

  it('falls back to the single-shop default', () => {
    expect(webhookSecretFor('paw-order', env({ SHOPIFY_WEBHOOK_SECRET: 'shared' }))).toBe('shared')
  })

  it('maps a slug to an env name the same way every time', () => {
    const lookup = env({ SHOPIFY_WEBHOOK_SECRET_ANTI_SCALPER_CLUB: 'x' })
    expect(webhookSecretFor('anti-scalper-club', lookup)).toBe('x')
    expect(webhookSecretFor('Anti-Scalper-Club', lookup)).toBe('x')
  })

  it('is null when nothing is configured', () => {
    expect(webhookSecretFor('paw-order', env({}))).toBeNull()
  })

  it('treats whitespace as nothing, because a blank variable is not a secret', () => {
    expect(webhookSecretFor('paw-order', env({ SHOPIFY_WEBHOOK_SECRET: '   ' }))).toBeNull()
  })
})

/* ------------------------------------------------------------------ *
 * The signature
 * ------------------------------------------------------------------ */

describe('verifyShopifySignature', () => {
  it('accepts a correctly signed body', async () => {
    const result = await verifyShopifySignature(
      new TextEncoder().encode(BODY),
      await sign(BODY),
      SECRET,
    )
    expect(result.ok).toBe(true)
  })

  it('REFUSES EVERYTHING when no secret is configured', async () => {
    /*
     * The whole point. A misconfigured deployment must not be an open endpoint
     * that writes orders — and this must hold even for a request whose signature
     * is perfectly valid under some other secret.
     */
    const result = await verifyShopifySignature(
      new TextEncoder().encode(BODY),
      await sign(BODY),
      null,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(503)
    expect(result.reason).toMatch(/SHOPIFY_WEBHOOK_SECRET/)
  })

  it('answers 503 and not 401 when unconfigured, so Shopify retries instead of giving up', async () => {
    // Shopify disables a webhook that keeps returning 4xx. 503 says "not ready",
    // which is true, and the orders queue rather than vanish while it is fixed.
    const result = await verifyShopifySignature(new TextEncoder().encode(BODY), 'anything', null)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(503)
  })

  it('refuses a request with no signature at all', async () => {
    for (const header of [null, '', '   ']) {
      const result = await verifyShopifySignature(new TextEncoder().encode(BODY), header, SECRET)
      expect(result.ok, String(header)).toBe(false)
      if (!result.ok) expect(result.status).toBe(401)
    }
  })

  it('refuses a signature made with a different secret', async () => {
    const result = await verifyShopifySignature(
      new TextEncoder().encode(BODY),
      await sign(BODY, 'some-other-secret'),
      SECRET,
    )
    expect(result.ok).toBe(false)
  })

  it('refuses when the body changed after signing, by a single byte', async () => {
    const signature = await sign(BODY)
    const tampered = BODY.replace('14.99', '14.98')
    const result = await verifyShopifySignature(
      new TextEncoder().encode(tampered),
      signature,
      SECRET,
    )
    expect(result.ok).toBe(false)
  })

  it('verifies the RAW bytes, not re-serialised JSON', async () => {
    /*
     * The signature covers exactly what was sent. `JSON.parse` then
     * `JSON.stringify` produces different bytes for the same document — key order,
     * number formatting, whitespace — so any verification done against
     * re-serialised JSON passes only by accident.
     */
    const pretty = JSON.stringify(JSON.parse(BODY), null, 2)
    expect(pretty).not.toBe(BODY)

    const signedOverRaw = await sign(BODY)
    const result = await verifyShopifySignature(
      new TextEncoder().encode(pretty),
      signedOverRaw,
      SECRET,
    )
    expect(result.ok).toBe(false)
  })

  it('handles a body that is not valid UTF-8', async () => {
    // Bytes in, bytes hashed. A decode-then-encode round trip would mangle these
    // and produce a mismatch on a request that was correctly signed.
    const bytes = new Uint8Array([0x7b, 0xff, 0xfe, 0x7d])
    const signature = toBase64(await hmacSha256(SECRET, bytes))
    const result = await verifyShopifySignature(bytes, signature, SECRET)
    expect(result.ok).toBe(true)
  })

  it('accepts an ArrayBuffer as well as a view, since that is what a Request gives', async () => {
    const bytes = new TextEncoder().encode(BODY)
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    const result = await verifyShopifySignature(buffer, await sign(BODY), SECRET)
    expect(result.ok).toBe(true)
  })

  it('tolerates whitespace around the header value', async () => {
    const result = await verifyShopifySignature(
      new TextEncoder().encode(BODY),
      `  ${await sign(BODY)}  `,
      SECRET,
    )
    expect(result.ok).toBe(true)
  })

  it('is not fooled by a prefix of the right signature', async () => {
    const real = await sign(BODY)
    const result = await verifyShopifySignature(
      new TextEncoder().encode(BODY),
      real.slice(0, real.length - 4),
      SECRET,
    )
    expect(result.ok).toBe(false)
  })
})

/* ------------------------------------------------------------------ *
 * Topics
 * ------------------------------------------------------------------ */

describe('topicIngests', () => {
  it('handles the order topics', () => {
    expect(topicIngests('orders/create')).toBe(true)
    expect(topicIngests('orders/paid')).toBe(true)
    expect(topicIngests('orders/updated')).toBe(true)
  })

  it('is case and whitespace insensitive', () => {
    expect(topicIngests('  Orders/Create ')).toBe(true)
  })

  it('does not act on a topic it was not built for', () => {
    for (const topic of ['customers/create', 'app/uninstalled', 'orders/delete', '']) {
      expect(topicIngests(topic), topic).toBe(false)
    }
  })
})
