import { db } from '@acf/db'

import { executeTask } from '../execute-task'
import { inngest } from '../client'
import { taskStore } from '../adapters'
import type { AgentResolver } from './types'

/**
 * `task.run` — the one job that runs every agent in every division.
 *
 * All the work is in `executeTask`, shared with the operator's "Run now" button, so
 * the queued path and the manual path can never drift apart.
 */
export function createTaskRunner(resolveAgent: AgentResolver) {
  return inngest.createFunction(
    {
      id: 'task-run',
      triggers: [{ event: 'task.created' }, { event: 'task.retry' }],
      // The run loop already retries the AGENT with backoff. These retries are for
      // infrastructure faults before the loop starts, and they are safe to repeat
      // because claiming is atomic: a retry of an already-claimed task finds nothing
      // to do and stops.
      retries: 2,
      onFailure: async ({ event }) => {
        // If the function itself died, do not leave the task looking busy for hours.
        // A stale claim would free it eventually; the operator should see `failed`.
        const taskId = (event.data as { event?: { data?: { taskId?: string } } }).event?.data
          ?.taskId
        if (typeof taskId === 'string') {
          await taskStore(db()).fail(taskId, 'the task runner crashed')
        }
      },
    },
    async ({ event }) => {
      const { taskId } = event.data as { taskId: string }
      // Not inside step.run: step results are memoized, so a replay would report a
      // claim it never actually made.
      return executeTask(taskId, { db: db(), resolveAgent, bus: inngest })
    },
  )
}
