import { describe, expect, it } from 'vitest'

import { recommendedSupplier, scoreSuppliers, type SupplierCandidate } from './score'

function candidate(over: Partial<SupplierCandidate> = {}): SupplierCandidate {
  return {
    key: 'a',
    label: 'Supplier A',
    shipsFrom: 'US',
    itemCostCents: 420,
    shippingCostCents: 180,
    leadTimeDaysMin: 3,
    leadTimeDaysMax: 7,
    samplesInspected: true,
    providesTracking: true,
    blindShipping: true,
    returnsWindowDays: 30,
    trackRecordMonths: 36,
    source: 'Fictional demo candidate',
    ...over,
  }
}

describe('scoreSuppliers', () => {
  it('gives a fast, tracked, proven supplier close to full marks', () => {
    const [best] = scoreSuppliers([candidate()])
    expect(best!.score).toBe(100)
  })

  it('returns nothing for no candidates', () => {
    expect(scoreSuppliers([])).toEqual([])
  })

  it('prefers a slower supplier only when nothing else separates them', () => {
    const scores = scoreSuppliers([
      candidate({ key: 'fast', leadTimeDaysMax: 7 }),
      candidate({ key: 'slow', leadTimeDaysMax: 28 }),
    ])
    expect(scores[0]!.key).toBe('fast')
  })

  it('ranks lead time above price', () => {
    // A cheap item that arrives in five weeks costs a refund, a review and a support
    // thread, and the margin it saved covers none of them.
    const scores = scoreSuppliers([
      candidate({ key: 'cheap-slow', itemCostCents: 200, shippingCostCents: 50, leadTimeDaysMax: 35 }),
      candidate({ key: 'dear-fast', itemCostCents: 600, shippingCostCents: 300, leadTimeDaysMax: 7 }),
    ])

    expect(scores[0]!.key).toBe('dear-fast')
  })

  it('scores cost relative to the cheapest in the set', () => {
    const scores = scoreSuppliers([
      candidate({ key: 'cheapest', itemCostCents: 400, shippingCostCents: 100 }),
      candidate({ key: 'dearer', itemCostCents: 800, shippingCostCents: 200 }),
    ])

    const cheapCost = scores.find((s) => s.key === 'cheapest')!.factors.find((f) => f.factor === 'Landed cost')!
    const dearCost = scores.find((s) => s.key === 'dearer')!.factors.find((f) => f.factor === 'Landed cost')!

    expect(cheapCost.points).toBe(20)
    expect(dearCost.points).toBe(10)
  })

  it('blocks a supplier nobody has sampled, however well it scores', () => {
    const [only] = scoreSuppliers([candidate({ samplesInspected: false })])
    expect(only!.score).toBe(100)
    expect(only!.blockers[0]).toMatch(/Nobody has held one of these/)
  })

  it('blocks a supplier that gives no tracking', () => {
    const [only] = scoreSuppliers([candidate({ providesTracking: false })])
    expect(only!.blockers.some((b) => /No tracking/.test(b))).toBe(true)
  })

  it('sorts every blocked supplier below every usable one', () => {
    // The list is read top-down, so the top of it has to be actionable.
    const scores = scoreSuppliers([
      candidate({ key: 'blocked-but-great', samplesInspected: false }),
      candidate({ key: 'usable-but-slower', leadTimeDaysMax: 21 }),
    ])

    expect(scores.map((s) => s.key)).toEqual(['usable-but-slower', 'blocked-but-great'])
  })

  it('asks what happens to a faulty item when there is no returns policy', () => {
    const [only] = scoreSuppliers([candidate({ returnsWindowDays: null })])
    expect(only!.openQuestions.some((q) => /arrives faulty/.test(q))).toBe(true)
    expect(only!.factors.find((f) => f.factor === 'Returns')!.points).toBe(0)
  })

  it('asks whether the supplier’s branding ends up in the parcel', () => {
    const [only] = scoreSuppliers([candidate({ blindShipping: false })])
    expect(only!.openQuestions.some((q) => /who really sent it/.test(q))).toBe(true)
  })

  it('insists a long worst case reaches the listing, not just the data', () => {
    const [only] = scoreSuppliers([candidate({ leadTimeDaysMax: 28 })])
    expect(only!.openQuestions.some((q) => /28-day worst case/.test(q))).toBe(true)
  })

  it('scores an unknown track record as zero rather than average', () => {
    // Absence of evidence scored as the middle of the range is how an unknown
    // supplier outranks a known mediocre one.
    const [only] = scoreSuppliers([candidate({ trackRecordMonths: null })])
    expect(only!.factors.find((f) => f.factor === 'Track record')!.points).toBe(0)
  })

  it('explains every factor in words, not just points', () => {
    const [only] = scoreSuppliers([candidate()])
    expect(only!.factors.every((f) => f.note.length > 0)).toBe(true)
  })

  it('reports factors strongest first', () => {
    const [only] = scoreSuppliers([candidate({ providesTracking: false })])
    for (let i = 1; i < only!.factors.length; i += 1) {
      expect(only!.factors[i - 1]!.points).toBeGreaterThanOrEqual(only!.factors[i]!.points)
    }
  })
})

describe('recommendedSupplier', () => {
  it('picks the best unblocked candidate', () => {
    const scores = scoreSuppliers([
      candidate({ key: 'unsampled', samplesInspected: false }),
      candidate({ key: 'ready', leadTimeDaysMax: 14 }),
    ])
    expect(recommendedSupplier(scores)!.key).toBe('ready')
  })

  it('recommends nobody rather than the least-bad blocked option', () => {
    const scores = scoreSuppliers([
      candidate({ key: 'x', samplesInspected: false }),
      candidate({ key: 'y', providesTracking: false }),
    ])
    expect(recommendedSupplier(scores)).toBeNull()
  })
})
