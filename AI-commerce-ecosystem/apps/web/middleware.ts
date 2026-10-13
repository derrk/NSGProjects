import { NextResponse, type NextRequest } from 'next/server'

import { checkSession, readGateConfig, SESSION_COOKIE } from '@/lib/session'

/**
 * The gate. This one, and not the layout.
 *
 * The first version of this checked the session in the root layout and rendered a
 * sign-in form instead of `children`. That does not work, and the way it fails is
 * worth recording: a page component still executes, and React serialises its output
 * into the RSC flight payload embedded in the HTML. A browser showed the sign-in
 * form; `curl` on the same URL returned the entire ledger. The visible `<main>` was
 * 970 bytes and the response was 22KB.
 *
 * Middleware runs before any of that. It is the only place in this app where a
 * request can be stopped rather than hidden.
 *
 * Server actions are still guarded separately in `lib/auth.ts`. Middleware covers
 * them here too, but an action is a POST endpoint with its own id and defence in
 * depth is cheap for something this consequential.
 */

/** Reachable without a session. Everything else requires one. */
const PUBLIC_PATHS = new Set(['/sign-in'])

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true
  /*
   * The Inngest endpoint is deliberately not behind the operator passphrase. It is
   * called by the Inngest service rather than a person, and it has its own signing
   * key — INNGEST_SIGNING_KEY — which is the credential that belongs on it. Putting
   * a browser cookie in front of it would only break the scheduler.
   *
   * That makes it the one unauthenticated surface in the app when INNGEST_SIGNING_KEY
   * is unset, which it is in local development. Set it before this is reachable from
   * anywhere but your own machine.
   */
  if (pathname === '/api/inngest' || pathname.startsWith('/api/inngest/')) return true

  /*
   * Channel webhooks, for the same reason and with the same shape of credential.
   *
   * Shopify is not a person and has no cookie. Left behind the operator gate it
   * gets a 403 on every delivery, and Shopify disables a webhook that keeps
   * failing — so the orders would stop arriving and the only symptom would be a
   * quiet shop.
   *
   * The credential that belongs here is the per-shop HMAC over the request body,
   * checked in the route against a secret from the environment. That check FAILS
   * CLOSED: no secret configured means every request is refused, rather than an
   * unauthenticated endpoint that writes customer orders.
   */
  /*
   * Pinned to the one route, not to the prefix.
   *
   * `startsWith('/api/webhooks/')` was the first version, and it is the exact thing
   * the matcher comment below says not to do: every webhook route anybody adds
   * later becomes public the moment the file exists, including one written by
   * somebody who never read this. Inngest is pinned the same way. The next channel
   * costs one deliberate line here, which is the point.
   */
  if (pathname === '/api/webhooks/shopify' || pathname.startsWith('/api/webhooks/shopify/')) {
    return true
  }

  return false
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (isPublic(pathname)) return NextResponse.next()

  const config = readGateConfig()
  const session = await checkSession(request.cookies.get(SESSION_COOKIE)?.value, config, new Date())

  if (session.status === 'valid' || session.status === 'open') return NextResponse.next()

  /*
   * A server action POST gets a 403 rather than a redirect. Redirecting a POST would
   * have Next replay it against the sign-in page, and the operator would see a
   * confusing error instead of being told they are signed out.
   */
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new NextResponse('Operator sign-in required.', { status: 403 })
  }

  const url = request.nextUrl.clone()
  url.pathname = '/sign-in'
  // Where they were headed, so signing in lands them there. Only ever a path from
  // this app's own URL — never anything a caller supplied — so it cannot be used to
  // bounce someone to another origin.
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`
  return NextResponse.redirect(url)
}

export const config = {
  /**
   * Everything except Next's own assets.
   *
   * Written as an exclusion rather than a list of protected routes on purpose: a
   * page added later is protected by default, and forgetting to add it to a list is
   * exactly how a gate develops a hole.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
