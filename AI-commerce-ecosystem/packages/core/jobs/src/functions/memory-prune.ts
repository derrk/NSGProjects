import { agentMemory, db } from '@acf/db'
import { inArray } from 'drizzle-orm'
import { cron } from 'inngest'

import { eventSink } from '../adapters'
import { inngest } from '../client'
import { DEFAULT_PRUNE_POLICY, describePrune, selectMemoriesToPrune } from '../prune'

/**
 * `memory.prune` — Sunday morning (SPEC.md §Core jobs).
 *
 * The policy has been written in a schema comment since the first migration and
 * enforced nowhere: "the weekly prune drops anything below 0.2 that is older than 60
 * days". All the judgement lives in `selectMemoriesToPrune`, which is pure and unit
 * tested; this function fetches, calls it, deletes, and says what it did.
 *
 * Deletion deserves a record, so the event it writes names the count and is emitted
 * even when the count is zero — a prune that silently did nothing and a prune that
 * silently did not run look identical in a log that only speaks up on change.
 */
export const memoryPrune = inngest.createFunction(
  {
    id: 'memory-prune',
    triggers: [cron('TZ=America/Chicago 0 4 * * 0')],
    retries: 1,
  },
  async ({ step }) => {
    const decision = await step.run('decide', async () => {
      const rows = await db()
        .select({
          id: agentMemory.id,
          agentId: agentMemory.agentId,
          divisionId: agentMemory.divisionId,
          kind: agentMemory.kind,
          importance: agentMemory.importance,
          pinned: agentMemory.pinned,
          createdAt: agentMemory.createdAt,
        })
        .from(agentMemory)

      const result = selectMemoriesToPrune(
        rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt) })),
        DEFAULT_PRUNE_POLICY,
        new Date(),
      )

      // Only the fields read after this point survive the step boundary as JSON, so
      // the full `kept` list is summarised here rather than carried across it.
      return {
        deleteIds: result.deleteIds,
        ceilingReached: result.ceilingReached,
        consideredCount: result.consideredCount,
        summary: describePrune(result),
      }
    })

    const deleted = await step.run('delete', async () => {
      if (decision.deleteIds.length === 0) return 0
      await db().delete(agentMemory).where(inArray(agentMemory.id, decision.deleteIds))
      return decision.deleteIds.length
    })

    await step.run('record', async () => {
      await eventSink(db()).emit({
        kind: 'memory.pruned',
        // A ceiling hit means either a backlog or a policy that has gone wrong, and
        // both are worth a second look.
        level: decision.ceilingReached ? 'warn' : 'info',
        message: decision.summary,
      })
    })

    return {
      considered: decision.consideredCount,
      deleted,
      ceilingReached: decision.ceilingReached,
    }
  },
)
