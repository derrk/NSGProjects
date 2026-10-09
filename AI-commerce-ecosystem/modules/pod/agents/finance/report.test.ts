import { describe, expect, it } from 'vitest'

import { buildFinanceReport, type FinanceReportInput } from './report'

const periodStart = new Date('2026-10-01')
const periodEnd = new Date('2026-10-31')
const inside = new Date('2026-10-15')

function report(over: Partial<FinanceReportInput> = {}) {
  return buildFinanceReport({
    periodStart,
    periodEnd,
    entries: [
      { amountCents: 2999, category: 'revenue', provenance: 'verified', occurredAt: inside },
      { amountCents: -1180, category: 'cogs', provenance: 'verified', occurredAt: inside },
      { amountCents: -0.4, category: 'api', provenance: 'verified', occurredAt: inside },
    ],
    orders: [
      {
        sku: 'pet-hair-remover-v1',
        revenueCents: 1899,
        contributionCents: 1176,
        provenance: 'verified',
      },
    ],
    ...over,
  })
}

describe('buildFinanceReport', () => {
  it('splits revenue from costs by sign, not by category name', () => {
    const r = report()
    expect(r.revenueCents).toBe(2999)
    expect(r.costsCents).toBe(-1180.4)
    expect(r.netCents).toBe(1818.6)
  })

  it('keeps sub-cent API costs instead of rounding them to nothing', () => {
    // Rounded to whole cents, every model call in the ledger costs zero, and the
    // one line that tells you an agent is expensive disappears.
    const r = report()
    const api = r.byCategory.find((c) => c.category === 'api')!
    expect(api.amountCents).toBe(-0.4)
  })

  it('ignores entries outside the period', () => {
    const r = report({
      entries: [
        { amountCents: 5000, category: 'revenue', provenance: 'verified', occurredAt: new Date('2026-09-30') },
        { amountCents: 1000, category: 'revenue', provenance: 'verified', occurredAt: inside },
      ],
    })
    expect(r.revenueCents).toBe(1000)
  })

  it('reports the whole period at its weakest provenance', () => {
    // One simulated row in the pile makes the report worth no more than demo data.
    const r = report({
      entries: [
        { amountCents: 2999, category: 'revenue', provenance: 'verified', occurredAt: inside },
        { amountCents: -1180, category: 'cogs', provenance: 'simulated', occurredAt: inside },
      ],
    })
    expect(r.provenance).toBe('simulated')
    expect(r.caveats[0]).toMatch(/Nothing here describes money that moved/)
  })

  it('says a net built on estimates is a direction, not a balance', () => {
    const r = report({
      entries: [
        { amountCents: 2999, category: 'revenue', provenance: 'verified', occurredAt: inside },
        { amountCents: -1180, category: 'cogs', provenance: 'estimated', occurredAt: inside },
      ],
    })
    expect(r.provenance).toBe('estimated')
    expect(r.caveats.some((c) => /direction, not a balance/.test(c))).toBe(true)
  })

  it('does not let an empty period read as breaking even', () => {
    const r = report({ entries: [], orders: [] })
    expect(r.netCents).toBe(0)
    expect(r.caveats.some((c) => /not because the business broke even/.test(c))).toBe(true)
  })

  it('names loss-making SKUs, worst first', () => {
    const r = report({
      orders: [
        { sku: 'bad', revenueCents: 1000, contributionCents: -200, provenance: 'verified' },
        { sku: 'worse', revenueCents: 1000, contributionCents: -900, provenance: 'verified' },
        { sku: 'fine', revenueCents: 1000, contributionCents: 400, provenance: 'verified' },
      ],
    })

    expect(r.lossMakers.map((s) => s.sku)).toEqual(['worse', 'bad'])
    expect(r.caveats.some((c) => /The worst is worse, averaging \$-9\.00/.test(c))).toBe(true)
  })

  it('does not describe an empty period as containing catalogue estimates', () => {
    // There are no costs in an empty period, so saying some of them are estimates is
    // a statement about figures that do not exist — in the field the finance prompt
    // calls the most important one on the page.
    const r = report({ entries: [], orders: [] })

    expect(r.caveats.some((c) => /catalogue estimates/.test(c))).toBe(false)
    expect(r.caveats.some((c) => /simulated figures/.test(c))).toBe(false)
    expect(r.caveats.some((c) => /not because the business broke even/.test(c))).toBe(true)
  })

  it('never calls a loss-maker something to scale', () => {
    /*
     * The caveat filtered on order count alone, so on a list sorted by contribution
     * it fell through a verified winner to a known loser and told the operator to
     * confirm its costs "before scaling it" — in the same report that had just named
     * it the worst loss-maker.
     */
    const r = report({
      orders: [
        ...Array.from({ length: 5 }, () => ({
          sku: 'loser',
          revenueCents: 1000,
          contributionCents: -100,
          provenance: 'estimated' as const,
        })),
        { sku: 'winner', revenueCents: 2000, contributionCents: 2000, provenance: 'verified' as const },
      ],
    })

    expect(r.lossMakers[0]!.sku).toBe('loser')
    expect(r.caveats.some((c) => /loser.*before scaling it/.test(c))).toBe(false)
  })

  it('reports the worst loss-maker PER ORDER, not its running total', () => {
    /*
     * marginReport collapses a SKU's orders into one total. Calling that total a
     * per-order figure multiplied the loss by the number of sales, and this caveat
     * is the headline the finance agent leads with. The original test gave every
     * SKU exactly one order — the only case where total and per-order agree.
     */
    const r = report({
      orders: Array.from({ length: 3 }, () => ({
        sku: 'mug',
        revenueCents: 1000,
        contributionCents: -200,
        provenance: 'verified' as const,
      })),
    })

    expect(r.lossMakers[0]).toMatchObject({ sku: 'mug', orders: 3, contributionCents: -600 })
    expect(r.caveats.some((c) => c.includes('averaging $-2.00 across 3 sale(s)'))).toBe(true)
    expect(r.caveats.some((c) => c.includes('$-6.00'))).toBe(false)
  })

  it('has no loss-makers when everything contributes', () => {
    expect(report().lossMakers).toEqual([])
  })

  it('flags a SKU selling well on costs nobody has verified', () => {
    // The one most likely to be quietly unprofitable: nothing has forced the
    // estimate to be checked, because it looks like a winner.
    const r = report({
      orders: Array.from({ length: 4 }, () => ({
        sku: 'untested-winner',
        revenueCents: 2999,
        contributionCents: 900,
        provenance: 'estimated' as const,
      })),
    })

    expect(
      r.caveats.some((c) => /untested-winner has 4 orders and its costs are still estimated/.test(c)),
    ).toBe(true)
  })

  it('does not flag a well-selling SKU whose costs are verified', () => {
    const r = report({
      orders: Array.from({ length: 4 }, () => ({
        sku: 'known-good',
        revenueCents: 2999,
        contributionCents: 900,
        provenance: 'verified' as const,
      })),
    })
    expect(r.caveats.some((c) => /known-good/.test(c))).toBe(false)
  })

  it('passes through the operator’s unconfirmed assumptions', () => {
    const r = report({ unconfirmedAssumptions: ['Etsy fee rate of 6.5%'] })
    expect(r.caveats).toContain('Unconfirmed: Etsy fee rate of 6.5%')
  })

  it('sorts categories with the biggest cost first', () => {
    const r = report()
    expect(r.byCategory[0]!.category).toBe('cogs')
    expect(r.byCategory.at(-1)!.category).toBe('revenue')
  })

  it('reports a category at its own weakest provenance, not the report’s', () => {
    const r = report({
      entries: [
        { amountCents: 2999, category: 'revenue', provenance: 'verified', occurredAt: inside },
        { amountCents: -500, category: 'cogs', provenance: 'verified', occurredAt: inside },
        { amountCents: -600, category: 'cogs', provenance: 'estimated', occurredAt: inside },
      ],
    })

    expect(r.byCategory.find((c) => c.category === 'revenue')!.provenance).toBe('verified')
    expect(r.byCategory.find((c) => c.category === 'cogs')!.provenance).toBe('estimated')
  })
})
