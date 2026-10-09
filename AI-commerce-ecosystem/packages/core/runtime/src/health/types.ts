/**
 * Station health (SPEC.md §Orchestrator → health.heartbeat).
 *
 * Status is derived here, server-side, from the agent registry; the floor renders
 * exactly what this says and the client never guesses.
 */

export type StationStatus =
  /** A run is in flight right now. */
  | 'running'
  /** Healthy and waiting for its next trigger. */
  | 'idle'
  /** Overdue: no run for more than twice its interval. */
  | 'stale'
  /** Held back by a spend cap or a paused division. */
  | 'blocked'
  /** Three consecutive failed runs. */
  | 'error'

export type StationLight = 'green' | 'amber' | 'red'

export const LIGHT_BY_STATUS: Record<StationStatus, StationLight> = {
  running: 'green',
  idle: 'green',
  stale: 'amber',
  blocked: 'amber',
  error: 'red',
}

/** The subset of an `agents` row the assessment needs. */
export interface AgentDescriptor {
  id: string
  name: string
  divisionId: string
  /** Cron expression, `event:<name>`, or null for manual-only. */
  schedule?: string | null
  status?: 'active' | 'paused' | 'retired'
}

/** The subset of an `agent_runs` row the assessment needs. */
export interface RunSummary {
  agentId: string
  status: 'running' | 'ok' | 'error'
  startedAt: Date
  finishedAt: Date | null
}

export interface AgentHealth {
  agentId: string
  agent: string
  divisionId: string
  status: StationStatus
  light: StationLight
  lastRunAt: Date | null
  /** How many of the most recent finished runs failed in a row. */
  consecutiveFailures: number
  /** Expected minutes between runs, or null for an event-driven agent. */
  intervalMinutes: number | null
  /** Human-readable explanation for the station drawer. */
  reason: string
}

/** Three failures in a row turns the station red and emails the operator. */
export const FAILURE_STREAK_FOR_RED = 3

/** An agent is stale once it has gone this many times its interval without a run. */
export const STALE_INTERVAL_MULTIPLIER = 2
