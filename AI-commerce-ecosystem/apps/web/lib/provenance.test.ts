import { describe, expect, it } from 'vitest'

import {
  describeLedgerTrust,
  provenanceOf,
  splitByProvenance,
  type LedgerRowLike,
} from './provenance'

const row = (over: Partial<LedgerRowLike> = {}): LedgerRowLike => ({
  kind: 'revenue',
  source: 'simulated:etsy',
  amountCents: 1000,
  ...over,
})

describe('provenanceOf', () => {
  it('calls an agent-priced API cost an estimate, not a bill', () => {
    expect(provenanceOf('api_cost', 'agent:designer')).toBe('estimated')
  })

  it('calls anything else an agent wrote simulated', () => {
    expect(provenanceOf('revenue', 'agent:store_ops')).toBe('simulated')
  })

  it('recognises the seed’s own sources as simulated', () => {
    // The pet seed writes `simulated:etsy`, `simulated:supplier-invoice` and so on.
    // If this ever stopped matching, demo money would render as real.
    expect(provenanceOf('revenue', 'simulated:etsy')).toBe('simulated')
    expect(provenanceOf('cogs', 'simulated:supplier-invoice')).toBe('simulated')
    expect(provenanceOf('revenue', 'mock-shopify')).toBe('simulated')
  })

  it('distinguishes a human entry from an imported one', () => {
    expect(provenanceOf('expense', 'operator')).toBe('manual')
    expect(provenanceOf('expense', 'user:derrik')).toBe('manual')
    expect(provenanceOf('cogs', 'invoice:printify-2026-10')).toBe('verified')
    expect(provenanceOf('revenue', 'import:stripe')).toBe('verified')
  })

  it('falls back to estimated for a source it does not recognise', () => {
    // The safe direction: an unknown source must never read as verified.
    expect(provenanceOf('revenue', 'something-new')).toBe('estimated')
  })
})

describe('splitByProvenance', () => {
  it('reports the weakest provenance present', () => {
    const split = splitByProvenance([
      row({ source: 'invoice:x', amountCents: 5000 }),
      row({ source: 'simulated:etsy', amountCents: 100 }),
    ])
    expect(split.weakest).toBe('simulated')
  })

  it('measures magnitude, not net', () => {
    /*
     * A simulated revenue row and a simulated cost row of the same size net to zero,
     * and "no simulated money here" is exactly the wrong conclusion to draw.
     */
    const split = splitByProvenance([
      row({ kind: 'revenue', source: 'simulated:etsy', amountCents: 2999 }),
      row({ kind: 'cogs', source: 'simulated:etsy', amountCents: -2999 }),
    ])
    expect(split.totals.simulated).toBe(0)
    expect(split.magnitudes.simulated).toBe(5998)
    expect(split.weakest).toBe('simulated')
  })

  it('reports nothing present for an empty ledger', () => {
    const split = splitByProvenance([])
    expect(split.weakest).toBeNull()
    expect(split.present).toEqual([])
  })

  it('lists what is present weakest first', () => {
    const split = splitByProvenance([
      row({ source: 'invoice:x' }),
      row({ source: 'operator' }),
      row({ kind: 'api_cost', source: 'agent:designer', amountCents: -0.4 }),
    ])
    expect(split.present).toEqual(['estimated', 'manual', 'verified'])
  })
})

describe('describeLedgerTrust', () => {
  it('does not let an empty ledger read as breaking even', () => {
    expect(describeLedgerTrust(splitByProvenance([]))).toMatch(/not because the business broke even/)
  })

  it('names simulated money in the sentence, with its size', () => {
    // The failure this replaces: a hardcoded paragraph saying the ledger held only
    // estimated API spend, printed above $48.98 of seeded fictional revenue.
    const text = describeLedgerTrust(
      splitByProvenance([
        row({ kind: 'revenue', source: 'simulated:etsy', amountCents: 2999 }),
        row({ kind: 'revenue', source: 'simulated:shopify', amountCents: 1899 }),
      ]),
    )
    expect(text).toMatch(/SIMULATED/)
    expect(text).toContain('$48.98')
  })

  it('says plainly when nothing has been verified', () => {
    const text = describeLedgerTrust(splitByProvenance([row({ source: 'simulated:etsy' })]))
    expect(text).toMatch(/[Nn]othing in this ledger has been verified/)
  })

  it('drops that claim once something is verified', () => {
    const text = describeLedgerTrust(
      splitByProvenance([row({ source: 'invoice:printify', amountCents: -1000 })]),
    )
    expect(text).toMatch(/VERIFIED/)
    expect(text).not.toMatch(/[Nn]othing in this ledger has been verified/)
  })
})
