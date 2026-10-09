import { agents, db, divisions, ledger } from '@acf/db'
import { eq, sql } from 'drizzle-orm'

import { describeLedgerTrust, PROVENANCE_LABEL, splitByProvenance } from '@/lib/provenance'

import { setAllDivisionsPaused } from './actions'
import { IdeaBox } from './idea-box'

export const dynamic = 'force-dynamic'

interface CompanyCash extends Record<string, unknown> {
  cash_in_cents: string
  cash_out_cents: string
  net_cents: string
  net_worth_cents: string
}

interface QueueDepth extends Record<string, unknown> {
  division_id: string
  name: string
  status: string
  pending_approvals: string
  queued_tasks: string
  blocked_tasks: string
  new_opportunities: string
}

/** The four company totals, and which column of v_company_cash each reads. */
const MONEY_TILES = [
  { label: 'Net', field: 'net_cents' },
  { label: 'Taken in', field: 'cash_in_cents' },
  { label: 'Burned', field: 'cash_out_cents' },
  { label: 'Held', field: 'net_worth_cents' },
] as const satisfies ReadonlyArray<{ label: string; field: keyof CompanyCash }>

function usd(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`
}

export default async function CompanyPage() {
  const database = db()

  // Reads the ledger views, so these numbers and the spend caps can never disagree.
  const cash = await database.execute<CompanyCash>(sql`SELECT * FROM v_company_cash`)
  const queues = await database.execute<QueueDepth>(
    sql`SELECT * FROM v_queue_depth ORDER BY name`,
  )

  const [agentCount] = await database
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(agents)
    .where(eq(agents.status, 'active'))

  const rows = (queues as unknown as { rows?: QueueDepth[] }).rows ?? (queues as unknown as QueueDepth[])
  const money = ((cash as unknown as { rows?: CompanyCash[] }).rows ?? (cash as unknown as CompanyCash[]))[0]

  /*
   * The same ledger the tiles above sum, read again with its `source` column.
   *
   * v_company_cash has no provenance dimension — it is a plain SUM — so the tiles
   * cannot say what their own figures are worth. Reading the rows here is what lets
   * the marking sit next to the number rather than in a paragraph underneath that
   * nobody updates.
   */
  const ledgerRows = await database
    .select({ kind: ledger.kind, source: ledger.source, amountCents: ledger.amountCents })
    .from(ledger)
  const trust = splitByProvenance(ledgerRows)

  const divisionRows = await database.select().from(divisions).orderBy(divisions.name)
  const activeDivisions = divisionRows.filter((d) => d.status === 'active')
  const everythingPaused = divisionRows.length > 0 && activeDivisions.length === 0

  const totals = rows.reduce(
    (acc, r) => ({
      approvals: acc.approvals + Number(r.pending_approvals),
      queued: acc.queued + Number(r.queued_tasks),
      blocked: acc.blocked + Number(r.blocked_tasks),
      opportunities: acc.opportunities + Number(r.new_opportunities),
    }),
    { approvals: 0, queued: 0, blocked: 0, opportunities: 0 },
  )

  return (
    <>
      <h1 className="screen-title">The Holding</h1>
      <p className="screen-sub">
        Everything, on one screen. {rows.length} division{rows.length === 1 ? '' : 's'},{' '}
        {agentCount?.n ?? 0} crew on shift.
      </p>

      {/*
        The marking sits ON the tiles, not under them. Four bare money figures with a
        disclaimer somewhere below is how a seeded $48.98 of invented revenue reads as
        company cash — which is exactly what happened here before this.
      */}
      <section className="stat-row" aria-label="Company totals">
        {MONEY_TILES.map((tile) => (
          <div className="stat" key={tile.label}>
            <span className="stat-label">{tile.label}</span>
            <span className="stat-value">{usd(Number(money?.[tile.field] ?? 0))}</span>
            {trust.weakest ? (
              <span
                className={`tag ${trust.weakest === 'simulated' ? 'is-flagged' : ''}`}
                style={{ display: 'inline-block', marginTop: 6 }}
              >
                {PROVENANCE_LABEL[trust.weakest]}
              </span>
            ) : null}
          </div>
        ))}
      </section>

      <section className="stat-row" aria-label="Queues">
        <div className="stat">
          <span className="stat-label">In quarantine</span>
          <span className={`stat-value ${totals.approvals > 0 ? 'is-waiting' : ''}`}>
            {totals.approvals}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Queued</span>
          <span className="stat-value">{totals.queued}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Blocked</span>
          <span className="stat-value">{totals.blocked}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Leads</span>
          <span className="stat-value">{totals.opportunities}</span>
        </div>
      </section>

      <h2 className="section-title">Divisions</h2>
      {rows.length === 0 ? (
        <div className="all-quiet">
          <strong>Nothing standing yet</strong>
          No divisions. Run the seed to raise the first one.
        </div>
      ) : (
        <table className="roster">
          <thead>
            <tr>
              <th>Division</th>
              <th>State</th>
              <th>Quarantine</th>
              <th>Queued</th>
              <th>Blocked</th>
              <th>Leads</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.division_id}>
                <td>{r.name}</td>
                <td>
                  <span className={`tag ${r.status === 'active' ? 'is-cleared' : ''}`}>
                    {r.status}
                  </span>
                </td>
                <td className="num">{r.pending_approvals}</td>
                <td className="num">{r.queued_tasks}</td>
                <td className="num">{r.blocked_tasks}</td>
                <td className="num">{r.new_opportunities}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="section-title">Research desk</h2>
      <div className="crate" style={{ borderLeftColor: 'var(--toxic)' }}>
        <div className="crate-body">
          <p style={{ marginTop: 0, color: 'var(--muted)' }}>
            Drop in an idea. An agent records it, and you decide in Quarantine whether to pursue
            it.
          </p>
          <IdeaBox divisions={activeDivisions.map((d) => ({ id: d.id, name: d.name }))} />
        </div>
      </div>

      <h2 className="section-title">Kill switch</h2>
      <div className="crate" style={{ borderLeftColor: everythingPaused ? 'var(--rust)' : 'var(--edge)' }}>
        <div className="crate-body">
          <p style={{ marginTop: 0, color: 'var(--muted)' }}>
            {everythingPaused
              ? 'Every division is shuttered. Nothing is scheduled and no agent will start.'
              : `${activeDivisions.length} division(s) running. Shuttering stops the scheduler for all of them within one tick.`}
          </p>
          <form action={setAllDivisionsPaused}>
            <input type="hidden" name="paused" value={everythingPaused ? 'false' : 'true'} />
            <button className={`act ${everythingPaused ? 'clear' : 'burn'}`} type="submit">
              {everythingPaused ? 'Reopen everything' : 'Shutter everything'}
            </button>
          </form>
        </div>
      </div>

      <div className="notice" style={{ marginTop: 28 }}>
        <strong>Demo data</strong> — the divisions, niches and concepts shipped by the seed are
        fictional, written by hand to exercise the pipeline.{' '}
        {/*
          Computed, not written. The sentence that used to be here said the ledger held
          only estimated API spend; a seed inserted revenue rows and the sentence went on
          saying it. A hardcoded paragraph cannot notice that it has stopped being true.
        */}
        {describeLedgerTrust(trust)}
      </div>
    </>
  )
}
