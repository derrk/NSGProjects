import { healthHeartbeat } from './heartbeat'
import { schedulerTick } from './scheduler'
import { taskOnApproval } from './task-approval'
import { createTaskRunner } from './task-run'
import type { AgentResolver } from './types'

/**
 * Every core Inngest function.
 *
 * A factory rather than a constant because `task.run` needs to resolve an agent key
 * to a runner, and only the composition root knows both core and modules.
 *
 * Note what is NOT here: a module never defines a job. The scheduler reads schedules
 * from the `agents` table and task.on-approval dispatches from the same table, so
 * adding a division adds no infrastructure at all.
 */
export function createCoreFunctions(resolveAgent: AgentResolver) {
  return [schedulerTick, createTaskRunner(resolveAgent), taskOnApproval, healthHeartbeat]
}

export { healthHeartbeat, schedulerTick, taskOnApproval, createTaskRunner }
export type { AgentResolver }
