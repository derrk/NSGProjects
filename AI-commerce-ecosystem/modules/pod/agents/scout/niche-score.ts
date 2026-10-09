/**
 * Scoring a niche, and refusing the ones that are not evidence.
 *
 * The scout's whole value is that it reports what is already selling rather than
 * what sounds plausible, and a model asked for evidence will produce something
 * evidence-shaped whether or not it looked. So the scoring lives here, in code, and
 * the first thing it does is throw out candidates whose numbers have no source.
 *
 * The weighting is opinionated and says so. IP safety is not weighted at all — it is
 * a gate, because a niche that cannot be sold into safely is not a worse niche, it is
 * not a niche. Giftability outranks raw demand, because this is a print-on-demand
 * gift shop and the buyer is usually not the person the item is for.
 */

import { checkIpRisk, ipRiskLevel, type BlockedPhrase, type IpFinding } from '../../ip-risk'

/** One claim, and where it came from. */
export interface Evidence {
  claim: string
  /** The page it was read off. A claim with no url is a claim somebody made up. */
  url: string
  /** When it was retrieved, ISO date. Figures go stale. */
  retrievedAt: string
}

export interface NicheCandidate {
  name: string
  keywords: string[]
  audience: string
  /** Why now — a season, an event, a trend. Null when there is no timing argument. */
  whyNow: string | null
  /**
   * What the scout found, each piece sourced.
   *
   * Deliberately not numbers-with-optional-citations. A figure that can exist
   * without a url is a figure that will.
   */
  evidence: Evidence[]
  /** 0-100, how strong the demand signal looks. The scout's own read. */
  demandSignal: number
  /** 0-100, how crowded it is. Higher means MORE competition. */
  competition: number
  /** 0-100, how well it works as a gift bought by somebody else. */
  giftability: number
}

export type RejectionReason =
  | 'no-evidence'
  | 'unsourced-evidence'
  | 'stale-evidence'
  | 'ip-blocked'
  | 'out-of-range'

export interface RejectedNiche {
  name: string
  reason: RejectionReason
  detail: string
  /** Present when the rejection was an IP block, so the operator sees what matched. */
  ipFindings?: IpFinding[]
}

export interface ScoredNiche {
  name: string
  keywords: string[]
  audience: string
  whyNow: string | null
  score: number
  breakdown: Array<{ factor: string; points: number; note: string }>
  /** Every url the scout cited, deduped. Written to niches.source_urls. */
  sourceUrls: string[]
  ipRisk: 'low' | 'medium' | 'high'
  /** Non-blocking IP concerns, carried so the operator sees them on the card. */
  ipWarnings: IpFinding[]
  /** What the scout is least sure about. Always present; "nothing" is not an option. */
  weakestLink: string
}

export interface ScoreNichesInput {
  candidates: readonly NicheCandidate[]
  blocked: readonly BlockedPhrase[]
  /** Evidence older than this is not evidence. */
  now: Date
  maxEvidenceAgeDays?: number
}

export interface ScoreNichesResult {
  accepted: ScoredNiche[]
  rejected: RejectedNiche[]
}

const WEIGHTS = {
  giftability: 35,
  demand: 30,
  headroom: 25,
  timing: 10,
} as const

/** Ninety days. A search-volume figure from last year is a story, not a signal. */
const DEFAULT_MAX_EVIDENCE_AGE_DAYS = 90

/** At least this many sourced claims, or there is nothing to decide on. */
const MIN_EVIDENCE = 2

function inRange(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 100
}

/**
 * A url that could actually be fetched.
 *
 * Checked rather than trusted because "source: industry reports" and
 * "https://example.com/made-up" are the two things a model produces when asked for a
 * citation it does not have, and only one of them is caught by requiring a non-empty
 * string.
 */
function looksLikeUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value.trim())) return false
  try {
    const url = new URL(value.trim())
    return url.hostname.includes('.') && !url.hostname.endsWith('.')
  } catch {
    return false
  }
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000)
}

/**
 * Score a batch of candidates.
 *
 * Returns accepted AND rejected, because what the scout threw away is as much of its
 * output as what it kept — an operator who only sees survivors cannot tell a careful
 * run from one that found nothing and said so quietly.
 */
export function scoreNiches(input: ScoreNichesInput): ScoreNichesResult {
  const maxAgeDays = input.maxEvidenceAgeDays ?? DEFAULT_MAX_EVIDENCE_AGE_DAYS
  const accepted: ScoredNiche[] = []
  const rejected: RejectedNiche[] = []

  for (const candidate of input.candidates) {
    const name = (candidate.name ?? '').trim()
    if (!name) continue

    /*
     * The IP gate, before anything else.
     *
     * Not a scoring factor. A niche that cannot be sold into safely is not a worse
     * niche; weighting it would let a strong demand signal buy its way past a
     * registered mark.
     */
    const ipFindings = checkIpRisk({
      text: [name, candidate.audience, candidate.whyNow, ...(candidate.keywords ?? [])]
        .filter(Boolean)
        .join('\n'),
      blocked: input.blocked,
    })
    const blocking = ipFindings.filter((f) => f.severity === 'blocking')
    if (blocking.length > 0) {
      rejected.push({
        name,
        reason: 'ip-blocked',
        detail: blocking.map((f) => f.message).join(' '),
        ipFindings: blocking,
      })
      continue
    }

    const evidence = candidate.evidence ?? []
    if (evidence.length < MIN_EVIDENCE) {
      rejected.push({
        name,
        reason: 'no-evidence',
        detail: `${evidence.length} sourced claim(s); at least ${MIN_EVIDENCE} are needed to decide anything.`,
      })
      continue
    }

    const unsourced = evidence.filter((e) => !looksLikeUrl(e.url ?? ''))
    if (unsourced.length > 0) {
      rejected.push({
        name,
        reason: 'unsourced-evidence',
        detail:
          `${unsourced.length} claim(s) have no usable source url, e.g. ` +
          `"${(unsourced[0]!.claim ?? '').slice(0, 60)}". A figure with no source is a figure ` +
          'somebody made up.',
      })
      continue
    }

    const stale = evidence.filter((e) => {
      const at = new Date(e.retrievedAt)
      if (Number.isNaN(at.getTime())) return true
      return daysBetween(input.now, at) > maxAgeDays
    })
    if (stale.length > 0) {
      rejected.push({
        name,
        reason: 'stale-evidence',
        detail: `${stale.length} claim(s) are older than ${maxAgeDays} days or carry no usable date.`,
      })
      continue
    }

    if (
      !inRange(candidate.demandSignal) ||
      !inRange(candidate.competition) ||
      !inRange(candidate.giftability)
    ) {
      rejected.push({
        name,
        reason: 'out-of-range',
        detail: 'One of demandSignal, competition or giftability is outside 0-100.',
      })
      continue
    }

    // Headroom, not competition: a crowded niche scores low here rather than being
    // penalised somewhere invisible.
    const headroom = 100 - candidate.competition

    const breakdown = [
      {
        factor: 'Giftability',
        points: Math.round((WEIGHTS.giftability * candidate.giftability) / 100),
        note: 'The buyer is usually not the person it is for.',
      },
      {
        factor: 'Demand signal',
        points: Math.round((WEIGHTS.demand * candidate.demandSignal) / 100),
        note: `${evidence.length} sourced claim(s)`,
      },
      {
        factor: 'Headroom',
        points: Math.round((WEIGHTS.headroom * headroom) / 100),
        note: `${candidate.competition}/100 competition`,
      },
      {
        factor: 'Timing',
        points: candidate.whyNow?.trim() ? WEIGHTS.timing : 0,
        note: candidate.whyNow?.trim() ? candidate.whyNow.trim() : 'no timing argument offered',
      },
    ].sort((a, b) => b.points - a.points)

    accepted.push({
      name,
      keywords: [...new Set((candidate.keywords ?? []).map((k) => k.trim()).filter(Boolean))],
      audience: candidate.audience,
      whyNow: candidate.whyNow?.trim() ? candidate.whyNow.trim() : null,
      score: breakdown.reduce((sum, b) => sum + b.points, 0),
      breakdown,
      sourceUrls: [...new Set(evidence.map((e) => e.url.trim()))],
      ipRisk: ipRiskLevel(ipFindings),
      ipWarnings: ipFindings,
      // The weakest factor, named. A scout that reports only what it is confident
      // about is reporting less than it knows.
      weakestLink: `${breakdown[breakdown.length - 1]!.factor} — ${breakdown[breakdown.length - 1]!.note}`,
    })
  }

  accepted.sort((a, b) => b.score - a.score)
  return { accepted, rejected }
}
