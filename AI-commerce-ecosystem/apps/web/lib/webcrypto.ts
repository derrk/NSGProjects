/**
 * The three crypto primitives this app needs, in one place.
 *
 * Lifted out of `session.ts`, which had them first and had them private. The second
 * caller is the Shopify webhook, which has to verify an HMAC over a request body
 * before it will write a customer's order — and a second copy of a constant-time
 * compare is exactly the thing that quietly becomes a `===` during a refactor by
 * somebody who did not know why it was written that way.
 *
 * WEB CRYPTO, NOT node:crypto. The session check runs in middleware, which runs on
 * the Edge runtime where `node:crypto` does not exist. Everything here is therefore
 * async and portable between Node and Edge, and a route handler that imports it
 * keeps that property for free.
 */

const encoder = new TextEncoder()

/** Bytes for anything we might be handed: a string, a view, a buffer. */
export function bytesOf(value: string | ArrayBuffer | Uint8Array): Uint8Array {
  if (typeof value === 'string') return encoder.encode(value)
  if (value instanceof Uint8Array) return value
  return new Uint8Array(value)
}

/**
 * HMAC-SHA256.
 *
 * Takes BYTES for the data, not a string, because the one caller that matters is
 * verifying a signature somebody else computed over a request body. Hashing
 * `await request.text()` instead would be correct only while the body is valid
 * UTF-8 — true for Shopify's JSON today, and a silent signature mismatch the first
 * time it is not.
 */
export async function hmacSha256(
  keyMaterial: string | ArrayBuffer | Uint8Array,
  data: string | ArrayBuffer | Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    bytesOf(keyMaterial) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, bytesOf(data) as BufferSource))
}

/** Standard base64. What Shopify sends in X-Shopify-Hmac-Sha256. */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

/** URL-safe base64, unpadded. What the session cookie carries. */
export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Constant-time string compare.
 *
 * Both sides are HMAC'd to a fixed width first. That removes the length-mismatch
 * problem — comparing different-length strings would otherwise either throw or
 * return early, and both leak length — and the final loop has no early exit.
 *
 * The key is a fixed domain string rather than a secret: the point is to make both
 * inputs the same width and unpredictable to an attacker who controls one of them,
 * not to keep anything hidden.
 */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const key = encoder.encode('acf.compare')
  const ah = await hmacSha256(key, a)
  const bh = await hmacSha256(key, b)

  let diff = ah.length ^ bh.length
  for (let i = 0; i < ah.length; i += 1) diff |= (ah[i] ?? 0) ^ (bh[i] ?? 0)
  return diff === 0
}
