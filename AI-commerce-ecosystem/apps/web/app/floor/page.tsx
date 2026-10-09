import { assessAgentHealth } from '@acf/core/health'
import { agentRuns, agents, db, divisions, events } from '@acf/db'
import { desc, eq, inArray } from 'drizzle-orm'

import { MODULES, resolveAgentDefinition, resolveCounters } from '@/lib/modules'

export const dynamic = 'force-dynamic'

/**
 * The factory floor.
 *
 * Every module declares `stations`, and until now nothing rendered them — the field
 * existed, the counters had no resolver, and the floor was a line in a comment. This
 * is that screen.
 *
 * One rule runs through it: a dash is not a zero. A station whose counter cannot be
 * resolved shows "—", because a station that has never worked and a station that had
 * a quiet day are different things and the floor exists to tell them apart.
 */

function startOfToday(now: Date): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d
}

function when(d: Date | string): string {
  return new Date(d).toISOString().replace('T', ' ').slice(5, 16)
}

interface StationView {
  key: string
  label: string
  agentKey: string
  agentId: string | null
  agentName: string | null
  agentStatus: string | null
  runnable: boolean
  /** The heartbeat's own assessment, not a second opinion computed here. */
  health: string
  light: 'green' | 'amber' | 'red'
  healthReason: string
  counterName: string | null
  counterValue: number | null
  counterLabel: string | null
  isRunningTotal: boolean
  recent: Array<{ ts: Date; kind: string; level: string; message: string }>
}

export default async function FloorPage() {
  const database = db()
  const now = new Date()
  const since = startOfToday(now)

  const divisionRows = await database.select().from(divisions).orderBy(divisions.name)
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

  // The same assessment The Crew uses, so the two screens cannot disagree about
  // whether an agent is healthy.
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
  const healthBy = new Map(health.map((h) => [h.agentId, h]))

  const divisionIds = divisionRows.map((d) => d.id)
  const eventRows =
    divisionIds.length > 0
      ? await database
          .select()
          .from(events)
          .where(inArray(events.divisionId, divisionIds))
          .orderBy(desc(events.ts))
          .limit(400)
      : []

  const floors: Array<{
    divisionId: string
    divisionName: string
    divisionStatus: string
    moduleName: string
    stations: StationView[]
    unmanned: string[]
  }> = []

  for (const division of divisionRows) {
    const mod = MODULES.find((m) => m.name === division.type)
    if (!mod) {
      // A division whose module is no longer composed. Shown rather than skipped: a
      // division that silently vanishes from the floor is worse than one flagged.
      floors.push({
        divisionId: division.id,
        divisionName: division.name,
        divisionStatus: division.status,
        moduleName: division.type,
        stations: [],
        unmanned: [`no module named "${division.type}" is composed into this app`],
      })
      continue
    }

    const counters = resolveCounters(mod.name)
    const divisionAgents = agentRows.filter((a) => a.divisionId === division.id)

    const stations: StationView[] = []
    for (const station of mod.stations) {
      const agent = divisionAgents.find((a) => a.moduleAgentKey === station.agentKey) ?? null

      const isRunning = station.counterIsRunningTotal === true
      let counterValue: number | null = null
      if (station.counter && counters[station.counter]) {
        counterValue = await counters[station.counter]!({
          divisionId: division.id,
          // A running total still takes a window; it ignores it. Passing the epoch
          // would work too, but then a resolver that started honouring the window
          // would silently change meaning.
          since: isRunning ? new Date(0) : since,
          until: now,
        })
      }

      stations.push({
        key: station.key,
        label: station.label,
        agentKey: station.agentKey,
        agentId: agent?.id ?? null,
        agentName: agent?.name ?? null,
        agentStatus: agent?.status ?? null,
        runnable: resolveAgentDefinition(division.type, station.agentKey) !== null,
        health: agent ? (healthBy.get(agent.id)?.status ?? 'unknown') : 'unmanned',
        light: agent ? (healthBy.get(agent.id)?.light ?? 'amber') : 'red',
        healthReason: agent
          ? (healthBy.get(agent.id)?.reason ?? 'no assessment')
          : 'no agent row mans this station',
        counterName: station.counter ?? null,
        counterValue,
        // The label comes from the station, so the floor never has to know what any
        // particular module counts.
        counterLabel: station.counterLabel ?? station.counter ?? null,
        isRunningTotal: isRunning,
        recent: eventRows
          .filter((e) => e.divisionId === division.id && e.station === station.key)
          .slice(0, 4)
          .map((e) => ({ ts: e.ts, kind: e.kind, level: e.level, message: e.message })),
      })
    }

    floors.push({
      divisionId: division.id,
      divisionName: division.name,
      divisionStatus: division.status,
      moduleName: mod.name,
      stations,
      unmanned: stations.filter((s) => !s.agentId).map((s) => s.label),
    })
  }

  const totalStations = floors.reduce((n, f) => n + f.stations.length, 0)
  const notRunnable = floors.reduce(
    (n, f) => n + f.stations.filter((s) => !s.runnable).length,
    0,
  )

  return (
    <>
      <h1 className="screen-title">The Yard</h1>
      <p className="screen-sub">
        Every station across every division. {totalStations} posts, {notRunnable} with nobody who
        can work them.
      </p>

      {notRunnable > 0 ? (
        <div className="notice">
          <strong>{notRunnable} station(s) have no runner.</strong> The agent row exists and the
          station shows here, but nothing is wired to execute it. A scheduled run against one of
          these fails the task with a reason rather than silently dropping it.
        </div>
      ) : null}

      {floors.map((floor) => (
        <section key={floor.divisionId} style={{ marginBottom: 28 }}>
          <h2 className="section-title">
            {floor.divisionName}{' '}
            <span className="hash">
              {floor.moduleName} &middot; {floor.divisionStatus}
            </span>
          </h2>

          {floor.stations.length === 0 ? (
            <div className="notice">
              {floor.unmanned[0] ?? 'This module declares no stations.'}
            </div>
          ) : (
            <div className="stat-row">
              {floor.stations.map((s) => (
                <div className="stat" key={`${floor.divisionId}-${s.key}`}>
                  <span className="stat-label">{s.label}</span>
                  <span
                    className={`stat-value ${
                      s.counterValue === null || s.agentStatus !== 'active' ? 'is-waiting' : ''
                    }`}
                  >
                    {/* A dash, not a zero: never-counted is not nothing-happened. */}
                    {s.counterValue === null ? '—' : s.counterValue}
                  </span>
                  <span className="hash" style={{ display: 'block', marginTop: 4 }}>
                    {s.counterLabel ?? 'no counter'}
                    {s.isRunningTotal ? ' (total)' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {floor.stations.map((s) => (
            <article className="crate" key={`${floor.divisionId}-${s.key}-detail`}>
              <div className="crate-head">
                <h3 className="crate-title">
                  {/*
                    The light comes from the heartbeat's assessment, except that a
                    station nothing can run is red regardless of what the agent row
                    says. An idle agent with no runner would otherwise show green for
                    "healthy and waiting", and it is not waiting — it is stranded.
                  */}
                  <span className={`light light-${s.runnable ? s.light : 'red'}`} />
                  {s.label}
                </h3>
                <span className="hash">{s.agentName ?? 'unmanned'}</span>
              </div>
              <div className="crate-body">
                <ul className="tags">
                  <li className="tag">{s.agentKey}</li>
                  <li className={`tag ${s.agentStatus === 'active' ? 'is-cleared' : ''}`}>
                    {s.agentStatus ?? 'no agent row'}
                  </li>
                  {!s.runnable ? <li className="tag is-flagged">no runner</li> : null}
                  <li className="tag">{s.health}</li>
                </ul>
                <p className="hash" style={{ marginTop: 0, marginBottom: 12 }}>
                  {s.runnable ? s.healthReason : 'no runner is wired for this agent key'}
                </p>

                {s.recent.length === 0 ? (
                  <p className="hash" style={{ margin: 0 }}>
                    Nothing logged at this station yet.
                  </p>
                ) : (
                  <table className="roster">
                    <tbody>
                      {s.recent.map((e, i) => (
                        <tr key={`${s.key}-ev-${i}`}>
                          <td style={{ width: 110 }} className="hash">
                            {when(e.ts)}
                          </td>
                          <td style={{ width: 150 }}>
                            <span className={`tag ${e.level === 'error' ? 'is-flagged' : ''}`}>
                              {e.kind}
                            </span>
                          </td>
                          <td style={{ fontSize: 12 }}>{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </article>
          ))}
        </section>
      ))}
    </>
  )
}
