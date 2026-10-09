import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PRUNE_POLICY,
  describePrune,
  selectMemoriesToPrune,
  type PrunableMemory,
} from './prune'

const NOW = new Date('2026-10-09T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

let seq = 0
function memory(over: Partial<PrunableMemory> = {}): PrunableMemory {
  seq += 1
  return {
    id: `m${seq}`,
    agentId: 'agent-1',
    divisionId: 'div-1',
    kind: 'fact',
    importance: 0.1,
    pinned: false,
    createdAt: daysAgo(120),
    ...over,
  }
}

/** Enough filler to push the agent past keepPerAgent, so the floor is not what decides. */
function filler(count: number, over: Partial<PrunableMemory> = {}): PrunableMemory[] {
  return Array.from({ length: count }, () => memory({ importance: 0.9, ...over }))
}

const run = (rows: PrunableMemory[], policy = DEFAULT_PRUNE_POLICY) =>
  selectMemoriesToPrune(rows, policy, NOW)

const keepReason = (rows: PrunableMemory[], id: string) =>
  run(rows).kept.find((k) => k.id === id)?.reason

describe('selectMemoriesToPrune — what it deletes', () => {
  it('deletes an old, unimportant memory', () => {
    const rows = [...filler(25), memory({ id: 'target' })]
    expect(run(rows).deleteIds).toContain('target')
  })

  it('deletes nothing from an empty table', () => {
    expect(run([])).toMatchObject({ deleteIds: [], ceilingReached: false, consideredCount: 0 })
  })

  it('follows the policy the schema comment documents', () => {
    // "drops anything below 0.2 that is older than 60 days"
    expect(DEFAULT_PRUNE_POLICY.importanceFloor).toBe(0.2)
    expect(DEFAULT_PRUNE_POLICY.minAgeDays).toBe(60)
  })
})

describe('selectMemoriesToPrune — what overrides the rule', () => {
  it('never deletes a pinned memory', () => {
    const rows = [...filler(25), memory({ id: 'pin', pinned: true, importance: 0 })]
    expect(run(rows).deleteIds).not.toContain('pin')
    expect(keepReason(rows, 'pin')).toBe('pinned')
  })

  it('never deletes a lesson, at any score or age', () => {
    /*
     * A lesson is what an agent recorded after something went wrong. Deleting one
     * frees the agent to make that mistake again, and the cost of the mistake is the
     * reason the lesson exists.
     */
    const rows = [
      ...filler(25),
      memory({ id: 'lesson', kind: 'lesson', importance: 0, createdAt: daysAgo(999) }),
    ]
    expect(run(rows).deleteIds).not.toContain('lesson')
    expect(keepReason(rows, 'lesson')).toBe('lesson')
  })

  it('keeps a memory at exactly the importance floor', () => {
    // The floor is "below 0.2", not "0.2 and below".
    const rows = [...filler(25), memory({ id: 'edge', importance: 0.2 })]
    expect(run(rows).deleteIds).not.toContain('edge')
    expect(keepReason(rows, 'edge')).toBe('important-enough')
  })

  it('keeps a memory younger than the age floor', () => {
    const rows = [...filler(25), memory({ id: 'young', createdAt: daysAgo(59) })]
    expect(run(rows).deleteIds).not.toContain('young')
    expect(keepReason(rows, 'young')).toBe('too-recent')
  })

  it('keeps the newest N per agent whatever they score', () => {
    /*
     * An agent quiet for a quarter would otherwise come back having been pruned to
     * nothing while it was idle.
     */
    const rows = Array.from({ length: 5 }, (_, i) =>
      memory({ id: `only-${i}`, createdAt: daysAgo(200 + i) }),
    )
    expect(run(rows).deleteIds).toEqual([])
    expect(run(rows).kept.every((k) => k.reason === 'within-per-agent-floor')).toBe(true)
  })

  it('keeps the NEWEST rather than whichever was scanned first', () => {
    const policy = { ...DEFAULT_PRUNE_POLICY, keepPerAgent: 1 }
    const rows = [
      memory({ id: 'older', createdAt: daysAgo(300) }),
      memory({ id: 'newer', createdAt: daysAgo(100) }),
    ]

    const decision = selectMemoriesToPrune(rows, policy, NOW)
    expect(decision.deleteIds).toEqual(['older'])
  })

  it('applies the per-agent floor per agent, not across all of them', () => {
    const policy = { ...DEFAULT_PRUNE_POLICY, keepPerAgent: 2 }
    const rows = [
      ...Array.from({ length: 4 }, (_, i) => memory({ agentId: 'a', createdAt: daysAgo(100 + i) })),
      ...Array.from({ length: 4 }, (_, i) => memory({ agentId: 'b', createdAt: daysAgo(100 + i) })),
    ]

    // Two survive per agent, so two are deleted per agent.
    expect(selectMemoriesToPrune(rows, policy, NOW).deleteIds).toHaveLength(4)
  })
})

describe('selectMemoriesToPrune — the ceiling', () => {
  it('stops at the per-run ceiling rather than emptying the table', () => {
    /*
     * The guard that makes a policy bug survivable. A change that scored every
     * memory below the floor would otherwise delete everything in one tick, and
     * there is no undo.
     */
    const policy = { ...DEFAULT_PRUNE_POLICY, maxDeletionsPerRun: 10, keepPerAgent: 0 }
    const rows = Array.from({ length: 50 }, () => memory())

    const decision = selectMemoriesToPrune(rows, policy, NOW)
    expect(decision.deleteIds).toHaveLength(10)
    expect(decision.ceilingReached).toBe(true)
  })

  it('says so in the summary when the ceiling stopped it short', () => {
    const policy = { ...DEFAULT_PRUNE_POLICY, maxDeletionsPerRun: 2, keepPerAgent: 0 }
    const decision = selectMemoriesToPrune(
      Array.from({ length: 10 }, () => memory()),
      policy,
      NOW,
    )
    expect(describePrune(decision)).toMatch(/ceiling stopped it short/)
  })

  it('does not claim a ceiling when there was room', () => {
    const rows = [...filler(25), memory({ id: 'one' })]
    const decision = run(rows)
    expect(decision.ceilingReached).toBe(false)
    expect(describePrune(decision)).not.toMatch(/ceiling/)
  })

  it('reports deleting none without implying a problem', () => {
    expect(describePrune(run([memory({ pinned: true })]))).toMatch(/deleted none/)
  })
})
