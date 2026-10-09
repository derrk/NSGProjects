import { healthHeartbeat } from './heartbeat'
import { schedulerTick } from './scheduler'

/**
 * Every core Inngest function.
 *
 * Note what is NOT here: a module never defines a cron. The scheduler reads schedules
 * from the `agents` table, so adding a division adds no jobs.
 */
export const functions = [schedulerTick, healthHeartbeat]

export { healthHeartbeat, schedulerTick }
