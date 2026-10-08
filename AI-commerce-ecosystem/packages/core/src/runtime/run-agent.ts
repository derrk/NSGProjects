/**
 * The agent run wrapper (SPEC.md §Agent run contract).
 *
 * Every agent invocation goes through here. The wrapper owns the `agent_runs` row,
 * retries with backoff, output validation, token/cost accounting and the terminal
 * event, so an agent only has to implement `run(ctx)` and return valid JSON.
 */

import { costCentsFor, inputTokensOf, isKnownModel } from './pricing.js'
import {
  AgentRunFailedError,
  NonRetriableError,
  OutputValidationError,
  RunBlockedError,
  describeError,
  type AgentContext,
  type AgentDefinition,
  type BackoffOptions,
  type RunAgentDeps,
  type TokenUsage,
  type Trigger,
} from './types.js'

export interface RunOptions {
  shopId?: string | null
  backoff?: BackoffOptions
  /** Overrides the agent's own `maxAttempts` for this invocation. */
  maxAttempts?: number
}

const DEFAULT_MAX_ATTEMPTS = 4
const DEFAULT_BACKOFF: Required<BackoffOptions> = { baseMs: 1_000, maxMs: 30_000, jitter: 0.2 }

/**
 * How long to wait before retry number `attempt` (1-based): exponential from `baseMs`,
 * capped at `maxMs`, then spread by `jitter` so retrying agents do not sync up.
 */
export function backoffDelay(attempt: number, opts: BackoffOptions, random: () => number): number {
  const { baseMs, maxMs, jitter } = { ...DEFAULT_BACKOFF, ...opts }
  const nominal = Math.min(maxMs, baseMs * 2 ** (attempt - 1))
  if (jitter <= 0) return Math.round(nominal)
  // random() in [0,1) maps to a factor in [1 - jitter, 1 + jitter].
  return Math.round(nominal * (1 + jitter * (random() * 2 - 1)))
}

/**
 * Retrying only helps for failures that might not happen again. A bad request, a bad
 * credential or a business-rule violation will fail identically every time, so those
 * are raised as `NonRetriableError` and abandoned on the first attempt.
 */
function isRetriable(err: unknown): boolean {
  return !(err instanceof NonRetriableError)
}

export async function runAgent<TInput, TOutput>(
  definition: AgentDefinition<TInput, TOutput>,
  input: TInput,
  trigger: Trigger,
  deps: RunAgentDeps,
  options: RunOptions = {},
): Promise<TOutput> {
  const { name } = definition
  const shopId = options.shopId ?? null

  // Spend caps and the pause switch are checked before anything is recorded: a run
  // that never started should not clutter the agent's run history.
  if (deps.spendGuard) {
    const blocked = await deps.spendGuard.check(name)
    if (blocked) {
      await deps.events.emit({
        agent: name,
        kind: 'agent.blocked',
        level: 'warn',
        message: `run blocked: ${blocked}`,
      })
      throw new RunBlockedError(name, blocked)
    }
  }

  const maxAttempts = options.maxAttempts ?? definition.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const backoff = { ...DEFAULT_BACKOFF, ...deps.backoff, ...options.backoff }
  const random = deps.random ?? Math.random

  const run = await deps.runs.start({
    agent: name,
    shopId,
    trigger,
    status: 'running',
    startedAt: deps.clock.now(),
    finishedAt: null,
    input,
    output: null,
    tokensIn: 0,
    tokensOut: 0,
    costCents: 0,
    attempts: 0,
    error: null,
  })

  const usages: TokenUsage[] = []
  let attempts = 0
  let lastError: unknown

  const settle = async () => {
    const tokensIn = usages.reduce((sum, u) => sum + inputTokensOf(u), 0)
    const tokensOut = usages.reduce((sum, u) => sum + u.outputTokens, 0)
    const costCents = usages.reduce((sum, u) => sum + costCentsFor(u), 0)

    // Reported once per run rather than on every call, so `recordUsage` can stay sync.
    const unknown = [...new Set(usages.filter((u) => !isKnownModel(u.model)).map((u) => u.model))]
    for (const model of unknown) {
      await deps.events.emit({
        agent: name,
        kind: 'agent.unknown_model',
        level: 'warn',
        message: `no pricing for model "${model}" — this run's cost is understated`,
        refTable: 'agent_runs',
        refId: run.id,
      })
    }

    return { tokensIn, tokensOut, costCents }
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt

    const ctx: AgentContext<TInput> = {
      runId: run.id,
      agent: name,
      shopId,
      input,
      attempt,
      maxAttempts,
      ...(lastError === undefined ? {} : { previousError: describeError(lastError) }),
      log: (kind, message, opts = {}) =>
        deps.events.emit({
          agent: name,
          kind,
          level: opts.level ?? 'info',
          message,
          ...(opts.refTable === undefined ? {} : { refTable: opts.refTable }),
          ...(opts.refId === undefined ? {} : { refId: opts.refId }),
        }),
      requestApproval: (req) =>
        deps.requestApproval({
          shopId,
          ...req,
          requestedBy: deps.actor ?? (`agent:${name}` as const),
        } as Parameters<RunAgentDeps['requestApproval']>[0]),
      recordUsage: (usage) => {
        usages.push(usage)
      },
    }

    try {
      const raw = await definition.run(ctx)

      let output: TOutput
      try {
        output = definition.outputSchema.parse(raw)
      } catch (err) {
        // A malformed response is a retry, not a crash: the next attempt is told what
        // was wrong and usually fixes it.
        throw new OutputValidationError(name, describeError(err))
      }

      const totals = await settle()
      await deps.runs.finish(run.id, {
        status: 'ok',
        finishedAt: deps.clock.now(),
        output,
        attempts,
        error: null,
        ...totals,
      })
      await deps.events.emit({
        agent: name,
        kind: 'agent.ok',
        level: 'info',
        message: `${name} finished in ${attempts} attempt(s), ${totals.costCents.toFixed(2)}c`,
        refTable: 'agent_runs',
        refId: run.id,
      })
      return output
    } catch (err) {
      lastError = err

      const canRetry = isRetriable(err) && attempt < maxAttempts
      if (!canRetry) break

      const delay = backoffDelay(attempt, backoff, random)
      await deps.events.emit({
        agent: name,
        kind: 'agent.retry',
        level: 'warn',
        message: `attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms: ${describeError(err)}`,
        refTable: 'agent_runs',
        refId: run.id,
      })
      await deps.sleeper.sleep(delay)
    }
  }

  const totals = await settle()
  await deps.runs.finish(run.id, {
    status: 'error',
    finishedAt: deps.clock.now(),
    output: null,
    attempts,
    error: describeError(lastError),
    ...totals,
  })
  await deps.events.emit({
    agent: name,
    kind: 'agent.error',
    level: 'error',
    message: `${name} failed after ${attempts} attempt(s): ${describeError(lastError)}`,
    refTable: 'agent_runs',
    refId: run.id,
  })

  throw new AgentRunFailedError(name, attempts, lastError)
}
