import 'server-only'

import { cookies } from 'next/headers'

import { checkSession, readGateConfig, SESSION_COOKIE, type SessionState } from './session'

/**
 * Reading and enforcing the operator gate.
 *
 * Split from `session.ts` so the logic there stays pure and testable without Next's
 * request context. This file is the part that touches cookies.
 *
 * The security boundary is `middleware.ts`, which stops a request before any page
 * renders. This file is defence in depth on top of it: every server action calls
 * `requireOperator()` itself, because an action is a POST endpoint with its own id
 * and a second check on something this consequential is nearly free.
 *
 * What this file is NOT sufficient for on its own: a gate that only runs during
 * rendering does not protect a page at all. The page component still executes and
 * its output is serialised into the RSC payload, so the data goes out over the wire
 * whether or not anything displays it. That is why the middleware exists.
 */

export async function currentSession(): Promise<SessionState> {
  const jar = await cookies()
  return await checkSession(jar.get(SESSION_COOKIE)?.value, readGateConfig())
}

export class NotSignedInError extends Error {
  constructor(readonly state: SessionState) {
    super('operator sign-in required')
    this.name = 'NotSignedInError'
  }
}

/**
 * Refuse to proceed unless this request is the operator.
 *
 * Called at the top of every server action that changes anything. In open mode —
 * no passphrase configured — it passes, which is what keeps `pnpm dev` working with
 * no setup. The open mode is loudly visible on every screen; it is a choice, not a
 * gap that this function papers over.
 */
export async function requireOperator(): Promise<void> {
  const state = await currentSession()
  if (state.status === 'valid' || state.status === 'open') return
  throw new NotSignedInError(state)
}
