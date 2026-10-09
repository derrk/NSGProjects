import { agents, approvals, db, divisions, opportunities, tasks } from '@acf/db'
import { eq, sql } from 'drizzle-orm'

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

      <section className="stat-row" aria-label="Company totals">
        <div className="stat">
          <span className="stat-label">Net</span>
          <span className="stat-value">{usd(Number(money?.net_cents ?? 0))}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Taken in</span>
          <span className="stat-value">{usd(Number(money?.cash_in_cents ?? 0))}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Burned</span>
          <span className="stat-value">{usd(Number(money?.cash_out_cents ?? 0))}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Held</span>
          <span className="stat-value">{usd(Number(money?.net_worth_cents ?? 0))}</span>
        </div>
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

      <div className="notice" style={{ marginTop: 28 }}>
        <strong>Week 1</strong> — the figures above are real, read from the ledger views, but the
        ledger only has API spend in it so far. Revenue starts landing in week 2 when Store ops
        publishes and orders sync.
      </div>
    </>
  )
}
