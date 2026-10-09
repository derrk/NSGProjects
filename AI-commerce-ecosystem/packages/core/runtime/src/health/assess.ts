/**
 * Derive each station's status from the agent registry and recent run history.
 *
 * Pure: no database, no clock of its own. `health.heartbeat` calls this every 15
 * minutes and writes the result.
 */

import { intervalMinutes } from './schedule'
import {
  FAILURE_STREAK_FOR_RED,
  LIGHT_BY_STATUS,
  STALE_INTERVAL_MULTIPLIER,
  type AgentDescriptor,
  type AgentHealth,
  type RunSummary,
} from './types'

export interface AssessOptions {
  /** Divisions or agents held back by a spend cap or a pause switch. */
  blockedAgents?: ReadonlySet<string> | readonly string[]
  blockedDivisions?: ReadonlySet<string> | readonly string[]
}

const MINUTE_MS = 60_000

/**
 * Status precedence: error > running > blocked > stale > idle.
 *
 * Errors outrank an in-flight run deliberately. An agent retrying after three straight
 * failures is still a red light, and showing green because something happens to be
 * executing would hide exactly the condition the operator needs to see.
 */
export function assessAgentHealth(
  agents: readonly AgentDescriptor[],
  runs: readonly RunSummary[],
  now: Date,
  options: AssessOptions = {},
): AgentHealth[] {
  const blockedAgents = new Set(options.blockedAgents ?? [])
  const blockedDivisions = new Set(options.blockedDivisions ?? [])

  const byAgent = new Map<string, RunSummary[]>()
  for (const run of runs) {
    const list = byAgent.get(run.agentId)
    if (list) list.push(run)
    else byAgent.set(run.agentId, [run])
  }

  return agents.map((agent) => {
    const history = (byAgent.get(agent.id) ?? [])
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
    const interval = intervalMinutes(agent.schedule)

    const build = (status: AgentHealth['status'], reason: string): AgentHealth => ({
      agentId: agent.id,
      agent: agent.name,
      divisionId: agent.divisionId,
      status,
      light: LIGHT_BY_STATUS[status],
      lastRunAt,
      consecutiveFailures,
      intervalMinutes: interval,
      reason,
    })

    if (consecutiveFailures >= FAILURE_STREAK_FOR_RED) {
      return build('error', `${consecutiveFailures} consecutive failed runs`)
    }
    if (inFlight) return build('running', 'a run is in flight')
    if (agent.status === 'paused') return build('blocked', 'agent is paused')
    if (blockedAgents.has(agent.id) || blockedDivisions.has(agent.divisionId)) {
      return build('blocked', 'held by a spend cap or a paused division')
    }

    // An event-driven agent is not overdue just because nothing triggered it.
    if (interval !== null) {
      const limit = interval * STALE_INTERVAL_MULTIPLIER
      if (lastRunAt === null) return build('stale', 'has never run')
      const age = (now.getTime() - lastRunAt.getTime()) / MINUTE_MS
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
