/**
 * How much a ledger figure can be trusted, and who gets to say so.
 *
 * The brief asks that estimates, simulations, manual entries and verified imports
 * stay distinguishable. Rather than a flag someone forgets to set, provenance is
 * derived from the `source` string the writer had to supply anyway.
 *
 * This lives here rather than in a page because it was in a page, and the result was
 * the exact failure it exists to prevent: Treasury marked every row it rendered while
 * The Holding summed the same ledger through a view with no `source` dimension and
 * showed four bare money tiles. Seeding a fictional division then put $48.98 of
 * invented revenue on the dashboard with no marking anywhere near it, underneath a
 * disclaimer stating the ledger "so far contains only ESTIMATED API spend" — which
 * those same rows made false.
 *
 * One definition, imported by both screens, so they cannot disagree about what a
 * number is worth.
 */

export type Provenance = 'estimated' | 'simulated' | 'manual' | 'verified'

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  estimated: 'estimate',
  simulated: 'simulated',
  manual: 'entered by hand',
  verified: 'verified',
}

/** Weakest first. A mixed set is worth no more than its weakest member. */
export const PROVENANCE_RANK: Record<Provenance, number> = {
  simulated: 0,
  estimated: 1,
  manual: 2,
  verified: 3,
}

export function provenanceOf(kind: string, source: string): Provenance {
  if (source.startsWith('agent:')) {
    // Priced from a model rate table at run time. Never a bill.
    return kind === 'api_cost' ? 'estimated' : 'simulated'
  }
  if (source.startsWith('mock') || source.includes('simulat')) return 'simulated'
  if (source.startsWith('operator') || source.startsWith('user:')) return 'manual'
  if (source.startsWith('invoice:') || source.startsWith('import:')) return 'verified'
  return 'estimated'
}

export interface LedgerRowLike {
  kind: string
  source: string
  amountCents: number
}

export interface ProvenanceSplit {
  /** Signed totals per provenance, in cents. */
  totals: Record<Provenance, number>
  /** Absolute money moved per provenance — what decides whether a marking is shown. */
  magnitudes: Record<Provenance, number>
  /** The weakest provenance present, or null when the ledger is empty. */
  weakest: Provenance | null
  /** Which provenances appear at all, weakest first. */
  present: Provenance[]
  rowCount: number
}

/**
 * Split a ledger into what each part of it is worth.
 *
 * Magnitudes are absolute because a simulated revenue row and a simulated cost row
 * of the same size net to zero, and "no simulated money here" would be exactly the
 * wrong conclusion to draw from that.
 */
export function splitByProvenance(rows: readonly LedgerRowLike[]): ProvenanceSplit {
  const totals: Record<Provenance, number> = {
    simulated: 0,
    estimated: 0,
    manual: 0,
    verified: 0,
  }
  const magnitudes: Record<Provenance, number> = {
    simulated: 0,
    estimated: 0,
    manual: 0,
    verified: 0,
  }

  for (const row of rows) {
    const p = provenanceOf(row.kind, row.source)
    totals[p] += row.amountCents
    magnitudes[p] += Math.abs(row.amountCents)
  }

  const present = (Object.keys(totals) as Provenance[])
    .filter((p) => magnitudes[p] > 0)
    .sort((a, b) => PROVENANCE_RANK[a] - PROVENANCE_RANK[b])

  return {
    totals,
    magnitudes,
    weakest: present[0] ?? null,
    present,
    rowCount: rows.length,
  }
}

/**
 * What the dashboard should say about its own money figures.
 *
 * Computed rather than written, because the sentence that was written stopped being
 * true the moment a seed inserted a revenue row, and nothing about a hardcoded
 * paragraph notices that.
 */
export function describeLedgerTrust(split: ProvenanceSplit): string {
  if (split.rowCount === 0) {
    return 'The ledger is empty, so every money figure above is zero because there is nothing in it — not because the business broke even.'
  }

  const parts: string[] = []
  if (split.magnitudes.simulated > 0) {
    parts.push(
      `$${(split.magnitudes.simulated / 100).toFixed(2)} of it is SIMULATED — invented demo data describing money that never moved`,
    )
  }
  if (split.magnitudes.estimated > 0) {
    parts.push(
      `$${(split.magnitudes.estimated / 100).toFixed(2)} is ESTIMATED, priced from a rate table rather than billed`,
    )
  }
  if (split.magnitudes.manual > 0) {
    parts.push(`$${(split.magnitudes.manual / 100).toFixed(2)} was entered by hand`)
  }
  if (split.magnitudes.verified > 0) {
    parts.push(
      `$${(split.magnitudes.verified / 100).toFixed(2)} is VERIFIED against an invoice or an imported transaction`,
    )
  }

  const trail =
    split.magnitudes.verified > 0
      ? ''
      : ' Nothing in this ledger has been verified against an invoice, and no revenue here has been earned.'

  return `Money figures above sum the whole ledger: ${parts.join('; ')}.${trail}`
}
