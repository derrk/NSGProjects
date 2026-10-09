/**
 * Checking a drafted reply against what is actually known about the order.
 *
 * The system prompt tells the support agent to make no claim the order record does
 * not support. That is the right instruction and it is not enough: a model asked to
 * be reassuring will reassure, and the sentence it invents to do it — "this should
 * reach you by Friday" — is the one that generates the complaint it was trying to
 * prevent.
 *
 * So the prompt asks and this refuses. Everything here is deterministic and runs on
 * the drafted text before it is filed for the operator, which means a reply that
 * promises a date fails a check instead of reaching a customer.
 *
 * These are blunt instruments. They catch the claims that cost money and let through
 * plenty of imprecise prose, which is the right trade: a false positive costs the
 * operator a glance, and a false negative costs a refund and a review.
 */

export interface OrderFacts {
  orderNumber: string
  /** What the record says, exactly. Nothing else may be asserted. */
  status: string
  placedAt: Date
  /** Null until the supplier actually ships. */
  shippedAt: Date | null
  carrier: string | null
  trackingNumber: string | null
  /** The quoted range, both ends. */
  leadTimeDaysMin: number | null
  leadTimeDaysMax: number | null
  items: Array<{ sku: string; title: string; quantity: number }>
  /** Whether a human has already decided a refund. Agents never decide one. */
  refundDecided: boolean
}

export interface GroundingProblem {
  check: string
  message: string
  severity: 'blocking' | 'warning'
}

/**
 * A promised arrival.
 *
 * Deliberately matches the shapes a model reaches for when it wants to be helpful —
 * a weekday, a date, a holiday, a number of days — rather than trying to parse the
 * sentence. Tracking shows what it shows; everything else is a guess with a
 * customer's expectations attached.
 */
const ARRIVAL_PROMISE =
  /\b(arrive|arrives|arriving|deliver|delivered|delivery|be there|reach you|with you|get to you|in your hands)\b[^.!?]{0,60}\b(by|before|on|within|in)\b[^.!?]{0,40}\b(mon|tues|wednes|thurs|fri|satur|sun)day\b|\b(arrive|arrives|arriving|deliver|delivered|delivery|be there|reach you|with you)\b[^.!?]{0,60}\b(by|before|on)\b[^.!?]{0,40}(christmas|xmas|new year|valentine|mother'?s day|father'?s day|the holidays?|\d{1,2}(st|nd|rd|th)?\b)/i

/** A commitment about money, which is the operator's to make. */
const MONEY_PROMISE =
  /\b(we(?:'ll| will| have| 've)?|I(?:'ll| will| have| 've)?)\s+(?:already\s+)?(refund|refunded|reimburse|reimbursed|credit|credited|issue[d]? (?:a|the) refund|sen[dt] (?:a|you a) replacement|replac(?:e|ed|ing) it free)\b/i

/** Certainty the record cannot support. */
const OVERCLAIM =
  /\b(guarantee|guaranteed|definitely|certainly will|I promise|we promise|no doubt|rest assured it will)\b/i

/**
 * Check a draft.
 *
 * `blocking` means the draft must not be filed as-is. `warning` means file it with
 * the note attached — the operator is reading it anyway, and burying a soft concern
 * under a hard refusal teaches them to click past both.
 */
export function checkReplyGrounding(draft: string, facts: OrderFacts): GroundingProblem[] {
  const problems: GroundingProblem[] = []
  const text = draft.trim()

  if (!text) {
    return [{ check: 'draft.empty', message: 'The draft is empty.', severity: 'blocking' }]
  }

  if (ARRIVAL_PROMISE.test(text)) {
    problems.push({
      check: 'promise.arrival',
      severity: 'blocking',
      message:
        'This promises an arrival date. Tracking shows what it shows; anything beyond ' +
        'it is a guess with the customer’s expectations attached.',
    })
  }

  if (MONEY_PROMISE.test(text) && !facts.refundDecided) {
    problems.push({
      check: 'promise.money',
      severity: 'blocking',
      message:
        'This commits to a refund or a replacement, and no such decision is recorded ' +
        'on the order. Money is the operator’s call.',
    })
  }

  if (OVERCLAIM.test(text)) {
    problems.push({
      check: 'promise.certainty',
      severity: 'warning',
      message: 'This states a certainty the order record cannot support.',
    })
  }

  /*
   * Tracking numbers.
   *
   * A wrong one is worse than none: the customer checks it, sees someone else's
   * parcel or nothing at all, and now has two problems. Long digit runs are compared
   * against the record rather than trusted.
   */
  const quotedNumbers = text.match(/\b[A-Z0-9]{10,}\b/g) ?? []
  for (const quoted of quotedNumbers) {
    if (facts.trackingNumber && quoted === facts.trackingNumber) continue
    if (quoted === facts.orderNumber) continue
    problems.push({
      check: 'tracking.unknown',
      severity: 'blocking',
      message: facts.trackingNumber
        ? `The draft quotes "${quoted}", which is not this order’s tracking number (${facts.trackingNumber}).`
        : `The draft quotes "${quoted}" as an identifier. This order has no tracking number recorded.`,
    })
  }

  // Claiming it shipped when the record does not say so.
  if (!facts.shippedAt && /\b(has shipped|is on its way|on the way|dispatched|left our)\b/i.test(text)) {
    problems.push({
      check: 'status.not_shipped',
      severity: 'blocking',
      message:
        `The draft says the order is on its way, but the record has it as "${facts.status}" ` +
        'with no shipping date.',
    })
  }

  /*
   * A lead time quoted at its optimistic end.
   *
   * "Ships in 7 days" to a customer whose parcel takes 21 is the single most common
   * self-inflicted support ticket in dropshipping, and it reads as helpful right up
   * until it is not.
   */
  if (facts.leadTimeDaysMin !== null && facts.leadTimeDaysMax !== null) {
    const mentionsMin = new RegExp(`\\b${facts.leadTimeDaysMin}\\s*(?:-|–|to|business )?\\s*days?\\b`, 'i')
    const mentionsRange = new RegExp(`\\b${facts.leadTimeDaysMin}\\s*[-–]\\s*${facts.leadTimeDaysMax}\\b`)
    if (mentionsMin.test(text) && !mentionsRange.test(text) && !text.includes(String(facts.leadTimeDaysMax))) {
      problems.push({
        check: 'leadtime.optimistic',
        severity: 'blocking',
        message:
          `The draft quotes ${facts.leadTimeDaysMin} days but the range is ` +
          `${facts.leadTimeDaysMin}–${facts.leadTimeDaysMax}. Quote both ends.`,
      })
    }
  }

  // The order number is what lets the customer and the operator talk about the same
  // thing. A reply without it costs a round trip.
  if (!text.includes(facts.orderNumber)) {
    problems.push({
      check: 'reference.missing',
      severity: 'warning',
      message: `The draft does not mention order ${facts.orderNumber}.`,
    })
  }

  return problems
}

/** True when nothing blocking stands in the way of filing the draft. */
export function mayFileReply(draft: string, facts: OrderFacts): boolean {
  return !checkReplyGrounding(draft, facts).some((p) => p.severity === 'blocking')
}

/* ------------------------------------------------------------------ *
 * Intent
 * ------------------------------------------------------------------ */

export type SupportIntent =
  | 'where_is_it'
  | 'damaged_or_wrong'
  | 'cancel_or_change'
  | 'refund_request'
  | 'personalization_question'
  | 'product_question'
  | 'other'

/**
 * Which intents an agent may draft a reply for at all.
 *
 * The excluded ones are not harder to write — they are decisions. A refund, a
 * cancellation and a damage claim each commit the operator to something, and an
 * agent drafting a plausible reply to one of them makes the wrong answer easy to
 * send by reflex.
 */
export const DRAFTABLE_INTENTS: ReadonlySet<SupportIntent> = new Set<SupportIntent>([
  'where_is_it',
  'personalization_question',
  'product_question',
])

export function isDraftable(intent: SupportIntent): boolean {
  return DRAFTABLE_INTENTS.has(intent)
}
