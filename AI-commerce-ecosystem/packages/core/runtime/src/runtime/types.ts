/**
 * The agent run loop (SPEC.md §Agent framework → The run loop).
 *
 * The runtime owns everything an agent should not have to think about: loading its
 * row, its division's goals and its memories; the `agent_runs` record; retries with
 * backoff; output validation; token and cost accounting posted to the ledger; writing
 * back what the agent chose to remember; and the terminal event.
 *
 * A module supplies only a `run(ctx)` function.
 */

import type { ApprovalOutcome, Clock, EventSink } from '../approvals/types'

export type Trigger = 'schedule' | 'event' | 'operator' | 'agent'
export type RunStatus = 'running' | 'ok' | 'error'
export type Autonomy = 'propose' | 'act_with_approval' | 'auto'
export type MemoryKind = 'decision' | 'result' | 'lesson' | 'fact'

/** The `agents` row. Everything about who this agent is lives in the database. */
export interface AgentRecord {
  id: string
  divisionId: string
  name: string
  description?: string | null
  /** Shown on the station and injected into every prompt. */
  purpose?: string | null
  moduleAgentKey: string
  model: string
  systemPrompt: string
  tools: string[]
  autonomy: Autonomy
  maxSteps: number
  crossDivision?: boolean
}

/** The `tasks` row being worked. */
export interface TaskRecord {
  id: string
  divisionId: string
  agentId: string | null
  title: string
  input: unknown
  source: Trigger
}

export interface DivisionRecord {
  id: string
  name: string
  type: string
  goalSummary?: string | null
  config?: unknown
}

/** A goal the agent is being measured against, with where it currently stands. */
export interface GoalRecord {
  id: string
  statement: string
  metric?: string | null
  target?: number | null
  current: number
  deadline?: Date | null
}

export interface MemoryEntry {
  kind: MemoryKind
  content: string
  /** 0-1. The weekly prune drops anything below 0.2 older than 60 days. */
  importance: number
  pinned?: boolean
}

export interface RecalledMemory extends MemoryEntry {
  id: string
  createdAt: Date
}

export interface MemoryStore {
  /**
   * The top entries by similarity to the task, PLUS the most recent lessons and every
   * pinned entry regardless of similarity — a lesson is worth loading even when it
   * does not resemble today's work.
   */
  recall(input: {
    agentId: string
    divisionId: string
    query: string
    limit: number
    lessonLimit: number
  }): Promise<RecalledMemory[]>

  write(input: {
    agentId: string
    divisionId: string
    taskId: string | null
    entries: MemoryEntry[]
  }): Promise<void>
}

/** Append-only accounting. API spend is posted here, not just counted. */
export interface LedgerPort {
  post(entry: {
    divisionId: string
    kind: 'api_cost'
    /** Signed by effect: a cost is NEGATIVE. */
    amountCents: number
    source: string
    description?: string
    refTable?: string
    refId?: string
  }): Promise<void>
}

export interface AgentRunRecord {
  id: string
  agentId: string | null
  taskId: string | null
  divisionId: string
  status: RunStatus
  startedAt: Date
  finishedAt: Date | null
  input: unknown
  output: unknown | null
  toolCalls: unknown[]
  tokensIn: number
  tokensOut: number
  costCents: number
  attempts: number
  error: string | null
}

export interface AgentRunStore {
  start(record: Omit<AgentRunRecord, 'id'>): Promise<AgentRunRecord>
  finish(id: string, patch: Partial<AgentRunRecord>): Promise<AgentRunRecord>
}

export interface TaskStore {
  /** Record the agent's output and close the task. */
  complete(taskId: string, output: unknown): Promise<void>
  fail(taskId: string, error: string): Promise<void>
}

export interface Sleeper {
  sleep(ms: number): Promise<void>
}

/** Mirrors the Anthropic SDK's `response.usage` so a caller can pass it straight on. */
export interface TokenUsage {
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
}

/** A tool call, recorded for the run history. Bodies over 2 KB are truncated. */
export interface ToolCallRecord {
  name: string
  args: unknown
  ok: boolean
  durationMs?: number
  error?: string
}

/**
 * Structural validator. Any Zod schema satisfies this in both v3 and v4, so the
 * runtime does not pin a Zod major for its consumers.
 */
export interface OutputValidator<T> {
  parse(value: unknown): T
}

export interface AgentContext<TInput> {
  readonly runId: string
  readonly agent: AgentRecord
  readonly division: DivisionRecord
  readonly task: TaskRecord | null
  readonly input: TInput
  /** Active goals for this division and this agent, with current vs target. */
  readonly goals: readonly GoalRecord[]
  /** Pinned entries plus what was recalled for this task. */
  readonly memories: readonly RecalledMemory[]
  /** 1-based. An agent can simplify its approach on later tries. */
  readonly attempt: number
  readonly maxAttempts: number
  /**
   * Why the previous attempt failed, when there was one. Output-validation failures
   * land here, which lets an agent correct its own malformed JSON on the retry.
   */
  readonly previousError?: string

  log(
    kind: string,
    message: string,
    opts?: { level?: 'info' | 'warn' | 'error'; refTable?: string; refId?: string },
  ): Promise<void>

  requestApproval(input: {
    kind: string
    category: string
    refTable: string
    refId: string
    summary: string
    payload: unknown
  }): Promise<ApprovalOutcome>

  /** Report model usage so the runtime can bill this run. Call once per API call. */
  recordUsage(usage: TokenUsage): void

  /** Record a tool call for the run history. */
  recordToolCall(call: ToolCallRecord): void

  /**
   * Keep something for next time. At most `MAX_MEMORIES_PER_RUN` are written; beyond
   * that the most important win, so an agent cannot flood its own context.
   */
  remember(entry: MemoryEntry): void
}

export interface AgentDefinition<TInput, TOutput> {
  /** Matches `agents.module_agent_key`. */
  key: string
  outputSchema: OutputValidator<TOutput>
  run(ctx: AgentContext<TInput>): Promise<TOutput>
  /** Total attempts including the first. Defaults to 4: the initial call plus 3 retries. */
  maxAttempts?: number
}

/** Retrying cannot help: a bad credential, a bad id, a business-rule violation. */
export class NonRetriableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'NonRetriableError'
  }
}

export class OutputValidationError extends Error {
  constructor(
    readonly agent: string,
    readonly detail: string,
  ) {
    super(`${agent} returned output that failed schema validation: ${detail}`)
    this.name = 'OutputValidationError'
  }
}

export class AgentRunFailedError extends Error {
  constructor(
    readonly agent: string,
    readonly attempts: number,
    readonly last: unknown,
  ) {
    super(`${agent} failed after ${attempts} attempt(s): ${describeError(last)}`)
    this.name = 'AgentRunFailedError'
  }
}

export class RunBlockedError extends Error {
  constructor(
    readonly agent: string,
    readonly reason: string,
  ) {
    super(`${agent} run blocked: ${reason}`)
    this.name = 'RunBlockedError'
  }
}

export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

/** Consulted before a run spends anything (SPEC.md §Operator control surface). */
export interface SpendGuard {
  check(divisionId: string): Promise<string | null>
}

export interface BackoffOptions {
  baseMs?: number
  maxMs?: number
  /** Fraction of the delay that is randomised, so retrying agents do not sync up. */
  jitter?: number
}

/** SPEC.md: the runtime asks for up to five memory entries after each run. */
export const MAX_MEMORIES_PER_RUN = 5
export const DEFAULT_MEMORY_RECALL = 8
export const DEFAULT_LESSON_RECALL = 3

export interface RunLoopDeps {
  runs: AgentRunStore
  events: EventSink
  clock: Clock
  sleeper: Sleeper
  requestApproval: AgentContext<unknown>['requestApproval']
  memory?: MemoryStore
  ledger?: LedgerPort
  tasks?: TaskStore
  spendGuard?: SpendGuard
  /** Injected so jitter is deterministic under test. */
  random?: () => number
  backoff?: BackoffOptions
}
