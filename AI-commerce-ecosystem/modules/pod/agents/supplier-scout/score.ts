/**
 * Scoring a supplier.
 *
 * The scout proposes; this decides what the proposal is worth. Kept out of the model
 * for the same reason the finance totals are: the ranking of suppliers is the thing
 * the operator acts on, and a score that drifts with the phrasing of a prompt is a
 * score nobody can audit.
 *
 * The weighting is opinionated and says so. Lead time beats price, because a cheap
 * item that arrives in five weeks generates a refund, a review and a support thread,
 * and the margin it saved does not cover any of those. Price is the easiest number
 * to compare and the least predictive of whether the business survives the supplier.
 */

export interface SupplierCandidate {
  key: string
  label: string
  /** Where it ships from. Drives both lead time and duty exposure. */
  shipsFrom: string
  itemCostCents: number
  shippingCostCents: number
  leadTimeDaysMin: number
  leadTimeDaysMax: number
  /** Has anyone here held the product? Nothing goes live without this. */
  samplesInspected: boolean
  /** Does the supplier give tracking that updates? Many do not. */
  providesTracking: boolean
  /** Will they ship without their own branding in the parcel? */
  blindShipping: boolean
  /** Published returns window in days, or null when they have none. */
  returnsWindowDays: number | null
  /** How many months of trading history the operator could find. */
  trackRecordMonths: number | null
  /** Where these claims came from. */
  source: string
}

export interface SupplierScore {
  key: string
  label: string
  /** 0 to 100. Comparable only against other candidates scored the same way. */
  score: number
  /** What drove it, high to low. */
  factors: Array<{ factor: string; points: number; note: string }>
  /** Things that stop this supplier being used at all, regardless of score. */
  blockers: string[]
  /** What the operator should check before committing. */
  openQuestions: string[]
  landedCostCents: number
}

const WEIGHTS = {
  leadTime: 30,
  tracking: 20,
  cost: 20,
  returns: 15,
  trackRecord: 15,
} as const

/** Scaled so a week is excellent and a month is nearly worthless. */
function leadTimePoints(maxDays: number): number {
  if (maxDays <= 7) return WEIGHTS.leadTime
  if (maxDays >= 35) return 0
  return Math.round(WEIGHTS.leadTime * ((35 - maxDays) / 28))
}

/**
 * Cost points, relative to the cheapest candidate in the set.
 *
 * Relative rather than absolute because an absolute scale needs a price band per
 * product category, and inventing one would make the score look more precise than
 * it is.
 */
function costPoints(landed: number, cheapest: number): number {
  if (landed <= cheapest) return WEIGHTS.cost
  const ratio = cheapest / landed
  return Math.round(WEIGHTS.cost * Math.max(0, ratio))
}

function returnsPoints(windowDays: number | null): number {
  if (windowDays === null) return 0
  if (windowDays >= 30) return WEIGHTS.returns
  return Math.round(WEIGHTS.returns * (windowDays / 30))
}

function trackRecordPoints(months: number | null): number {
  if (months === null) return 0
  if (months >= 24) return WEIGHTS.trackRecord
  return Math.round(WEIGHTS.trackRecord * (months / 24))
}

/**
 * Score one candidate against the field.
 *
 * `blockers` are separate from the score on purpose. A supplier nobody has sampled
 * might score 88, and publishing on it would still be a mistake — so the reason is
 * stated rather than folded into a number where it becomes tradeable against a
 * better price.
 */
export function scoreSuppliers(candidates: SupplierCandidate[]): SupplierScore[] {
  if (candidates.length === 0) return []

  const landed = new Map(
    candidates.map((c) => [c.key, c.itemCostCents + c.shippingCostCents] as const),
  )
  const cheapest = Math.min(...landed.values())

  return candidates
    .map((candidate) => {
      const landedCost = landed.get(candidate.key)!

      const factors = [
        {
          factor: 'Lead time',
          points: leadTimePoints(candidate.leadTimeDaysMax),
          note: `${candidate.leadTimeDaysMin}–${candidate.leadTimeDaysMax} days from ${candidate.shipsFrom}`,
        },
        {
          factor: 'Tracking',
          points: candidate.providesTracking ? WEIGHTS.tracking : 0,
          note: candidate.providesTracking
            ? 'Provides tracking'
            : 'No tracking. Every "where is it" becomes a guess.',
        },
        {
          factor: 'Landed cost',
          points: costPoints(landedCost, cheapest),
          note: `$${(landedCost / 100).toFixed(2)} landed`,
        },
        {
          factor: 'Returns',
          points: returnsPoints(candidate.returnsWindowDays),
          note:
            candidate.returnsWindowDays === null
              ? 'No returns window. Every faulty item is ours to eat.'
              : `${candidate.returnsWindowDays}-day window`,
        },
        {
          factor: 'Track record',
          points: trackRecordPoints(candidate.trackRecordMonths),
          note:
            candidate.trackRecordMonths === null
              ? 'No trading history found'
              : `${candidate.trackRecordMonths} months of history`,
        },
      ].sort((a, b) => b.points - a.points)

      const blockers: string[] = []
      if (!candidate.samplesInspected) {
        blockers.push(
          'Nobody has held one of these. Nothing goes live on a supplier whose output ' +
            'has not been inspected, whatever it scores.',
        )
      }
      if (!candidate.providesTracking) {
        blockers.push(
          'No tracking. A customer asking where their parcel is cannot be answered, ' +
            'and the support agent is forbidden from guessing.',
        )
      }

      const openQuestions: string[] = []
      if (candidate.returnsWindowDays === null) {
        openQuestions.push('What happens when an item arrives faulty? No returns policy was found.')
      }
      if (candidate.trackRecordMonths === null) {
        openQuestions.push('How long have they been trading? No history was found.')
      }
      if (!candidate.blindShipping) {
        openQuestions.push(
          'Will they ship without their own branding inside the parcel? If not, the ' +
            'customer learns who really sent it.',
        )
      }
      if (candidate.leadTimeDaysMax > 21) {
        openQuestions.push(
          `A ${candidate.leadTimeDaysMax}-day worst case has to be on the listing, not just in the data.`,
        )
      }

      return {
        key: candidate.key,
        label: candidate.label,
        score: factors.reduce((sum, f) => sum + f.points, 0),
        factors,
        blockers,
        openQuestions,
        landedCostCents: landedCost,
      }
    })
    .sort((a, b) => {
      // A blocked supplier sorts below every usable one however well it scored,
      // because the list is read top-down and the top of it should be actionable.
      if (a.blockers.length !== b.blockers.length) {
        return (a.blockers.length > 0 ? 1 : 0) - (b.blockers.length > 0 ? 1 : 0)
      }
      return b.score - a.score
    })
}

/** The one to use, or null when none is usable. */
export function recommendedSupplier(scores: SupplierScore[]): SupplierScore | null {
  return scores.find((s) => s.blockers.length === 0) ?? null
}
