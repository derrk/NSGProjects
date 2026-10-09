/**
 * The agent run loop (SPEC.md §Agent framework).
 *
 * Load the agent, its division, its goals and its memories; run it; validate; write
 * the output to the task, the memories to agent_memory, the cost to the ledger, and a
 * terminal event. A module supplies only `run(ctx)`.
 */

import { costCentsFor, inputTokensOf, isKnownModel } from './pricing'
import {
  AgentRunFailedError,
  DEFAULT_LESSON_RECALL,
  DEFAULT_MEMORY_RECALL,
  MAX_MEMORIES_PER_RUN,
  NonRetriableError,
  OutputValidationError,
  RunBlockedError,
  describeError,
  type AgentContext,
  type AgentDefinition,
  type AgentRecord,
  type BackoffOptions,
  type DivisionRecord,
  type GoalRecord,
  type MemoryEntry,
  type RecalledMemory,
  type RunLoopDeps,
  type TaskRecord,
  type TokenUsage,
  type ToolCallRecord,
} from './types'

export interface RunAgentInput<TInput> {
  agent: AgentRecord
  division: DivisionRecord
  task?: TaskRecord | null
  input: TInput
  goals?: readonly GoalRecord[]
  trigger?: TaskRecord['source']
}

export interface RunOptions {
  backoff?: BackoffOptions
  maxAttempts?: number
  /** Skip memory recall, e.g. for a one-off operator run. */
  skipMemory?: boolean
}

const DEFAULT_MAX_ATTEMPTS = 4
const DEFAULT_BACKOFF: Required<BackoffOptions> = { baseMs: 1_000, maxMs: 30_000, jitter: 0.2 }

/**
 * How long to wait before retry number `attempt` (1-based): exponential from `baseMs`,
 * capped at `maxMs`, then spread by `jitter`.
 */
export function backoffDelay(attempt: number, opts: BackoffOptions, random: () => number): number {
  const { baseMs, maxMs, jitter } = { ...DEFAULT_BACKOFF, ...opts }
  const nominal = Math.min(maxMs, baseMs * 2 ** (attempt - 1))
  if (jitter <= 0) return Math.round(nominal)
  // random() in [0,1) maps to a factor in [1 - jitter, 1 + jitter].
  return Math.round(nominal * (1 + jitter * (random() * 2 - 1)))
}

/**
 * Retrying only helps for failures that might not repeat. A bad request, a bad
 * credential or a business-rule violation fails identically every time.
 */
function isRetriable(err: unknown): boolean {
  return !(err instanceof NonRetriableError)
}

/** A short, stable description of the task, used as the memory-recall query. */
function recallQuery(task: TaskRecord | null, input: unknown): string {
  const parts = [task?.title ?? '']
  try {
    parts.push(JSON.stringify(input).slice(0, 500))
  } catch {
    /* input is not serialisable; the title alone will do */
  }
  return parts.filter(Boolean).join('\n')
}

export async function runAgent<TInput, TOutput>(
  definition: AgentDefinition<TInput, TOutput>,
  request: RunAgentInput<TInput>,
  deps: RunLoopDeps,
  options: RunOptions = {},
): Promise<TOutput> {
  const { agent, division, input } = request
  const task = request.task ?? null
  const goals = request.goals ?? []
  const trigger = request.trigger ?? task?.source ?? 'operator'

  // The spend cap and the pause switch are checked before anything is recorded: a run
  // that never started should not clutter the agent's history.
  if (deps.spendGuard) {
    const blocked = await deps.spendGuard.check(division.id)
    if (blocked) {
      await deps.events.emit({
        divisionId: division.id,
        agentId: agent.id,
        station: agent.moduleAgentKey,
        kind: 'agent.blocked',
        level: 'warn',
        message: `run blocked: ${blocked}`,
      })
      throw new RunBlockedError(agent.name, blocked)
    }
  }

  const maxAttempts = options.maxAttempts ?? definition.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const backoff = { ...DEFAULT_BACKOFF, ...deps.backoff, ...options.backoff }
  const random = deps.random ?? Math.random

  let memories: RecalledMemory[] = []
  if (deps.memory && !options.skipMemory) {
    memories = await deps.memory.recall({
      agentId: agent.id,
      divisionId: division.id,
      query: recallQuery(task, input),
      limit: DEFAULT_MEMORY_RECALL,
      lessonLimit: DEFAULT_LESSON_RECALL,
    })
  }

  const run = await deps.runs.start({
    agentId: agent.id,
    taskId: task?.id ?? null,
    divisionId: division.id,
    status: 'running',
    startedAt: deps.clock.now(),
    finishedAt: null,
    input,
    output: null,
    toolCalls: [],
    tokensIn: 0,
    tokensOut: 0,
    costCents: 0,
    attempts: 0,
    error: null,
  })

  const usages: TokenUsage[] = []
  const toolCalls: ToolCallRecord[] = []
  const remembered: MemoryEntry[] = []
  let attempts = 0
  let lastError: unknown

  const settle = async () => {
    const tokensIn = usages.reduce((sum, u) => sum + inputTokensOf(u), 0)
    const tokensOut = usages.reduce((sum, u) => sum + u.outputTokens, 0)
    const costCents = usages.reduce((sum, u) => sum + costCentsFor(u), 0)

    // Reported once per run rather than per call, so `recordUsage` can stay sync.
    const unknown = [...new Set(usages.filter((u) => !isKnownModel(u.model)).map((u) => u.model))]
    for (const model of unknown) {
      await deps.events.emit({
        divisionId: division.id,
        agentId: agent.id,
        kind: 'agent.unknown_model',
        level: 'warn',
        message: `no pricing for model "${model}" — this run's cost is understated`,
        refTable: 'agent_runs',
        refId: run.id,
      })
    }

    // API spend is posted to the ledger, not merely counted, so the Company screen and
    // the per-division cap read the same number. Negative: a cost reduces the company.
    if (deps.ledger && costCents > 0) {
      await deps.ledger.post({
        divisionId: division.id,
        kind: 'api_cost',
        amountCents: -costCents,
        source: `agent:${agent.name}`,
        description: `${agent.name} run`,
        refTable: 'agent_runs',
        refId: run.id,
      })
    }

    // The most important memories win, so a chatty agent cannot flood its own context.
    if (deps.memory && remembered.length > 0) {
      const entries = [...remembered]
        .sort((a, b) => b.importance - a.importance)
        .slice(0, MAX_MEMORIES_PER_RUN)
      await deps.memory.write({
        agentId: agent.id,
        divisionId: division.id,
        taskId: task?.id ?? null,
        entries,
      })
    }

    return { tokensIn, tokensOut, costCents }
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt

    const ctx: AgentContext<TInput> = {
      runId: run.id,
      agent,
      division,
      task,
      input,
      goals,
      memories,
      attempt,
      maxAttempts,
      ...(lastError === undefined ? {} : { previousError: describeError(lastError) }),

      log: (kind, message, opts = {}) =>
        deps.events.emit({
          divisionId: division.id,
          agentId: agent.id,
          station: agent.moduleAgentKey,
          kind,
          level: opts.level ?? 'info',
          message,
          ...(opts.refTable === undefined ? {} : { refTable: opts.refTable }),
          ...(opts.refId === undefined ? {} : { refId: opts.refId }),
        }),

      requestApproval: (req) =>
        deps.requestApproval({
          ...req,
          divisionId: division.id,
          taskId: task?.id ?? null,
          requestedBy: `agent:${agent.id}`,
        } as Parameters<RunLoopDeps['requestApproval']>[0]),

      recordUsage: (usage) => {
        usages.push(usage)
      },
      recordToolCall: (call) => {
        toolCalls.push(call)
      },
      remember: (entry) => {
        remembered.push(entry)
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
        throw new OutputValidationError(agent.name, describeError(err))
      }

      const totals = await settle()
      await deps.runs.finish(run.id, {
        status: 'ok',
        finishedAt: deps.clock.now(),
        output,
        toolCalls,
        attempts,
        error: null,
        ...totals,
      })
      if (task && deps.tasks) await deps.tasks.complete(task.id, output)

      await deps.events.emit({
        divisionId: division.id,
        agentId: agent.id,
        station: agent.moduleAgentKey,
        kind: 'agent.run_ok',
        level: 'info',
        message: `${agent.name} finished in ${attempts} attempt(s), ${totals.costCents.toFixed(2)}c`,
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
        divisionId: division.id,
        agentId: agent.id,
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
    toolCalls,
    attempts,
    error: describeError(lastError),
    ...totals,
  })
  if (task && deps.tasks) await deps.tasks.fail(task.id, describeError(lastError))

  await deps.events.emit({
    divisionId: division.id,
    agentId: agent.id,
    station: agent.moduleAgentKey,
    kind: 'agent.run_error',
    level: 'error',
    message: `${agent.name} failed after ${attempts} attempt(s): ${describeError(lastError)}`,
    refTable: 'agent_runs',
    refId: run.id,
  })

  throw new AgentRunFailedError(agent.name, attempts, lastError)
}
