import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { currentSession } from '@/lib/auth'

import { signOut } from './sign-in/actions'

import './globals.css'

export const metadata: Metadata = {
  title: 'DEADSTOCK — holding company control',
  description: 'One screen for every division an agent runs.',
}

/**
 * The screen names are a reskin of the command center in SPEC.md. The mapping lives
 * here, in one place, so the theme can be swapped without touching a single query:
 *
 *   THE HOLDING -> /          Company dashboard
 *   QUARANTINE  -> /inbox     the one approval queue, across divisions
 *   THE YARD    -> /floor     the factory floor (week 3)
 *   OUTFITS     -> /divisions divisions list and detail (week 2)
 *   THE CREW    -> /agents    agent registry (week 3)
 *   WAR ROOM    -> /war-room  what should worry you: goals, red stations, caps
 *   QUARTERS    -> /quarters  what the operator has trained, and what it has earned
 *   COMMS LAB   -> /comms     every outbound draft, and the count that has been sent
 *   SUPPLY LINES-> /supply    what is actually connected, and what is pretending
 *   DRY RUN     -> /dry-run   the whole pipeline on demo adapters, touching nothing
 */
const STATIONS = [
  { href: '/', label: 'The Holding' },
  { href: '/inbox', label: 'Quarantine' },
  { href: '/floor', label: 'The Yard' },
  { href: '/divisions', label: 'Outfits' },
  { href: '/agents', label: 'The Crew' },
  { href: '/war-room', label: 'War Room' },
  { href: '/comms', label: 'Comms Lab' },
  { href: '/treasury', label: 'Treasury' },
  { href: '/supply', label: 'Supply Lines' },
  { href: '/dry-run', label: 'Dry Run' },
  { href: '/quarters', label: 'Quarters' },
  { href: '/archives', label: 'Archives' },
] as const

/**
 * The shell.
 *
 * No gate here. An earlier version of this checked the session and rendered a
 * sign-in form instead of `children`, which does not protect anything: the page
 * component still executes and its output is serialised into the RSC payload, so
 * `curl` on a "locked" page returned the whole ledger while a browser showed a form.
 * The gate is `middleware.ts`, which stops the request before any of that.
 *
 * What is left here is the one thing a layout can usefully do about it: show, on
 * every screen, whether a lock exists at all.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await currentSession()

  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header>
            <div className="topbar">
              <h1 className="brand">
                Dead<span className="brand-mark">stock</span>
              </h1>
              <span className="tagline">Holding co. &middot; nothing ships unchecked</span>
            </div>
            <nav aria-label="Stations">
              <ul className="stations">
                {STATIONS.map((s) => (
                  <li key={s.href}>
                    <a href={s.href}>{s.label}</a>
                  </li>
                ))}
                {session.status === 'valid' ? (
                  <li>
                    <form action={signOut}>
                      <button className="act" type="submit">
                        Lock up
                      </button>
                    </form>
                  </li>
                ) : null}
              </ul>
            </nav>
          </header>
          <div className="hazard-rule" style={{ marginTop: 18 }} />
          <main>{children}</main>
          {session.status === 'open' ? <OpenDoorWarning /> : null}
        </div>
      </body>
    </html>
  )
}

/**
 * Shown on every screen while no passphrase is set.
 *
 * Deliberately not dismissible and deliberately on every page rather than one.
 * Running open is a legitimate local-development choice; forgetting that you are is
 * not.
 */
function OpenDoorWarning() {
  return (
    <div className="notice" style={{ marginTop: 28 }}>
      <strong>No lock on this door.</strong> ACF_OPERATOR_PASSPHRASE is not set, so anyone who
      can reach this URL can approve listings, run agents and read the ledger. Fine on your own
      machine. Set a passphrase of at least 12 characters before this is reachable from
      anywhere else.
    </div>
  )
}
