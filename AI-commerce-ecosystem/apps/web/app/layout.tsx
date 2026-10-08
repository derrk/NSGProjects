import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'

export const metadata: Metadata = {
  title: 'DEADSTOCK — compound control',
  description: 'Approval queue and station board for an agent-run storefront.',
}

/**
 * The station names are a reskin of the agents in SPEC.md. The mapping is kept here,
 * in one place, so the theme can be swapped without touching any query:
 *
 *   QUARANTINE  -> /inbox       the approval queue
 *   THE YARD    -> /            the factory floor (week 3)
 *   SUPPLY RUNS -> /orders      orders (week 2)
 *   BUNKER      -> /settings    settings (week 3)
 */
const STATIONS = [
  { href: '/', label: 'The Yard' },
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
              <span className="tagline">Compound control &middot; nothing ships unchecked</span>
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
