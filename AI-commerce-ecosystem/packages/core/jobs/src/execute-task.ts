/**
 * Running one task.
 *
 * Extracted from the Inngest function so the same code path serves both the queue and
 * the operator's "Run now" button. Two implementations of "run an agent" would drift,
 * and the one that drifted would be the one the operator uses to debug the other.
 */

import { requestApproval } from '@acf/core/approvals'
import type { ApprovalOutcome } from '@acf/core/approvals'
import { runAgent } from '@acf/core/runtime'
import type { AgentDefinition, TaskRecord } from '@acf/core/runtime'
import type { Database } from '@acf/db'
import type { Inngest } from 'inngest'

import {
  agentRunStore,
  approvalStore,
  claimTask,
  eventBus,
  eventSink,
  ledgerPort,
  loadRunContext,
  newId,
  realSleeper,
  ruleStore,
  spendGuard,
  stampAgentRun,
  systemClock,
  taskGate,
  taskStore,
} from './adapters'
import { memoryStore } from './memory'
import type { AgentResolver } from './functions/types'

export type ExecuteTaskResult =
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string }
  | { status: 'ok'; agent: string; output: unknown }

export interface ExecuteTaskDeps {
  db: Database
  resolveAgent: AgentResolver
  /** Where `<kind>.approved` and friends are published. */
  bus: Inngest.Any
}

export async function executeTask(
  taskId: string,
  deps: ExecuteTaskDeps,
): Promise<ExecuteTaskResult> {
  const { db, resolveAgent } = deps

  // Claiming is the lock. Two workers racing the same redelivered event both issue
  // this; exactly one gets a row and the other stops here.
  const claimed = await claimTask(db, taskId)
  if (!claimed) return { status: 'skipped', reason: 'task is not claimable' }

  const tasks = taskStore(db)

  if (!claimed.agentId) {
    await tasks.fail(taskId, 'task has no agent assigned')
    return { status: 'failed', reason: 'task has no agent assigned' }
  }

  const context = await loadRunContext(db, claimed.agentId)
  if (!context) {
    await tasks.fail(taskId, 'agent or division no longer exists')
    return { status: 'failed', reason: 'agent or division no longer exists' }
  }

  const { agent, division, goals } = context

  const definition = resolveAgent(division.type, agent.moduleAgentKey)
  if (!definition) {
    // A declared-but-unimplemented agent. Fail loudly rather than silently dropping
    // work the operator believes is queued.
    const reason = `module "${division.type}" has no runner for agent key "${agent.moduleAgentKey}"`
    await tasks.fail(taskId, reason)
    return { status: 'failed', reason }
  }

  const gate = {
    approvals: approvalStore(db),
    rules: ruleStore(db),
    events: eventSink(db),
    bus: eventBus(deps.bus, eventSink(db)),
    tasks: taskGate(db),
    spendGuard: spendGuard(db),
    clock: systemClock,
    newId,
  }

  const task: TaskRecord = {
    id: claimed.id,
    divisionId: claimed.divisionId,
    agentId: claimed.agentId,
    title: claimed.title,
    input: claimed.input,
    source: claimed.source,
  }

  try {
    const output = await runAgent(
      definition as AgentDefinition<unknown, unknown>,
      {
        agent: {
          id: agent.id,
          divisionId: agent.divisionId,
          name: agent.name,
          description: agent.description,
          purpose: agent.purpose,
          moduleAgentKey: agent.moduleAgentKey,
          model: agent.model,
          systemPrompt: agent.systemPrompt,
          tools: agent.tools,
          autonomy: agent.autonomy,
          maxSteps: agent.maxSteps,
          crossDivision: agent.crossDivision,
        },
        division: {
          id: division.id,
          name: division.name,
          type: division.type,
          goalSummary: division.goalSummary,
          config: division.config,
        },
        task,
        input: claimed.input,
        goals: goals.map((g) => ({
          id: g.id,
          statement: g.statement,
          metric: g.metric,
          target: g.target,
          current: g.current,
          deadline: g.deadline,
        })),
      },
      {
        runs: agentRunStore(db),
        events: eventSink(db),
        clock: systemClock,
        sleeper: realSleeper,
        memory: memoryStore(db),
        ledger: ledgerPort(db),
        tasks,
        spendGuard: spendGuard(db),
        requestApproval: (req) => requestApproval(req as never, gate) as Promise<ApprovalOutcome>,
      },
    )

    await stampAgentRun(db, agent.id)
    return { status: 'ok', agent: agent.name, output }
  } catch (err) {
    // runAgent has already written the error to the run row, the task and the event
    // log. Returning rather than rethrowing keeps "Run now" from showing the operator
    // a stack trace for a failure that is already recorded and visible.
    await stampAgentRun(db, agent.id)
    return {
      status: 'failed',
      reason: err instanceof Error ? err.message : String(err),
    }
  }
}
