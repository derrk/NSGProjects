/**
 * The operator gate.
 *
 * This is a single-operator passphrase, not authentication. It does not identify
 * anyone, there are no accounts, and two people sharing the passphrase are
 * indistinguishable in every log and every audit trail this system keeps. Worth
 * saying plainly, because a login box looks like a great deal more than that, and
 * the approval inbox rests on the premise that a human decided — which this cannot
 * actually prove.
 *
 * What it does do: stop a stranger who finds the URL from approving a listing,
 * running an agent, or reading the ledger. That is the threat this is sized for.
 *
 * WHY WEB CRYPTO AND NOT node:crypto
 * The check has to run in middleware, and middleware runs on the Edge runtime where
 * `node:crypto` does not exist. That is not an incidental detail — the first version
 * of this gate ran in the root layout instead, which does not work at all: the page
 * component still executes and its output is serialised into the RSC flight payload,
 * so `curl` on a "locked" page returned the entire ledger while a browser showed a
 * sign-in form. A gate has to stop the page rendering, not stop it being displayed.
 *
 * Everything here is therefore async, and portable between Node and Edge.
 *
 * OTHER DESIGN NOTES
 * The cookie is a signed timestamp, not an encrypted blob and not a random id in a
 * table. No session store means no table to grow, no cleanup job and nothing to
 * leak; it costs the ability to revoke one session, which with a single operator is
 * not worth having. Rotating the passphrase invalidates every cookie, and that is
 * the revocation path.
 *
 * The signing key is derived from the passphrase rather than configured separately:
 * one secret to set wrong instead of two, and changing the passphrase necessarily
 * invalidates existing cookies, which it must, since the passphrase is the only
 * credential.
 */

import { constantTimeEqual, hmacSha256, toBase64Url } from './webcrypto'

export const SESSION_COOKIE = 'acf_operator'

/** Eight hours: a working day, short enough that a left-open laptop expires. */
export const SESSION_TTL_SECONDS = 8 * 60 * 60

/**
 * Below this the gate gives false confidence and is worse than no gate, because the
 * banner saying the door is open comes down while the door stays open.
 */
export const MIN_PASSPHRASE_LENGTH = 12

/** Honest clock drift to tolerate on a cookie that claims to be from the future. */
const FUTURE_SKEW_SECONDS = 60

export interface GateConfig {
  /** Null when no passphrase is set: the app runs open and says so on every screen. */
  passphrase: string | null
  /** Set when a passphrase exists but cannot be used. The app must refuse to pretend. */
  misconfigured: string | null
}

export function readGateConfig(env: Record<string, string | undefined> = process.env): GateConfig {
  const raw = env['ACF_OPERATOR_PASSPHRASE']
  if (raw === undefined || raw.trim() === '') {
    return { passphrase: null, misconfigured: null }
  }

  const passphrase = raw.trim()
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    /*
     * Refused rather than accepted with a warning. A short passphrase takes the "no
     * lock on this door" banner down while leaving the door open, and the operator
     * now believes something untrue. Failing loudly is the only outcome that cannot
     * be misread.
     */
    return {
      passphrase: null,
      misconfigured:
        `ACF_OPERATOR_PASSPHRASE is ${passphrase.length} characters; at least ` +
        `${MIN_PASSPHRASE_LENGTH} are required. Set a longer one or unset it entirely — ` +
        'a short passphrase removes the warning without removing the risk.',
    }
  }

  return { passphrase, misconfigured: null }
}

const encoder = new TextEncoder()

/*
 * The HMAC, the base64 and the constant-time compare now live in ./webcrypto, which
 * the Shopify webhook also needs. A second copy of a constant-time compare is the
 * thing that quietly becomes a `===` during a refactor by somebody who did not know
 * why it was written that way.
 */

async function signingKey(passphrase: string): Promise<Uint8Array> {
  // Domain-separated, so this key can never collide with the passphrase itself in a
  // log, a comparison, or some later use of the same secret.
  return hmacSha256(encoder.encode('acf.operator.session.v1'), passphrase)
}

async function sign(payload: string, passphrase: string): Promise<string> {
  return toBase64Url(await hmacSha256(await signingKey(passphrase), payload))
}

/** True when the supplied passphrase is the configured one. */
export async function passphraseMatches(supplied: string, config: GateConfig): Promise<boolean> {
  if (!config.passphrase) return false
  return constantTimeEqual(supplied.trim(), config.passphrase)
}

export interface IssuedCookie {
  value: string
  maxAge: number
}

/**
 * Mint a session cookie.
 *
 * `now` is a parameter so expiry can be asserted against fixed times rather than
 * against whatever the clock said when the test ran.
 */
export async function issueSession(passphrase: string, now: Date = new Date()): Promise<IssuedCookie> {
  const issuedAt = Math.floor(now.getTime() / 1000)
  // A nonce, so two cookies minted in the same second are not byte-identical. It
  // carries no meaning and is never checked; it exists so a cookie is not a stable
  // fingerprint of passphrase-plus-timestamp.
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(9)))
  const payload = `${issuedAt}.${nonce}`
  return { value: `${payload}.${await sign(payload, passphrase)}`, maxAge: SESSION_TTL_SECONDS }
}

export type SessionState =
  /** No passphrase configured. The app is open and every screen says so. */
  | { status: 'open' }
  /** A passphrase is set but unusable. Nothing is served until it is fixed. */
  | { status: 'misconfigured'; reason: string }
  | { status: 'valid' }
  | { status: 'missing' }
  | { status: 'invalid'; reason: string }

/**
 * Check a cookie.
 *
 * Order matters: the signature is verified before the timestamp is trusted, because
 * an unsigned timestamp is attacker-controlled and checking it first would mean
 * deciding how to treat input that has not been authenticated.
 */
export async function checkSession(
  cookieValue: string | undefined,
  config: GateConfig,
  now: Date = new Date(),
): Promise<SessionState> {
  if (config.misconfigured) return { status: 'misconfigured', reason: config.misconfigured }
  if (!config.passphrase) return { status: 'open' }
  if (!cookieValue) return { status: 'missing' }

  const parts = cookieValue.split('.')
  if (parts.length !== 3) return { status: 'invalid', reason: 'malformed' }

  const [issuedAtRaw, nonce, signature] = parts as [string, string, string]
  const payload = `${issuedAtRaw}.${nonce}`

  if (!(await constantTimeEqual(signature, await sign(payload, config.passphrase)))) {
    return { status: 'invalid', reason: 'bad signature' }
  }

  const issuedAt = Number(issuedAtRaw)
  if (!Number.isSafeInteger(issuedAt)) return { status: 'invalid', reason: 'malformed timestamp' }

  const ageSeconds = Math.floor(now.getTime() / 1000) - issuedAt
  if (ageSeconds > SESSION_TTL_SECONDS) return { status: 'invalid', reason: 'expired' }
  /*
   * A cookie from the future is rejected rather than tolerated. It means a clock
   * that moved or a forgery, and a signature passing does not make a nonsensical
   * timestamp safe to honour. A small skew allowance avoids rejecting an honest
   * cookie over a second of drift.
   */
  if (ageSeconds < -FUTURE_SKEW_SECONDS) return { status: 'invalid', reason: 'issued in the future' }

  return { status: 'valid' }
}
