import { assessAgentHealth } from '@acf/core/health'
import { agentRuns, agents, db, divisions, goals, ledger, tasks } from '@acf/db'
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'

import { provenanceOf, splitByProvenance } from '@/lib/provenance'

export const dynamic = 'force-dynamic'

/**
 * The war room: what is going wrong, and what is being aimed at.
 *
 * Every other screen answers "what is happening". This one answers "what should
 * worry me", which is a different query and a shorter list. Things earn a place here
 * by being actionable — a goal that will miss, a station that is red, a cap that is
 * nearly spent, work that is stuck.
 *
 * Nothing on this page is computed twice. The health assessment is the heartbeat's
 * own, and provenance comes from lib/provenance so a figure cannot mean one thing
 * here and another on Treasury.
 */

function usd(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`
}

function when(d: Date | string | null): string {
  if (!d) return '—'
  return new Date(d).toISOString().replace('T', ' ').slice(0, 16)
}

function daysUntil(deadline: Date, now: Date): number {
  return Math.ceil((new Date(deadline).getTime() - now.getTime()) / 86_400_000)
}

export default async function WarRoomPage() {
  const database = db()
  const now = new Date()
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)

  const divisionRows = await database.select().from(divisions).orderBy(divisions.name)
  const divisionName = new Map(divisionRows.map((d) => [d.id, d.name]))
  const divisionIds = divisionRows.map((d) => d.id)

  const goalRows =
    divisionIds.length > 0
      ? await database
          .select()
          .from(goals)
          .where(and(inArray(goals.divisionId, divisionIds), eq(goals.status, 'active')))
      : []

  const agentRows = await database.select().from(agents)
  const runRows = await database
    .select({
      agentId: agentRuns.agentId,
      status: agentRuns.status,
      startedAt: agentRuns.startedAt,
      finishedAt: agentRuns.finishedAt,
    })
    .from(agentRuns)
    .orderBy(desc(agentRuns.startedAt))
    .limit(500)

  // The heartbeat's own assessment, so this page and The Crew cannot disagree about
  // whether an agent is in trouble.
  const health = assessAgentHealth(
    agentRows.map((a) => ({
      id: a.id,
      name: a.name,
      divisionId: a.divisionId,
      schedule: a.schedule,
      status: a.status,
    })),
    runRows
      .filter((r): r is typeof r & { agentId: string } => r.agentId !== null)
      .map((r) => ({
        agentId: r.agentId,
        status: r.status,
        startedAt: new Date(r.startedAt),
        finishedAt: r.finishedAt ? new Date(r.finishedAt) : null,
      })),
    now,
  )
  /*
   * A paused agent is not trouble. It is the intended starting state — every agent
   * seeds paused — and the health assessment marks it `blocked`, which is the same
   * status a spend cap produces.
   *
   * Listing them here filled the page with thirteen rows reading "agent is paused",
   * which is the fastest way to teach an operator that this screen is noise. Things
   * earn a place here by being actionable; a switch somebody deliberately left off
   * is not.
   */
  const pausedAgentIds = new Set(agentRows.filter((a) => a.status === 'paused').map((a) => a.id))
  const hurting = health.filter((h) => h.light !== 'green' && !pausedAgentIds.has(h.agentId))
  const pausedCount = pausedAgentIds.size

  const stuckTasks =
    divisionIds.length > 0
      ? await database
          .select()
          .from(tasks)
          .where(and(inArray(tasks.divisionId, divisionIds), inArray(tasks.status, ['failed'])))
          .orderBy(desc(tasks.updatedAt))
          .limit(20)
      : []

  // Today's API spend per division, against each division's own cap.
  const todaySpend =
    divisionIds.length > 0
      ? await database
          .select({
            divisionId: ledger.divisionId,
            spent: sql<string>`SUM(ABS(${ledger.amountCents}))`,
          })
          .from(ledger)
          .where(and(eq(ledger.kind, 'api_cost'), gte(ledger.occurredAt, dayStart)))
          .groupBy(ledger.divisionId)
      : []
  const spentBy = new Map(todaySpend.map((r) => [r.divisionId, Number(r.spent)]))

  const ledgerRows = await database
    .select({ kind: ledger.kind, source: ledger.source, amountCents: ledger.amountCents })
    .from(ledger)
  const trust = splitByProvenance(ledgerRows)

  const pausedDivisions = divisionRows.filter((d) => d.status === 'paused')

  /*
   * A goal is at risk when the run rate needed to finish it from here is worse than
   * the one that got it this far. Deliberately crude — the point is to notice, not
   * to forecast — and a goal with no target or no deadline simply cannot be judged,
   * which is said rather than guessed at.
   */
  const goalViews = goalRows.map((goal) => {
    const target = goal.target ?? null
    const pct = target && target > 0 ? Math.min(100, Math.round((goal.current / target) * 100)) : null
    const days = goal.deadline ? daysUntil(goal.deadline, now) : null
    const remaining = target === null ? null : Math.max(0, target - goal.current)
    const perDayNeeded = remaining !== null && days !== null && days > 0 ? remaining / days : null

    let verdict: 'unmeasurable' | 'met' | 'at-risk' | 'overdue' | 'on-track'
    if (target === null || !goal.metric) verdict = 'unmeasurable'
    else if (remaining === 0) verdict = 'met'
    else if (days !== null && days < 0) verdict = 'overdue'
    else if (perDayNeeded !== null && perDayNeeded > 0 && days !== null && days <= 7)
      verdict = 'at-risk'
    else verdict = 'on-track'

    return { goal, pct, days, remaining, perDayNeeded, verdict }
  })

  const worrying =
    hurting.length + stuckTasks.length + pausedDivisions.length +
    goalViews.filter((g) => g.verdict === 'at-risk' || g.verdict === 'overdue').length

  return (
    <>
      <h1 className="screen-title">War Room</h1>
      <p className="screen-sub">
        What should worry you. {worrying === 0 ? 'Nothing, right now.' : `${worrying} thing(s).`}
      </p>

      {worrying === 0 ? (
        <div className="all-quiet">
          <strong>All quiet.</strong> No red stations, no failed tasks, no paused divisions, no
          goal about to miss. That is not the same as nothing happening — The Yard shows the
          work.
        </div>
      ) : null}

      <h2 className="section-title">Goals</h2>
      {goalRows.length === 0 ? (
        <div className="all-quiet">
          <strong>No goals set.</strong> Every agent run is handed its division&apos;s active
          goals, so a division with none gives its agents no target to reason about.
        </div>
      ) : (
        <table className="roster">
          <thead>
            <tr>
              <th>Goal</th>
              <th>Progress</th>
              <th>Deadline</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {goalViews.map(({ goal, pct, days, remaining, verdict }) => (
              <tr key={goal.id}>
                <td style={{ fontSize: 12 }}>
                  <strong>{goal.statement}</strong>
                  <div className="hash">
                    {divisionName.get(goal.divisionId) ?? goal.divisionId}
                    {goal.metric ? ` · ${goal.metric}` : ' · no metric'}
                  </div>
                </td>
                <td style={{ fontSize: 12 }}>
                  {goal.target === null ? (
                    <span className="hash">no target</span>
                  ) : (
                    <>
                      {goal.current} / {goal.target}
                      {pct !== null ? <span className="hash"> ({pct}%)</span> : null}
                      {remaining ? <div className="hash">{remaining} to go</div> : null}
                    </>
                  )}
                </td>
                <td className="hash" style={{ width: 140 }}>
                  {goal.deadline ? (
                    <>
                      {when(goal.deadline)}
                      <div>{days !== null ? `${days} day(s)` : ''}</div>
                    </>
                  ) : (
                    'none'
                  )}
                </td>
                <td style={{ width: 120 }}>
                  <span
                    className={`tag ${
                      verdict === 'overdue' || verdict === 'at-risk'
                        ? 'is-flagged'
                        : verdict === 'met'
                          ? 'is-cleared'
                          : ''
                    }`}
                  >
                    {verdict}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="section-title">Stations in trouble</h2>
      {hurting.length === 0 ? (
        <div className="all-quiet">
          <strong>Nothing is failing.</strong>
          {pausedCount > 0 ? (
            <p style={{ marginBottom: 0 }}>
              {pausedCount} agent(s) are paused, which is the state they seed in and not a
              problem. The Crew turns them on.
            </p>
          ) : null}
        </div>
      ) : (
        <table className="roster">
          <tbody>
            {hurting.map((h) => (
              <tr key={h.agentId}>
                <td style={{ width: 90 }}>
                  <span className={`tag ${h.light === 'red' ? 'is-flagged' : ''}`}>{h.status}</span>
                </td>
                <td style={{ fontSize: 12 }}>
                  <strong>{h.agent}</strong>
                  <div className="hash">{divisionName.get(h.divisionId) ?? h.divisionId}</div>
                </td>
                <td style={{ fontSize: 12 }}>{h.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="section-title">Today&apos;s spend against the cap</h2>
      <table className="roster">
        <tbody>
          {divisionRows.map((division) => {
            const spent = spentBy.get(division.id) ?? 0
            const cap = division.dailySpendCapCents
            const pct = cap > 0 ? Math.round((spent / cap) * 100) : 0
            return (
              <tr key={division.id}>
                <td style={{ width: '30%', fontSize: 12 }}>
                  <strong>{division.name}</strong>
                  <div className="hash">{division.status}</div>
                </td>
                <td style={{ fontSize: 12 }}>
                  {usd(spent)} of {usd(cap)}
                  <div className="hash">{pct}% of today&apos;s cap</div>
                </td>
                <td style={{ width: 110 }}>
                  <span className={`tag ${pct >= 80 ? 'is-flagged' : ''}`}>
                    {pct >= 100 ? 'capped' : pct >= 80 ? 'close' : 'room'}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="hash">
        {/* The figure's own provenance, rather than a figure presented bare. */}
        API spend is {trust.magnitudes.estimated > 0 ? 'ESTIMATED' : 'not yet recorded'} — priced
        from a model rate table at run time, never billed. The cap is enforced in the approval
        gate against this same ledger, so this page and the gate cannot disagree.
      </p>

      {stuckTasks.length > 0 ? (
        <>
          <h2 className="section-title">Work that failed</h2>
          <table className="roster">
            <tbody>
              {stuckTasks.map((task) => (
                <tr key={task.id}>
                  <td className="hash" style={{ width: 130 }}>
                    {when(task.updatedAt)}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <strong>{task.title}</strong>
                    <div className="hash">
                      {divisionName.get(task.divisionId) ?? task.divisionId}
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--rust)' }}>{task.error ?? 'no reason recorded'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {pausedDivisions.length > 0 ? (
        <>
          <h2 className="section-title">Paused divisions</h2>
          <div className="notice">
            <strong>{pausedDivisions.length} division(s) are paused.</strong> Nothing in them
            runs, scheduled or otherwise: {pausedDivisions.map((d) => d.name).join(', ')}.
          </div>
        </>
      ) : null}

      {trust.weakest === 'simulated' ? (
        <div className="notice" style={{ marginTop: 24 }}>
          <strong>Some of the money above is simulated.</strong> {usd(trust.magnitudes.simulated)}{' '}
          of the ledger is demo data describing money that never moved. Treasury breaks it down.
        </div>
      ) : null}
    </>
  )
}
