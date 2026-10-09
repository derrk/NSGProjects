import { createGoalsRefresh } from './goals-refresh'
import { healthHeartbeat } from './heartbeat'
import { memoryPrune } from './memory-prune'
import { schedulerTick } from './scheduler'
import { taskOnApproval } from './task-approval'
import { createTaskRunner } from './task-run'
import type { AgentResolver, CounterResolver, JobResolvers } from './types'

/**
 * Every core Inngest function.
 *
 * A factory rather than a constant because two of these need to reach module code —
 * `task.run` resolves an agent key to a runner, and `goals.refresh` resolves a goal's
 * metric to something that can count it — and only the composition root knows both
 * core and modules.
 *
 * Note what is NOT here: a module never defines a job. The scheduler reads schedules
 * from the `agents` table and task.on-approval dispatches from the same table, so
 * adding a division adds no infrastructure at all.
 *
 * Accepts either the agent resolver alone or the full bundle, so the older one-arg
 * call site keeps working: a composition root that supplies no counter resolver gets
 * every job except the goal refresh, rather than a goal refresh that silently
 * measures nothing.
 */
export function createCoreFunctions(resolvers: AgentResolver | JobResolvers) {
  const bundle: JobResolvers =
    typeof resolvers === 'function' ? { agents: resolvers } : resolvers

  return [
    schedulerTick,
    createTaskRunner(bundle.agents),
    taskOnApproval,
    healthHeartbeat,
    memoryPrune,
    ...(bundle.counters ? [createGoalsRefresh(bundle.counters)] : []),
  ]
}

export {
  createGoalsRefresh,
  healthHeartbeat,
  memoryPrune,
  schedulerTick,
  taskOnApproval,
  createTaskRunner,
}
export type { AgentResolver, CounterResolver, JobResolvers }
