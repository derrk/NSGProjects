'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import {
  issueSession,
  passphraseMatches,
  readGateConfig,
  SESSION_COOKIE,
} from '@/lib/session'

export interface SignInState {
  error: string | null
}

/**
 * Sign in.
 *
 * Three things here are deliberate.
 *
 * The failure message never says whether the passphrase was close, long enough, or
 * the right shape. There is one secret and one message.
 *
 * The passphrase is never logged, never returned, and never put in a redirect — a
 * query string ends up in browser history, in a proxy log, and in the referrer sent
 * to any external resource the next page loads.
 *
 * There is no rate limiting here, and that is a real gap rather than an oversight.
 * A single-process dev app has nowhere to keep a counter that survives a reload, and
 * a counter that resets on reload is worse than none because it reads as protection.
 * Anything exposed to the internet needs this in front of a real limiter.
 */
export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const config = readGateConfig()

  if (config.misconfigured) {
    return { error: 'The operator passphrase is not usable. See the server configuration.' }
  }
  if (!config.passphrase) {
    // Nothing to sign in to. Minting a cookie here would create one that survives a
    // passphrase later being set.
    redirect('/')
  }

  const supplied = String(formData.get('passphrase') ?? '')
  if (!(await passphraseMatches(supplied, config))) {
    return { error: 'That passphrase is not correct.' }
  }

  const session = await issueSession(config.passphrase)
  const jar = await cookies()
  jar.set(SESSION_COOKIE, session.value, {
    httpOnly: true,
    sameSite: 'lax',
    // Secure in production only: a dev server on plain http would otherwise set a
    // cookie the browser refuses to send back, which looks like a broken passphrase.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: session.maxAge,
  })

  redirect('/')
}

export async function signOut(): Promise<void> {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
  redirect('/sign-in')
}
