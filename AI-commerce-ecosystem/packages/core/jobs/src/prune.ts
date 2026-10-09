/**
 * Deciding what an agent is allowed to forget.
 *
 * `agent_memory.importance` has carried the comment "the weekly prune drops anything
 * below 0.2 that is older than 60 days" since the first migration, and no prune
 * existed. This is it.
 *
 * Pruning is deletion, and deletion of something an agent learned is not recoverable
 * — so the interesting part of this file is not the rule, it is the three things that
 * override the rule and the ceiling that makes a bug in it survivable.
 */

export type MemoryKind = 'decision' | 'result' | 'lesson' | 'fact'

export interface PrunableMemory {
  id: string
  agentId: string
  divisionId: string
  kind: MemoryKind
  importance: number
  pinned: boolean
  createdAt: Date
}

export interface PrunePolicy {
  /** Below this, a memory is a candidate. The schema says 0.2. */
  importanceFloor: number
  /** Younger than this, nothing is touched however unimportant. The schema says 60. */
  minAgeDays: number
  /**
   * The most rows one run may delete.
   *
   * Not a performance limit. A policy bug that scored every memory below the floor
   * would otherwise empty the table in a single tick, and there is no undo. A
   * ceiling turns that into a visible, partial, repeatable mistake.
   */
  maxDeletionsPerRun: number
  /**
   * Memories kept per agent regardless of score, newest first.
   *
   * An agent that has been quiet for a quarter would otherwise come back with
   * nothing, having been pruned down to zero while it was idle.
   */
  keepPerAgent: number
}

export const DEFAULT_PRUNE_POLICY: PrunePolicy = {
  importanceFloor: 0.2,
  minAgeDays: 60,
  maxDeletionsPerRun: 500,
  keepPerAgent: 20,
}

export type KeepReason =
  | 'pinned'
  | 'lesson'
  | 'important-enough'
  | 'too-recent'
  | 'within-per-agent-floor'
  | 'run-ceiling-reached'

export interface PruneDecision {
  deleteIds: string[]
  /** Why each surviving candidate survived. Only rows that were considered appear. */
  kept: Array<{ id: string; reason: KeepReason }>
  /** True when the ceiling stopped the run short, so the operator knows to look. */
  ceilingReached: boolean
  consideredCount: number
}

function ageDays(now: Date, then: Date): number {
  return (now.getTime() - then.getTime()) / 86_400_000
}

/**
 * Choose what to delete.
 *
 * Pure, so the policy can be asserted exactly rather than inferred from what a
 * database looks like afterwards — which matters more here than usual, because the
 * wrong answer is unrecoverable.
 */
export function selectMemoriesToPrune(
  rows: readonly PrunableMemory[],
  policy: PrunePolicy = DEFAULT_PRUNE_POLICY,
  now: Date = new Date(),
): PruneDecision {
  const kept: PruneDecision['kept'] = []
  const deleteIds: string[] = []

  /*
   * Newest-first per agent, so the per-agent floor keeps the most recent rather than
   * whichever happened to be scanned first.
   */
  const byAgent = new Map<string, PrunableMemory[]>()
  for (const row of rows) {
    const list = byAgent.get(row.agentId)
    if (list) list.push(row)
    else byAgent.set(row.agentId, [row])
  }
  for (const list of byAgent.values()) {
    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  let ceilingReached = false

  for (const [, list] of byAgent) {
    for (const [index, row] of list.entries()) {
      // A pin is the operator saying "keep this". Nothing here overrides it.
      if (row.pinned) {
        kept.push({ id: row.id, reason: 'pinned' })
        continue
      }

      /*
       * Lessons are never pruned, at any score or age.
       *
       * A lesson is what an agent recorded after something went wrong. Deleting one
       * means the agent is free to make that mistake again, and the cost of the
       * mistake is why the lesson exists. Recall already loads every lesson
       * unconditionally; pruning them would quietly undo that.
       */
      if (row.kind === 'lesson') {
        kept.push({ id: row.id, reason: 'lesson' })
        continue
      }

      if (row.importance >= policy.importanceFloor) {
        kept.push({ id: row.id, reason: 'important-enough' })
        continue
      }

      if (ageDays(now, row.createdAt) < policy.minAgeDays) {
        kept.push({ id: row.id, reason: 'too-recent' })
        continue
      }

      // The newest N for this agent survive whatever they score.
      if (index < policy.keepPerAgent) {
        kept.push({ id: row.id, reason: 'within-per-agent-floor' })
        continue
      }

      if (deleteIds.length >= policy.maxDeletionsPerRun) {
        ceilingReached = true
        kept.push({ id: row.id, reason: 'run-ceiling-reached' })
        continue
      }

      deleteIds.push(row.id)
    }
  }

  return { deleteIds, kept, ceilingReached, consideredCount: rows.length }
}

/** A one-line summary for the event log, since deletion deserves a record. */
export function describePrune(decision: PruneDecision): string {
  if (decision.deleteIds.length === 0) {
    return `Considered ${decision.consideredCount} memories and deleted none.`
  }
  const tail = decision.ceilingReached
    ? ' The per-run ceiling stopped it short, so more remain eligible — this will need another run, or the policy is wrong.'
    : ''
  return (
    `Deleted ${decision.deleteIds.length} of ${decision.consideredCount} memories.` + tail
  )
}
