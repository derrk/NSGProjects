import { db, divisions, ledger } from '@acf/db'
import { desc, sql } from 'drizzle-orm'

import { PROVENANCE_LABEL, provenanceOf, type Provenance } from '@/lib/provenance'

export const dynamic = 'force-dynamic'

/*
 * Provenance now lives in lib/provenance.ts, imported above.
 *
 * It used to be defined here, and The Holding summed the same ledger through a view
 * with no `source` column — so this screen marked every row while the dashboard
 * showed four unmarked money tiles. One definition, two screens, no disagreement.
 */

function usd(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`
}

function when(d: Date): string {
  return new Date(d).toISOString().replace('T', ' ').slice(0, 16)
}

interface PnlRow extends Record<string, unknown> {
  division_id: string
  month: string
  revenue_cents: string
  cogs_cents: string
  expense_cents: string
  api_cost_cents: string
  margin_cents: string
}

export default async function TreasuryPage() {
  const database = db()

  const divisionRows = await database.select().from(divisions).orderBy(divisions.name)
  const nameBy = new Map(divisionRows.map((d) => [d.id, d.name]))

  const pnl = await database.execute<PnlRow>(
    sql`SELECT * FROM v_division_pnl ORDER BY month DESC, division_id`,
  )
  const pnlRows =
    (pnl as unknown as { rows?: PnlRow[] }).rows ?? (pnl as unknown as PnlRow[])

  const entries = await database
    .select()
    .from(ledger)
    .orderBy(desc(ledger.occurredAt))
    .limit(50)

  const byProvenance = entries.reduce<Record<string, number>>((acc, e) => {
    const p = provenanceOf(e.kind, e.source)
    acc[p] = (acc[p] ?? 0) + Number(e.amountCents)
    return acc
  }, {})

  return (
    <>
      <h1 className="screen-title">Treasury</h1>
      <p className="screen-sub">
        Every entry, and how much it can be trusted. Nothing here is a bank balance.
      </p>

      <div className="notice">
        <strong>Read this before trusting a number</strong> — an{' '}
        <em>estimate</em> is priced from a model rate table at run time, not billed. A{' '}
        <em>simulated</em> entry came from an offline stand-in and represents no real
        transaction. <em>Verified</em> would mean a provider invoice or an imported
        transaction, and nothing in this ledger is that yet.
      </div>

      <h2 className="section-title">By provenance</h2>
      <section className="stat-row">
        {(['verified', 'manual', 'estimated', 'simulated'] as Provenance[]).map((p) => (
          <div className="stat" key={p}>
            <span className="stat-label">{PROVENANCE_LABEL[p]}</span>
            <span className={`stat-value ${p === 'verified' ? '' : 'is-waiting'}`}>
              {usd(byProvenance[p] ?? 0)}
            </span>
          </div>
        ))}
      </section>

      <h2 className="section-title">Profit and loss by division</h2>
      {pnlRows.length === 0 ? (
        <div className="all-quiet">
          <strong>Empty ledger</strong>
          Nothing has been earned or spent yet.
        </div>
      ) : (
        <table className="roster">
          <thead>
            <tr>
              <th>Division</th>
              <th>Month</th>
              <th>Revenue</th>
              <th>COGS</th>
              <th>Expenses</th>
              <th>API</th>
              <th>Margin</th>
            </tr>
          </thead>
          <tbody>
            {pnlRows.map((r, i) => (
              <tr key={`${r.division_id}-${r.month}-${i}`}>
                <td>{nameBy.get(r.division_id) ?? '—'}</td>
                <td className="hash">{String(r.month).slice(0, 7)}</td>
                <td className="num">{usd(Number(r.revenue_cents))}</td>
                <td className="num">{usd(Number(r.cogs_cents))}</td>
                <td className="num">{usd(Number(r.expense_cents))}</td>
                <td className="num">{usd(Number(r.api_cost_cents))}</td>
                <td className="num">{usd(Number(r.margin_cents))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="section-title">Recent entries</h2>
      {entries.length === 0 ? (
        <p className="hash">none</p>
      ) : (
        <table className="roster">
          <thead>
            <tr>
              <th>When</th>
              <th>Division</th>
              <th>Kind</th>
              <th>Source</th>
              <th>Trust</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const p = provenanceOf(e.kind, e.source)
              return (
                <tr key={e.id}>
                  <td className="hash">{when(e.occurredAt)}</td>
                  <td>{nameBy.get(e.divisionId) ?? '—'}</td>
                  <td>
                    <span className="tag">{e.kind}</span>
                  </td>
                  <td className="hash">{e.source}</td>
                  <td>
                    <span className={`tag ${p === 'verified' ? 'is-cleared' : 'is-flagged'}`}>
                      {PROVENANCE_LABEL[p]}
                    </span>
                  </td>
                  <td className="num">{usd(Number(e.amountCents))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <div className="notice" style={{ marginTop: 24 }}>
        <strong>Append only</strong> — a correction is a new row, never an edit. That is what
        makes these figures auditable, and it is why a refund shows as negative revenue rather
        than as an expense.
      </div>
    </>
  )
}
