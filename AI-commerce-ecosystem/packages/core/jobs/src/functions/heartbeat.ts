import { assessAgentHealth } from '@acf/core/health'
import { db } from '@acf/db'
import { cron } from 'inngest'

import { allAgents, eventSink, pausedDivisionIds, recentRuns } from '../adapters'
import { inngest } from '../client'

/**
 * `health.heartbeat` — every 15 minutes (SPEC.md §Core jobs).
 *
 * Marks agents stale at twice their interval and red after three consecutive
 * failures. All the judgement lives in `assessAgentHealth`, which is pure and unit
 * tested; this function only fetches, calls it, and writes the result.
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
      const [agents, runs, paused] = await Promise.all([
        allAgents(database),
        recentRuns(database),
        pausedDivisionIds(database),
      ])

      return assessAgentHealth(
        agents.map((a) => ({
          id: a.id,
          name: a.name,
          divisionId: a.divisionId,
          schedule: a.schedule,
          status: a.status,
        })),
        runs
          .filter((r): r is typeof r & { agentId: string } => r.agentId !== null)
          .map((r) => ({
            agentId: r.agentId,
            status: r.status,
            startedAt: new Date(r.startedAt),
            finishedAt: r.finishedAt ? new Date(r.finishedAt) : null,
          })),
        new Date(),
        { blockedDivisions: paused },
      )
    })

    // Everything crossing a step boundary is JSON-serialized, so Dates come back as
    // strings. Only the plain fields below are read after this point.
    const unhealthy = health.filter((h) => h.light !== 'green')

    await step.run('record', async () => {
      const sink = eventSink(db())
      for (const station of unhealthy) {
        await sink.emit({
          divisionId: station.divisionId,
          agentId: station.agentId,
          kind: `health.${station.status}`,
          level: station.light === 'red' ? 'error' : 'warn',
          message: `${station.agent}: ${station.reason}`,
        })
      }
      return unhealthy.length
    })

    // Not needsOperatorAlert(health): `health` has crossed a step boundary, so it has
    // been JSON-serialized and its Dates are strings. Filtering on the plain status
    // field is honest about what actually survived.
    const red = health.filter((h) => h.status === 'error')
    if (red.length > 0) {
      // Email delivery lands in week 4 with the rest of the alerting. Until then the
      // red station and this error-level event are the signal.
      console.error('[health] red stations:', red.map((a) => a.agent).join(', '))
    }

    return { assessed: health.length, unhealthy: unhealthy.length, red: red.length }
  },
)
