import { describe, expect, it } from 'vitest'

import {
  checkSession,
  issueSession,
  MIN_PASSPHRASE_LENGTH,
  passphraseMatches,
  readGateConfig,
  SESSION_TTL_SECONDS,
  type GateConfig,
} from './session'

const PASS = 'correct horse battery staple'
const CONFIG: GateConfig = { passphrase: PASS, misconfigured: null }
const OPEN: GateConfig = { passphrase: null, misconfigured: null }
const NOW = new Date('2026-10-09T12:00:00Z')

const env = (v: Record<string, string>) => v

describe('readGateConfig', () => {
  it('runs open when no passphrase is set', () => {
    expect(readGateConfig(env({}))).toEqual({ passphrase: null, misconfigured: null })
  })

  it('treats whitespace as unset', () => {
    expect(readGateConfig(env({ ACF_OPERATOR_PASSPHRASE: '   ' })).passphrase).toBeNull()
  })

  it('refuses a short passphrase rather than accepting it with a warning', () => {
    /*
     * The failure this prevents: a short passphrase takes the "no lock on this door"
     * banner down while leaving the door open, and the operator now believes
     * something untrue. Refusing is the only outcome that cannot be misread.
     */
    const config = readGateConfig(env({ ACF_OPERATOR_PASSPHRASE: 'hunter2' }))
    expect(config.passphrase).toBeNull()
    expect(config.misconfigured).toMatch(/at least 12/)
  })

  it('does not put the passphrase in the error message', () => {
    // The misconfiguration message is rendered on a page and goes into logs.
    const config = readGateConfig(env({ ACF_OPERATOR_PASSPHRASE: 'hunter2' }))
    expect(config.misconfigured).not.toContain('hunter2')
  })

  it('accepts a passphrase at exactly the minimum length', () => {
    const exact = 'a'.repeat(MIN_PASSPHRASE_LENGTH)
    expect(readGateConfig(env({ ACF_OPERATOR_PASSPHRASE: exact })).passphrase).toBe(exact)
  })

  it('trims the configured passphrase so a trailing newline in .env does not lock you out', () => {
    expect(readGateConfig(env({ ACF_OPERATOR_PASSPHRASE: `${PASS}\n` })).passphrase).toBe(PASS)
  })
})

describe('passphraseMatches', () => {
  it('accepts the right passphrase', async () => {
    expect(await passphraseMatches(PASS, CONFIG)).toBe(true)
  })

  it('rejects the wrong one', async () => {
    expect(await passphraseMatches('wrong', CONFIG)).toBe(false)
  })

  it('rejects a prefix of the right one', async () => {
    expect(await passphraseMatches(PASS.slice(0, -1), CONFIG)).toBe(false)
  })

  it('rejects everything when no passphrase is configured', async () => {
    // Open mode must not mean "any passphrase works" — nothing should be able to
    // obtain a cookie that outlives a later passphrase being set.
    expect(await passphraseMatches('', OPEN)).toBe(false)
    expect(await passphraseMatches('anything', OPEN)).toBe(false)
  })

  it('ignores surrounding whitespace the operator pasted in', async () => {
    expect(await passphraseMatches(`  ${PASS}  `, CONFIG)).toBe(true)
  })
})

describe('issueSession and checkSession', () => {
  it('accepts a cookie it just minted', async () => {
    const cookie = await issueSession(PASS, NOW)
    expect(await checkSession(cookie.value, CONFIG, NOW)).toEqual({ status: 'valid' })
  })

  it('mints two different cookies for the same second', async () => {
    // Otherwise the cookie is a stable fingerprint of passphrase-plus-timestamp.
    const a = await issueSession(PASS, NOW)
    const b = await issueSession(PASS, NOW)
    expect(a.value).not.toBe(b.value)
  })

  it('expires the cookie after its lifetime', async () => {
    const cookie = await issueSession(PASS, NOW)
    const later = new Date(NOW.getTime() + (SESSION_TTL_SECONDS + 1) * 1000)
    expect(await checkSession(cookie.value, CONFIG, later)).toMatchObject({ reason: 'expired' })
  })

  it('still accepts it one second before expiry', async () => {
    const cookie = await issueSession(PASS, NOW)
    const later = new Date(NOW.getTime() + (SESSION_TTL_SECONDS - 1) * 1000)
    const state = await checkSession(cookie.value, CONFIG, later)
    expect(state.status).toBe('valid')
  })

  it('rejects a cookie signed with a different passphrase', async () => {
    // Rotating the passphrase is the revocation path; it has to actually revoke.
    const cookie = await issueSession('a completely different passphrase', NOW)
    expect(await checkSession(cookie.value, CONFIG, NOW)).toMatchObject({
      reason: 'bad signature',
    })
  })

  it('rejects a cookie whose timestamp has been edited', async () => {
    const cookie = await issueSession(PASS, NOW)
    const [, nonce, sig] = cookie.value.split('.')
    const forged = `${Math.floor(NOW.getTime() / 1000) + 999_999}.${nonce}.${sig}`

    // The signature covers the timestamp, so moving it forward to dodge expiry
    // invalidates the cookie rather than extending it.
    expect(await checkSession(forged, CONFIG, NOW)).toMatchObject({ reason: 'bad signature' })
  })

  it('rejects a malformed cookie without throwing', async () => {
    for (const bad of ['', 'x', 'a.b', 'a.b.c.d', '...']) {
      const state = await checkSession(bad, CONFIG, NOW)
      expect(state.status).not.toBe('valid')
    }
  })

  it('rejects a cookie issued in the future', async () => {
    // A signature passing does not make a nonsensical timestamp safe to honour.
    const cookie = await issueSession(PASS, new Date(NOW.getTime() + 3600 * 1000))
    expect(await checkSession(cookie.value, CONFIG, NOW)).toMatchObject({
      reason: 'issued in the future',
    })
  })

  it('tolerates a minute of clock drift', async () => {
    const cookie = await issueSession(PASS, new Date(NOW.getTime() + 30 * 1000))
    const state = await checkSession(cookie.value, CONFIG, NOW)
    expect(state.status).toBe('valid')
  })

  it('reports a missing cookie as missing, not invalid', async () => {
    // The two lead to different screens: one asks you to sign in, the other says
    // something is wrong.
    expect(await checkSession(undefined, CONFIG, NOW)).toEqual({ status: 'missing' })
  })

  it('reports open when nothing is configured, whatever the cookie says', async () => {
    expect(await checkSession(undefined, OPEN, NOW)).toEqual({ status: 'open' })
    expect(await checkSession('garbage', OPEN, NOW)).toEqual({ status: 'open' })
  })

  it('refuses to serve anything when the passphrase is misconfigured', async () => {
    const broken: GateConfig = { passphrase: null, misconfigured: 'too short' }
    const cookie = await issueSession(PASS, NOW)

    // Not open, and not valid. A misconfigured gate must not silently degrade to the
    // open mode it was meant to replace.
    expect(await checkSession(undefined, broken, NOW)).toMatchObject({ status: 'misconfigured' })
    const state = await checkSession(cookie.value, broken, NOW)
    expect(state.status).toBe('misconfigured')
  })
})
