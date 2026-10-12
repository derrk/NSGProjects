import { assessAgentHealth } from '@acf/core/health'
import { agentRuns, agents, approvals, db, divisions, events, tasks } from '@acf/db'
import { and, desc, eq, inArray } from 'drizzle-orm'

import { MODULES, resolveAgentDefinition, resolveCounters } from '@/lib/modules'

import { Gate, Post, type GateView, type PostView, type UnitState } from './compound'

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


/**
 * What one post looks like right now.
 *
 * The state is decided by the work against it, not only by the agent's health: a
 * healthy, idle agent with four queued tasks is not fine, it is a queue. The order
 * of these checks is the order of severity.
 */
function buildPost(input: {
  key: string
  label: string
  agent: { id: string; name: string; status: string } | null
  runnable: boolean
  healthReason: string
  tasks: Array<{ status: string; title: string }>
}): PostView {
  const queued = input.tasks.filter((t) => t.status === 'queued').length
  const blocked = input.tasks.filter((t) => t.status === 'blocked').length
  const failed = input.tasks.filter((t) => t.status === 'failed').length
  const running = input.tasks.find((t) => t.status === 'running') ?? null

  let state: UnitState
  let reason: string

  if (!input.agent) {
    state = 'unmanned'
    reason = 'no agent mans this post'
  } else if (!input.runnable) {
    // Red whatever the agent row says. An agent with no runner is not waiting, it is
    // stranded, and work queued at it will never move.
    state = 'stuck'
    reason = 'nothing is wired to work this post'
  } else if (failed > 0) {
    state = 'stuck'
    reason = `${failed} task(s) failed here`
  } else if (running) {
    state = 'running'
    reason = 'working'
  } else if (input.agent.status === 'paused') {
    state = 'paused'
    reason = queued > 0 ? `paused, with ${queued} waiting` : 'paused'
  } else if (queued > 0) {
    state = 'waiting'
    reason = `${queued} waiting to be picked up`
  } else if (blocked > 0) {
    state = 'waiting'
    reason = `${blocked} held at the gate`
  } else {
    state = 'idle'
    reason = input.healthReason
  }

  return {
    key: input.key,
    label: input.label,
    agentName: input.agent?.name ?? null,
    state,
    doing: running?.title ?? null,
    reason,
    queued,
    blocked,
    failed,
    runnable: input.runnable,
  }
}

function buildGate(pending: Array<{ kind: string }>): GateView {
  const byKind = new Map<string, number>()
  for (const row of pending) byKind.set(row.kind, (byKind.get(row.kind) ?? 0) + 1)
  return {
    pending: pending.length,
    byKind: [...byKind.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count),
  }
}

/**
 * The one sentence worth reading before the map.
 *
 * Names the post holding the most work it cannot move, and says which kind of stuck
 * it is — because "nobody picked it up", "it is waiting on you" and "it broke" are
 * three different problems and only one of them is yours.
 */
function verdictFor(posts: PostView[], gate: GateView): { text: string; clear: boolean } {
  const broken = posts.filter((p) => p.failed > 0).sort((a, b) => b.failed - a.failed)
  if (broken[0]) {
    return {
      text: `${broken[0].label} has ${broken[0].failed} failed task(s). Work is breaking there, not queueing.`,
      clear: false,
    }
  }

  const stranded = posts.filter((p) => !p.runnable && p.queued > 0)
  if (stranded[0]) {
    return {
      text: `${stranded[0].label} has ${stranded[0].queued} task(s) queued and nothing wired to work them. They will sit there.`,
      clear: false,
    }
  }

  const queueing = posts.filter((p) => p.queued > 0).sort((a, b) => b.queued - a.queued)
  if (queueing[0] && queueing[0].queued >= gate.pending) {
    const post = queueing[0]
    return {
      text:
        `${post.label} is the bottleneck: ${post.queued} waiting to be picked up` +
        (post.state === 'paused' ? ', and it is paused.' : '.'),
      clear: false,
    }
  }

  if (gate.pending > 0) {
    return {
      text: `The bottleneck is you: ${gate.pending} decision(s) waiting in Quarantine. Nothing downstream moves until they are made.`,
      clear: false,
    }
  }

  const unmanned = posts.filter((p) => !p.runnable).length
  return {
    text:
      'Nothing is queued, held or broken.' +
      (unmanned > 0
        ? ` ${unmanned} post(s) have no runner, so they will stay quiet whatever happens.`
        : ''),
    clear: true,
  }
}

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
  /** Everything the compound map needs to draw this post. */
  post: PostView
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

  /*
   * Work, by where it is stuck.
   *
   * `queued` is work nobody has picked up; `blocked` is work waiting on the operator;
   * `failed` is work that broke. Those three are the only states that can pile up,
   * and each one means something different to fix — so they are counted apart rather
   * than totalled into "open work".
   */
  const liveTasks =
    divisionIds.length > 0
      ? await database
          .select({
            agentId: tasks.agentId,
            status: tasks.status,
            title: tasks.title,
            updatedAt: tasks.updatedAt,
          })
          .from(tasks)
          .where(
            and(
              inArray(tasks.divisionId, divisionIds),
              inArray(tasks.status, ['queued', 'running', 'blocked', 'failed']),
            ),
          )
      : []

  const pendingApprovals =
    divisionIds.length > 0
      ? await database
          .select({ kind: approvals.kind, divisionId: approvals.divisionId })
          .from(approvals)
          .where(
            and(inArray(approvals.divisionId, divisionIds), eq(approvals.decision, 'pending')),
          )
      : []
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
    gate: GateView
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
        gate: { pending: 0, byKind: [] },
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
        post: buildPost({
          key: station.key,
          label: station.label,
          agent,
          runnable: resolveAgentDefinition(division.type, station.agentKey) !== null,
          healthReason: agent
            ? (healthBy.get(agent.id)?.reason ?? 'no assessment')
            : 'no agent row mans this station',
          tasks: liveTasks.filter((t) => agent !== null && t.agentId === agent.id),
        }),
        recent: eventRows
          .filter((e) => e.divisionId === division.id && e.station === station.key)
          .slice(0, 4)
          .map((e) => ({ ts: e.ts, kind: e.kind, level: e.level, message: e.message })),
      })
    }

    floors.push({
      gate: buildGate(pendingApprovals.filter((a) => a.divisionId === division.id)),
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
            <>
              {(() => {
                const verdict = verdictFor(
                  floor.stations.map((s) => s.post),
                  floor.gate,
                )
                return (
                  <p className={`verdict ${verdict.clear ? 'is-clear' : ''}`}>{verdict.text}</p>
                )
              })()}

              {/*
                The gate sits in the middle of the posts because that is where it is
                in the system: every agent's run ends at it. Half the posts, then the
                gate, then the rest — so the picture reads as everything feeding one
                place, which is what actually happens.
              */}
              {(() => {
                /*
                 * The gate goes in the MIDDLE column, not merely halfway through the
                 * list. In a three-column grid that means an index where i % 3 === 1,
                 * so the split is nudged to the nearest one rather than taken at the
                 * halfway point — otherwise the hub ends up against the left wall and
                 * the picture stops saying what it is for.
                 */
                const count = floor.stations.length
                const middle = Math.ceil(count / 2)
                let gateAt = middle
                for (let step = 0; step < 3; step += 1) {
                  if ((middle + step) % 3 === 1) {
                    gateAt = middle + step
                    break
                  }
                }

                return (
                  <div className="compound">
                    {floor.stations.slice(0, gateAt).map((s) => (
                      <Post post={s.post} key={`${floor.divisionId}-${s.key}-post`} />
                    ))}
                    <Gate gate={floor.gate} />
                    {floor.stations.slice(gateAt).map((s) => (
                      <Post post={s.post} key={`${floor.divisionId}-${s.key}-post`} />
                    ))}
                  </div>
                )
              })()}

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
            </>
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
