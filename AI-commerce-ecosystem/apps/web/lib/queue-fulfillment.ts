/**
 * Handing one recorded order to the Fulfilment desk.
 *
 * Two callers reach this: the Shopify webhook, which records an order the moment
 * it is pushed, and Receiving, which finds the ones no webhook delivered. Writing
 * it twice is how the two quietly diverge — one of them stops checking that the
 * agent is active, or starts queueing on a redelivery, and the symptom is a
 * duplicate run nobody connects to either file.
 *
 * It never throws. The order is already saved by the time this runs, and failing
 * the caller would turn a missed nudge into a 500 that makes Shopify redeliver an
 * order already in the database. The failure is reported so it is visible.
 */

import { agents, tasks } from '@acf/db'
import { inngest } from '@acf/jobs'
import { and, eq } from 'drizzle-orm'

export interface QueueResult {
  status: 'queued' | 'no_agent' | 'failed'
  taskId: string | null
  reason: string | null
}

export async function queueFulfillment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural db type
  database: any,
  divisionId: string,
  orderId: string,
  title: string,
): Promise<QueueResult> {
  try {
    const [desk] = await database
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.divisionId, divisionId),
          eq(agents.moduleAgentKey, 'fulfillment'),
          // Active only. A paused desk is an operator's decision, and queueing work
          // for it would pile up tasks they then have to clear by hand.
          eq(agents.status, 'active'),
        ),
      )
      .limit(1)

    if (!desk) {
      return {
        status: 'no_agent',
        taskId: null,
        reason: 'this division has no active Fulfilment desk, so nothing will route the order',
      }
    }

    const [task] = await database
      .insert(tasks)
      .values({
        divisionId,
        agentId: desk.id,
        title,
        input: { orderId },
        // The task_source enum is schedule/event/operator/agent. An order arriving
        // from outside is an event by any reading of it.
        source: 'event' as const,
        priority: 90,
        actor: 'system',
      })
      .returning()

    if (!task) {
      return { status: 'failed', taskId: null, reason: 'the task could not be written' }
    }

    // Sent AFTER the row exists. The reverse order has a worker arrive before the
    // task it was told about and find nothing.
    await inngest.send({ name: 'task.created', data: { taskId: task.id } })

    return { status: 'queued', taskId: task.id, reason: null }
  } catch (err) {
    return {
      status: 'failed',
      taskId: null,
      reason: err instanceof Error ? err.message : String(err),
    }
  }
}
