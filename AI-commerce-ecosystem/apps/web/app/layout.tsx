import type { Metadata } from 'next'
import type { ReactNode } from 'react'

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
 */
const STATIONS = [
  { href: '/', label: 'The Holding' },
  { href: '/inbox', label: 'Quarantine' },
] as const

export default function RootLayout({ children }: { children: ReactNode }) {
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
              </ul>
            </nav>
          </header>
          <div className="hazard-rule" style={{ marginTop: 18 }} />
          <main>{children}</main>
        </div>
      </body>
    </html>
  )
}
