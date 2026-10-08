/**
 * Derive each station's status from its run history.
 *
 * Pure: no database, no clock of its own. `health.heartbeat` calls this every 15
 * minutes and writes the result; the factory floor renders exactly what it says.
 */

import {
  AGENTS,
  FAILURE_STREAK_FOR_RED,
  LIGHT_BY_STATUS,
  STALE_INTERVAL_MULTIPLIER,
  type AgentDescriptor,
  type AgentHealth,
  type RunSummary,
} from './types'

export interface AssessOptions {
  /** Agents currently held back by a spend cap or the pause switch. */
  blocked?: ReadonlySet<string> | readonly string[]
  agents?: readonly AgentDescriptor[]
}

const MINUTE_MS = 60_000

function minutesSince(from: Date, now: Date): number {
  return (now.getTime() - from.getTime()) / MINUTE_MS
}

/**
 * Status precedence: error > running > blocked > stale > idle.
 *
 * Errors outrank a run that is in flight on purpose — an agent retrying after three
 * straight failures is still a red light, and showing green because something is
 * currently executing would hide exactly the condition the operator needs to see.
 */
export function assessAgentHealth(
  runs: readonly RunSummary[],
  now: Date,
  options: AssessOptions = {},
): AgentHealth[] {
  const agents = options.agents ?? AGENTS
  const blocked = new Set(options.blocked ?? [])

  const byAgent = new Map<string, RunSummary[]>()
  for (const run of runs) {
    const list = byAgent.get(run.agent)
    if (list) list.push(run)
    else byAgent.set(run.agent, [run])
  }

  return agents.map((agent) => {
    const history = (byAgent.get(agent.name) ?? [])
      .slice()
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())

    const finished = history.filter((r) => r.status !== 'running')
    const inFlight = history.some((r) => r.status === 'running')

    let consecutiveFailures = 0
    for (const run of finished) {
      if (run.status !== 'error') break
      consecutiveFailures += 1
    }

    const lastRunAt = history[0]?.startedAt ?? null
    const build = (status: AgentHealth['status'], reason: string): AgentHealth => ({
      agent: agent.name,
      status,
      light: LIGHT_BY_STATUS[status],
      lastRunAt,
      consecutiveFailures,
      reason,
    })

    if (consecutiveFailures >= FAILURE_STREAK_FOR_RED) {
      return build('error', `${consecutiveFailures} consecutive failed runs`)
    }
    if (inFlight) return build('running', 'a run is in flight')
    if (blocked.has(agent.name)) return build('blocked', 'held by a spend cap or the pause switch')

    // Event-driven agents are not overdue just because nothing triggered them.
    if (agent.intervalMinutes !== undefined) {
      const limit = agent.intervalMinutes * STALE_INTERVAL_MULTIPLIER
      if (lastRunAt === null) {
        return build('stale', 'has never run')
      }
      const age = minutesSince(lastRunAt, now)
      if (age > limit) {
        return build(
          'stale',
          `last run ${Math.round(age)} minutes ago, over the ${Math.round(limit)} minute limit`,
        )
      }
    }

    if (lastRunAt === null) return build('idle', 'waiting for its first trigger')
    return build('idle', 'healthy')
  })
}

/** Agents whose status warrants emailing the operator. */
export function needsOperatorAlert(health: readonly AgentHealth[]): AgentHealth[] {
  return health.filter((h) => h.status === 'error')
}
