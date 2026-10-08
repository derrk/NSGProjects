/**
 * Station health (SPEC.md §Orchestrator, `health.heartbeat`).
 *
 * Status is derived here, server-side, and never guessed by the client — the factory
 * floor renders what this says.
 */

export type StationStatus =
  /** A run is in flight right now. */
  | 'running'
  /** Healthy and waiting for its next trigger. */
  | 'idle'
  /** Overdue: no run for more than twice its interval. */
  | 'stale'
  /** Held back by a spend cap or the global pause switch. */
  | 'blocked'
  /** Three consecutive failed runs. */
  | 'error'

/** What the station light shows. */
export type StationLight = 'green' | 'amber' | 'red'

export const LIGHT_BY_STATUS: Record<StationStatus, StationLight> = {
  running: 'green',
  idle: 'green',
  stale: 'amber',
  blocked: 'amber',
  error: 'red',
}

export interface AgentDescriptor {
  name: string
  /**
   * Minutes between scheduled runs. Omitted for event-driven agents (Designer, Store
   * ops), which are not overdue just because nothing has triggered them.
   */
  intervalMinutes?: number
}

/** The agent roster and their cadences, from the schedule table in SPEC.md. */
export const AGENTS: readonly AgentDescriptor[] = [
  { name: 'scout', intervalMinutes: 24 * 60 },
  { name: 'strategist', intervalMinutes: 7 * 24 * 60 },
  { name: 'designer' },
  { name: 'store' },
  { name: 'orders', intervalMinutes: 60 },
  { name: 'support', intervalMinutes: 30 },
  { name: 'finance', intervalMinutes: 24 * 60 },
]

/** The minimum an assessment needs to know about a past run. */
export interface RunSummary {
  agent: string
  status: 'running' | 'ok' | 'error'
  startedAt: Date
  finishedAt: Date | null
}

export interface AgentHealth {
  agent: string
  status: StationStatus
  light: StationLight
  lastRunAt: Date | null
  /** How many of the most recent finished runs failed in a row. */
  consecutiveFailures: number
  /** Human-readable explanation for the drawer. */
  reason: string
}

/** Three failures in a row turns the station red and emails the operator. */
export const FAILURE_STREAK_FOR_RED = 3

/** An agent is stale once it has gone this many times its interval without a run. */
export const STALE_INTERVAL_MULTIPLIER = 2
