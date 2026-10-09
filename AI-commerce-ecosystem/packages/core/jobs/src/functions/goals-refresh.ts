import { db, divisions, goals } from '@acf/db'
import { and, eq } from 'drizzle-orm'
import { cron } from 'inngest'

import { eventSink } from '../adapters'
import { inngest } from '../client'
import type { CounterResolver } from './types'

/**
 * `goals.refresh` — hourly.
 *
 * Every agent run is handed its division's active goals, with a `current` and a
 * `target`. Nothing has ever written `current`. It defaults to zero and stays there,
 * so an agent is told "60 products live, currently 0" for as long as the goal exists
 * — and acts on it.
 *
 * A stale number is worse than no number here. An agent reading `current: 0` against
 * a target of 60 will behave as though it has achieved nothing, which is the one
 * reading guaranteed to be wrong once anything has shipped.
 *
 * `metric` names what is counted, e.g. `pod.products_live`. Core cannot know what a
 * product is, so the metric resolves through the module's own counter resolvers —
 * the same mechanism the floor uses, supplied by the composition root for the same
 * reason.
 */
export function createGoalsRefresh(resolveCounters: CounterResolver) {
  return inngest.createFunction(
    { id: 'goals-refresh', triggers: [cron('0 * * * *')], retries: 1 },
    async ({ step }) => {
      const updates = await step.run('measure', async () => {
        const database = db()
        const rows = await database
          .select({
            id: goals.id,
            divisionId: goals.divisionId,
            metric: goals.metric,
            current: goals.current,
            moduleName: divisions.type,
          })
          .from(goals)
          .innerJoin(divisions, eq(goals.divisionId, divisions.id))
          .where(eq(goals.status, 'active'))

        const now = new Date()
        const measured: Array<{ id: string; from: number; to: number; metric: string }> = []
        /*
         * A goal is a cumulative figure, not a daily one, so the window opens at the
         * epoch. Passed explicitly rather than left out: a resolver that starts
         * honouring the window would otherwise silently change what a goal means.
         */
        const since = new Date(0)

        for (const row of rows) {
          if (!row.metric) continue
          const resolver = resolveCounters(row.moduleName)[row.metric]
          // A metric with no resolver is left alone rather than zeroed. Writing zero
          // because nothing could measure it is the stale-number problem again, with
          // more confidence.
          if (!resolver) continue

          const value = await resolver({ divisionId: row.divisionId, since, until: now })
          if (value === null || value === row.current) continue
          measured.push({ id: row.id, from: row.current, to: value, metric: row.metric })
        }

        return measured
      })

      const written = await step.run('write', async () => {
        if (updates.length === 0) return 0
        const database = db()
        for (const update of updates) {
          await database
            .update(goals)
            .set({ current: update.to, updatedAt: new Date() })
            .where(and(eq(goals.id, update.id), eq(goals.status, 'active')))
        }
        return updates.length
      })

      if (written > 0) {
        await step.run('record', async () => {
          await eventSink(db()).emit({
            kind: 'goals.refreshed',
            level: 'info',
            message:
              `Updated ${written} goal(s): ` +
              updates.map((u) => `${u.metric} ${u.from} to ${u.to}`).join(', '),
          })
        })
      }

      return { active: updates.length, written }
    },
  )
}
