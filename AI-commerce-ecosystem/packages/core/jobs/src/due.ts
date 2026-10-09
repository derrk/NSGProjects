/**
 * Which scheduled agents are due on this tick.
 *
 * `scheduler.tick` runs every 5 minutes and asks this. Keeping the decision in a pure
 * function means the awkward cases — an agent that has never run, one whose schedule
 * just changed, one that is mid-run — are unit tested rather than discovered in
 * production at 6am.
 */

import { intervalMinutes, isEventDriven } from '@acf/core/health'

export interface ScheduledAgent {
  id: string
  divisionId: string
  name: string
  schedule: string | null
  lastRunAt: Date | null
}

export interface DueOptions {
  /** Agents already queued or running; they must not be queued twice. */
  busyAgentIds?: ReadonlySet<string> | readonly string[]
  /** Divisions that are paused or closed. */
  pausedDivisionIds?: ReadonlySet<string> | readonly string[]
  /**
   * How early an agent may fire. The tick is every 5 minutes, so without a little
   * tolerance an hourly agent drifts later by up to 5 minutes every hour and ends up
   * firing 23 times a day instead of 24.
   */
  toleranceMinutes?: number
}

export interface DueAgent {
  agent: ScheduledAgent
  reason: string
}

const DEFAULT_TOLERANCE = 1

export function dueAgents(
  agents: readonly ScheduledAgent[],
  now: Date,
  options: DueOptions = {},
): DueAgent[] {
  const busy = new Set(options.busyAgentIds ?? [])
  const paused = new Set(options.pausedDivisionIds ?? [])
  const tolerance = options.toleranceMinutes ?? DEFAULT_TOLERANCE

  const due: DueAgent[] = []

  for (const agent of agents) {
    // Event-driven agents are triggered by the event, never by the clock.
    if (isEventDriven(agent.schedule)) continue

    const interval = intervalMinutes(agent.schedule)
    // An unreadable schedule is skipped rather than guessed at. Firing an agent on a
    // made-up cadence spends money on a guess.
    if (interval === null) continue

    if (paused.has(agent.divisionId)) continue
    // Still working on the last one. Queueing another would stack runs on an agent
    // that is already behind.
    if (busy.has(agent.id)) continue

    if (agent.lastRunAt === null) {
      due.push({ agent, reason: 'has never run' })
      continue
    }

    const elapsed = (now.getTime() - agent.lastRunAt.getTime()) / 60_000
    if (elapsed >= interval - tolerance) {
      due.push({ agent, reason: `${Math.round(elapsed)} minutes since the last run` })
    }
  }

  return due
}
