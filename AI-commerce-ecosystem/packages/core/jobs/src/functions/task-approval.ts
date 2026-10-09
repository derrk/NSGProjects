import { db, tasks } from '@acf/db'

import {
  agentsSubscribedTo,
  closeBlockedTask,
  eventSink,
  requeueTask,
  taskBlockedOn,
} from '../adapters'
import { inngest } from '../client'
import {
  dispatchInput,
  eventSchedule,
  resumeInput,
  shouldResumeRequester,
  type ApprovalDecisionEvent,
} from '../task-lifecycle'

/**
 * `task.on-approval` — what happens when the operator answers.
 *
 * Two jobs, both triggered by the single core `approval.decided` event:
 *
 *  1. Settle the task that was waiting. Most agents finish at the gate, so the task
 *     closes; one that asked to continue (`resumeTask` in its payload) goes back in
 *     the queue carrying the decision.
 *
 *  2. Dispatch any agent subscribed to this outcome. An agent whose schedule is
 *     `event:concept.approved` gets a task the moment a concept approval is approved.
 *     This is what moves work between agents, and it needs no wildcard event triggers
 *     and no module-specific wiring — the decision carries its own kind.
 */
export const taskOnApproval = inngest.createFunction(
  {
    id: 'task-on-approval',
    triggers: [{ event: 'approval.decided' }],
    retries: 3,
  },
  async ({ event, step }) => {
    const decision = event.data as unknown as ApprovalDecisionEvent

    /* ---------------- settle the waiting task ---------------- */

    const settled = await step.run('settle-blocked-task', async () => {
      const database = db()

      // Prefer the id the gate put on the event; fall back to a lookup, because an
      // approval created before the task was known still points back here.
      const blocked =
        decision.taskId !== null
          ? ((await database.query.tasks.findFirst({
              where: (t, { eq }) => eq(t.id, decision.taskId as string),
            })) ?? null)
          : await taskBlockedOn(database, decision.approvalId)

      if (!blocked || blocked.status !== 'blocked') return { settled: 'none' as const }

      if (shouldResumeRequester(decision.payload, decision.decision)) {
        const next = resumeInput(blocked.input, decision)
        const row = await requeueTask(database, blocked.id, next)
        return { settled: 'requeued' as const, taskId: row?.id ?? blocked.id }
      }

      await closeBlockedTask(database, blocked.id)
      return { settled: 'closed' as const, taskId: blocked.id }
    })

    if (settled.settled === 'requeued' && settled.taskId) {
      await step.sendEvent('resume', [
        {
          name: 'task.created',
          data: {
            taskId: settled.taskId,
            divisionId: decision.divisionId,
            agentId: null,
            source: 'event',
          },
        },
      ])
    }

    /* ---------------- dispatch whoever reacts to this ---------------- */

    const dispatched = await step.run('dispatch-subscribers', async () => {
      // A rejection is a real outcome an agent may want to act on — rewriting a
      // concept, say — so both are dispatched, on distinct schedule strings.
      const schedule = eventSchedule(
        decision.kind,
        decision.decision === 'rejected' ? 'rejected' : 'approved',
      )

      const database = db()
      const subscribers = await agentsSubscribedTo(database, decision.divisionId, schedule)
      if (subscribers.length === 0) return []

      const input = dispatchInput(decision)
      const sink = eventSink(database)
      const created: Array<{ taskId: string; divisionId: string; agentId: string }> = []

      for (const agent of subscribers) {
        const [row] = await database
          .insert(tasks)
          .values({
            divisionId: agent.divisionId,
            agentId: agent.id,
            title: `${agent.name}: ${schedule}`,
            input,
            source: 'event',
            actor: 'system',
          })
          .returning()
        if (!row) continue

        created.push({ taskId: row.id, divisionId: agent.divisionId, agentId: agent.id })
        await sink.emit({
          divisionId: agent.divisionId,
          agentId: agent.id,
          kind: 'task.created',
          level: 'info',
          message: `queued ${agent.name} on ${schedule}`,
          refTable: 'tasks',
          refId: row.id,
        })
      }

      return created
    })

    if (dispatched.length > 0) {
      await step.sendEvent(
        'dispatch',
        dispatched.map((d) => ({
          name: 'task.created' as const,
          data: { ...d, source: 'event' },
        })),
      )
    }

    return { settled: settled.settled, dispatched: dispatched.length }
  },
)
