import { requestApproval } from '@acf/core/approvals'
import type { ApprovalOutcome } from '@acf/core/approvals'
import { runAgent } from '@acf/core/runtime'
import type { AgentDefinition, TaskRecord } from '@acf/core/runtime'
import { db } from '@acf/db'
import { NonRetriableError } from 'inngest'

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
} from '../adapters'
import { inngest } from '../client'
import { memoryStore } from '../memory'
import type { AgentResolver } from './types'

/**
 * `task.run` — the one job that runs every agent in every division.
 *
 * Claims the task, loads the agent's row, division and goals, runs the loop, and
 * writes the output. No module defines a runner; the agent's `module_agent_key` is
 * resolved to a function by the composition root, which is the only place that knows
 * both core and modules.
 */
export function createTaskRunner(resolveAgent: AgentResolver) {
  return inngest.createFunction(
    {
      id: 'task-run',
      triggers: [{ event: 'task.created' }, { event: 'task.retry' }],
      // The run loop already retries the AGENT with backoff. These retries are for
      // infrastructure faults — a dropped connection before the loop starts. They are
      // safe to repeat because claiming is atomic: a retry of an already-claimed task
      // simply finds nothing to do.
      retries: 2,
      onFailure: async ({ event }) => {
        // Belt and braces: if the function itself died, do not leave the task
        // `running` forever. A stale claim would eventually free it anyway, but an
        // operator should see `failed` rather than a task that looks busy for hours.
        const taskId = (event.data as { event?: { data?: { taskId?: string } } }).event?.data
          ?.taskId
        if (typeof taskId === 'string') {
          await taskStore(db()).fail(taskId, 'the task runner crashed')
        }
      },
    },
    async ({ event }) => {
      const { taskId } = event.data as { taskId: string }

      // Claim outside a step: step results are memoized, so a replayed step would
      // report a successful claim it never actually made.
      const claimed = await claimTask(db(), taskId)
      if (!claimed) {
        // Someone else has it, or it is blocked, done or failed. Not an error.
        return { skipped: true, reason: 'not claimable' }
      }

      if (!claimed.agentId) {
        await taskStore(db()).fail(taskId, 'task has no agent assigned')
        throw new NonRetriableError(`task ${taskId} has no agent assigned`)
      }

      const context = await loadRunContext(db(), claimed.agentId)
      if (!context) {
        await taskStore(db()).fail(taskId, 'agent or division no longer exists')
        throw new NonRetriableError(`agent ${claimed.agentId} or its division is gone`)
      }

      const { agent, division, goals } = context

      const definition = resolveAgent(division.type, agent.moduleAgentKey)
      if (!definition) {
        // A declared-but-unimplemented agent. Fail the task loudly rather than
        // silently dropping work the operator thinks is queued.
        await taskStore(db()).fail(taskId, `no runner for agent key "${agent.moduleAgentKey}"`)
        throw new NonRetriableError(
          `module "${division.type}" has no runner for agent key "${agent.moduleAgentKey}"`,
        )
      }

      const database = db()
      const gate = {
        approvals: approvalStore(database),
        rules: ruleStore(database),
        events: eventSink(database),
        bus: eventBus(inngest),
        tasks: taskGate(database),
        spendGuard: spendGuard(database),
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
          runs: agentRunStore(database),
          events: eventSink(database),
          clock: systemClock,
          sleeper: realSleeper,
          memory: memoryStore(database),
          ledger: ledgerPort(database),
          tasks: taskStore(database),
          spendGuard: spendGuard(database),
          requestApproval: (req) => requestApproval(req as never, gate) as Promise<ApprovalOutcome>,
        },
      )

      // Stamp last_run_at so the scheduler stops considering this agent due.
      await stampAgentRun(database, agent.id)

      return { taskId, agent: agent.name, output }
    },
  )
}
