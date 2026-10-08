import { assessAgentHealth, needsOperatorAlert } from '@acf/core/health'
import { db } from '@acf/db'
import { cron } from 'inngest'

import { eventSink, recentRuns } from '../adapters'
import { inngest } from '../client'

/**
 * `health.heartbeat` — every 15 minutes (SPEC.md §Orchestrator).
 *
 * Marks any agent whose last run is older than twice its interval as stale, and any
 * agent with three consecutive failures as red. All the judgement lives in
 * `assessAgentHealth`, which is pure and unit-tested; this function only fetches,
 * calls it, and writes the result to the event log.
 */
export const healthHeartbeat = inngest.createFunction(
  {
    id: 'health-heartbeat',
    triggers: [cron('TZ=America/Chicago */15 * * * *')],
    retries: 2,
  },
  // A cron-triggered handler receives no `event` argument.
  async ({ step }) => {
    const health = await step.run('assess', async () => {
      const database = db()
      const runs = await recentRuns(database)
      return assessAgentHealth(
        runs.map((r) => ({
          agent: r.agent,
          status: r.status,
          startedAt: new Date(r.startedAt),
          finishedAt: r.finishedAt ? new Date(r.finishedAt) : null,
        })),
        new Date(),
      )
    })

    // Everything crossing a step boundary is JSON-serialized, so Dates come back as
    // strings. Only the plain fields below are read after this point.
    const unhealthy = health.filter((h) => h.light !== 'green')

    await step.run('record', async () => {
      const sink = eventSink(db())
      for (const station of unhealthy) {
        await sink.emit({
          agent: station.agent,
          kind: `health.${station.status}`,
          level: station.light === 'red' ? 'error' : 'warn',
          message: station.reason,
        })
      }
      return unhealthy.length
    })

    const red = health.filter((h) => h.status === 'error')
    if (red.length > 0) {
      // Email delivery lands in week 4 with the rest of the alerting. Until then the
      // red station and this error-level event are the signal.
      console.error('[health] stations are red:', red.map((a) => a.agent).join(', '))
    }

    return { assessed: health.length, unhealthy: unhealthy.length, red: red.length }
  },
)

export { needsOperatorAlert }
