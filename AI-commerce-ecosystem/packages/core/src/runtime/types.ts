/**
 * Agent run wrapper domain types (SPEC.md §Agent run contract).
 *
 * The wrapper owns everything an agent should not have to think about: the
 * `agent_runs` row, retries with backoff, output validation, token/cost accounting and
 * the terminal event. Agents just implement `run(ctx)`.
 */

import type { Actor, ApprovalKind, ApprovalOutcome, Clock, EventSink } from '../approvals/types.js'

export type Trigger = 'cron' | 'event' | 'manual'
export type RunStatus = 'running' | 'ok' | 'error'

export interface AgentRunRecord {
  id: string
  agent: string
  shopId: string | null
  trigger: Trigger
  status: RunStatus
  startedAt: Date
  finishedAt: Date | null
  input: unknown
  output: unknown | null
  tokensIn: number
  tokensOut: number
  costCents: number
  /** How many times `run` was invoked, including the successful one. */
  attempts: number
  error: string | null
}

export interface AgentRunStore {
  start(record: Omit<AgentRunRecord, 'id'>): Promise<AgentRunRecord>
  finish(id: string, patch: Partial<AgentRunRecord>): Promise<AgentRunRecord>
}

export interface Sleeper {
  sleep(ms: number): Promise<void>
}

/**
 * Token usage from one model call. Mirrors the Anthropic SDK's `response.usage` so a
 * caller can hand it straight through.
 */
export interface TokenUsage {
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
}

/**
 * Structural validator interface. Any Zod schema satisfies this in both v3 and v4, so
 * `packages/core` does not pin a Zod major for its consumers.
 */
export interface OutputValidator<T> {
  parse(value: unknown): T
}

export interface AgentContext<TInput> {
  readonly runId: string
  readonly agent: string
  readonly shopId: string | null
  readonly input: TInput
  /** 1-based. An agent can use this to simplify its approach on later tries. */
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
    kind: ApprovalKind
    category: string
    refId: string
    summary: string
    payload: unknown
    shopId?: string | null
  }): Promise<ApprovalOutcome>
  /** Report model usage so the wrapper can bill it to this run. Call once per API call. */
  recordUsage(usage: TokenUsage): void
}

export interface AgentDefinition<TInput, TOutput> {
  name: string
  /** Zod schema for the agent's structured output. A parse failure triggers a retry. */
  outputSchema: OutputValidator<TOutput>
  run(ctx: AgentContext<TInput>): Promise<TOutput>
  /**
   * Total attempts including the first. Defaults to 4, i.e. the initial call plus the
   * "up to 3 retries" the spec calls for.
   */
  maxAttempts?: number
}

/**
 * Thrown by an agent (or the wrapper) when retrying cannot possibly help: bad
 * credentials, a malformed request, a business-rule violation. The wrapper fails the
 * run immediately instead of burning three more model calls.
 */
export class NonRetriableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'NonRetriableError'
  }
}

/** Raised when the agent's output does not match its schema. Retriable. */
export class OutputValidationError extends Error {
  constructor(
    readonly agent: string,
    readonly detail: string,
  ) {
    super(`${agent} returned output that failed schema validation: ${detail}`)
    this.name = 'OutputValidationError'
  }
}

/** Raised when every attempt failed. Carries the last underlying error. */
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

export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

/** A hook the wrapper consults before spending money (SPEC.md §Operational guardrails). */
export interface SpendGuard {
  /** Return a reason to block, or null to allow the run. */
  check(agent: string): Promise<string | null>
}

/** Raised when a daily spend cap or the global pause switch blocks a run. */
export class RunBlockedError extends Error {
  constructor(
    readonly agent: string,
    readonly reason: string,
  ) {
    super(`${agent} run blocked: ${reason}`)
    this.name = 'RunBlockedError'
  }
}

export interface BackoffOptions {
  /** Delay before the first retry, in ms. Doubles each attempt. */
  baseMs?: number
  maxMs?: number
  /** Fraction of the delay that is randomised, to avoid thundering herds. 0 disables. */
  jitter?: number
}

export interface RunAgentDeps {
  runs: AgentRunStore
  events: EventSink
  clock: Clock
  sleeper: Sleeper
  /** Injected so jitter is deterministic under test. */
  random?: () => number
  spendGuard?: SpendGuard
  backoff?: BackoffOptions
  requestApproval: AgentContext<unknown>['requestApproval']
  actor?: Actor
}
