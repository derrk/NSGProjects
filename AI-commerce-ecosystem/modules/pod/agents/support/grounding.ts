/**
 * Checking a drafted reply against what is actually known about the order.
 *
 * The system prompt tells the support agent to make no claim the order record does
 * not support. That is the right instruction and it is not enough: a model asked to
 * be reassuring will reassure, and the sentence it invents to do it — "this should
 * reach you by Friday" — is the one that generates the complaint it was trying to
 * prevent.
 *
 * So the prompt asks and this refuses.
 *
 * WHAT THE FIRST VERSION GOT WRONG, AND WHY IT IS WORTH KNOWING
 * Every check here was originally a tight regex written from one example phrasing,
 * and each one missed the most natural way to say the exact thing it existed to
 * catch. A single ordinary draft — "It's on its way, tracking 9400 1000 0000 0000,
 * expect it next week, I've gone ahead and refunded the shipping" — returned zero
 * problems against an order that was still in production with no tracking and no
 * refund. Four checks, four misses, one clean draft. The tests all passed because
 * each test used the literal string its own regex had been written from.
 *
 * The lesson is in the preamble that was already here and was not being honoured: a
 * false positive costs the operator a glance, a false negative costs a refund and a
 * review. So these checks are deliberately over-broad now. They work on sentences
 * rather than character windows, they normalise before comparing, and where a
 * grounded phrasing has to be allowed through it is allowed by matching the RECORD,
 * never by narrowing the pattern.
 */

export type Remedy = 'refund' | 'replacement' | 'discount'

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
  /**
   * Which remedies a human has actually decided on, if any.
   *
   * Scoped per remedy rather than one boolean. A single approved partial refund
   * previously unlocked every money claim in the draft, so "we have refunded you in
   * full and we'll send a replacement free" passed on the strength of a decision
   * about neither.
   */
  decidedRemedies: readonly Remedy[]
}

export interface GroundingProblem {
  check: string
  message: string
  /** `blocking` stops publication. `warning` is shown to the operator. */
  severity: 'blocking' | 'warning'
}

/* ------------------------------------------------------------------ *
 * Vocabulary
 * ------------------------------------------------------------------ */

/** Anything that refers to the parcel reaching the customer. */
const DELIVERY_LANGUAGE =
  /\b(arriv\w*|deliver\w*|be there|reach(es|ing)? you|with you|get(s|ting)? to you|in your hands|at your door|land(s|ing)?|show up|turn up|expect (it|your|them|delivery)|receiv(e|ing) (it|them|your))\b/i

/**
 * Any forward-looking time expression.
 *
 * Broad on purpose. The first version listed weekdays and holidays and therefore
 * could not see "tomorrow", "next week", "within a week", "3-5 business days" or
 * "within 5 days" — which is most of how a model actually phrases this.
 */
const FUTURE_TIME =
  /\b(\d+\s*(?:[-–]|to)\s*\d+\s*(?:business\s+)?(?:day|week|month)s?|\d+\s*(?:business\s+)?(?:day|week|month)s?|a (?:few )?(?:day|week|month)s?|tomorrow|tonight|next (?:week|month|year|mon|tues|wednes|thurs|fri|satur|sun)\w*|this (?:week|month|mon|tues|wednes|thurs|fri|satur|sun)\w*|(?:mon|tues|wednes|thurs|fri|satur|sun)day|christmas|xmas|new year|valentine\w*|mother'?s day|father'?s day|the holidays?|\d{1,2}(?:st|nd|rd|th)\b|shortly|soon|any day now)\b/i

/** Marks a sentence as being about the past, where a time figure is elapsed, not promised. */
const PAST_MARKER =
  /\b(ago|placed|ordered|since|was placed|has been \d+|last (?:week|month)|yesterday|already passed)\b/i

/** A money or goods remedy, in any phrasing. */
const REMEDY_WORDS: Array<{ remedy: Remedy; pattern: RegExp }> = [
  {
    remedy: 'refund',
    pattern: /\b(refund\w*|reimburs\w*|money back|credit(ed|ing)?\b|repaid)\b/i,
  },
  {
    remedy: 'replacement',
    pattern:
      /\b(replac\w*|send\w*\s+(?:you\s+)?(?:out\s+)?another|new one|second one|reship\w*)\b/i,
  },
  {
    remedy: 'discount',
    pattern: /\b(discount\w*|comp(?:ed|ing)?\b|at no (?:cost|charge)|free of charge|on us|waive\w*)\b/i,
  },
]

/**
 * A commitment, as opposed to a mention.
 *
 * "If you would like a refund, someone will look" is a mention, and a good support
 * reply contains it. "I've gone ahead and refunded it" is a commitment. The first
 * version required the pronoun to sit immediately before the verb, so every natural
 * commitment escaped; matching any `will` anywhere goes too far the other way and
 * refuses the sentence that points the customer at a human.
 *
 * So: a first-person actor, or a completed passive, within sight of the remedy word.
 */
const ACTOR = /\b(we|i|us|our|i'?ve|we'?ve|i'?ll|we'?ll|i'?m|we'?re)\b/i
const PASSIVE_DONE = /\b(?:has|have|had)\s+been\b|\bgone ahead\b/i
const COMMITMENT_WINDOW = 60

/** A claim that the parcel has left. */
const SHIPPED_CLAIM =
  /\b(?:has|have|was|were|is|are|been)\s+(?:been\s+)?(?:shipped|dispatched|posted|sent|mailed)\b|\bshipped\s+(?:out|on|yesterday|today|this|last|already)\b|\b(?:is|it'?s|its)\s+on\s+(?:its|the|it'?s)\s+way\b|\bon\s+(?:its|the)\s+way\b|\bin\s+transit\b|\bout\s+for\s+delivery\b|\bleft\s+(?:our|the)\s+\w+|\bdispatched\b|\bhanded\s+(?:it\s+)?(?:over|off|to)\b/i

/** Certainty the record cannot support. */
const OVERCLAIM =
  /\b(guarantee\w*|definitely|certainly will|I promise|we promise|no doubt|rest assured)\b/i

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Join digits split by spaces or dashes.
 *
 * "9400 1000 0000 0000" is how USPS prints a tracking number and how a model will
 * write one. Scanning the raw text for a run of ten alphanumerics never saw it, so
 * an invented number in the customary format was never compared against the record
 * at all. Only digit-to-digit separators are closed, so ordinary prose is untouched.
 */
function joinSplitDigits(text: string): string {
  return text.replace(/(?<=\d)[  \-–](?=\d)/g, '')
}

function normaliseId(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

/** Every "N days/weeks/months" figure in a sentence, as days. */
function dayFigures(sentence: string): number[] {
  const out: number[] = []
  const re = /(\d+)\s*(?:[-–]|to)\s*(\d+)\s*(?:business\s+)?(day|week|month)s?|(\d+)\s*(?:business\s+)?(day|week|month)s?/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(sentence)) !== null) {
    if (m[1] && m[2]) {
      out.push(Number(m[1]), Number(m[2]))
    } else if (m[4]) {
      out.push(Number(m[4]))
    }
  }
  return out
}

/** True when the sentence quotes the recorded range with both ends. */
function quotesFullRange(sentence: string, min: number, max: number): boolean {
  const pattern = new RegExp(`\\b${min}\\s*(?:[-–]|to|and)\\s*${max}\\b`)
  return pattern.test(sentence)
}

/* ------------------------------------------------------------------ *
 * The check
 * ------------------------------------------------------------------ */

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
  const add = (check: string, severity: GroundingProblem['severity'], message: string) => {
    if (problems.some((p) => p.check === check && p.message === message)) return
    problems.push({ check, severity, message })
  }

  if (!text) {
    return [{ check: 'draft.empty', message: 'The draft is empty.', severity: 'blocking' }]
  }

  const hasRange = facts.leadTimeDaysMin !== null && facts.leadTimeDaysMax !== null

  for (const sentence of sentences(text)) {
    const isPast = PAST_MARKER.test(sentence)

    /*
     * A delivery claim with any future time attached.
     *
     * The one allowed shape is quoting the recorded lead-time range in full, which
     * is grounded. Everything else — a weekday, a holiday, "next week", "within a
     * week", a single end of the range — is a date the record cannot support.
     */
    if (!isPast && DELIVERY_LANGUAGE.test(sentence) && FUTURE_TIME.test(sentence)) {
      const grounded =
        hasRange && quotesFullRange(sentence, facts.leadTimeDaysMin!, facts.leadTimeDaysMax!)
      if (!grounded) {
        add(
          'promise.arrival',
          'blocking',
          'This attaches a time to the parcel arriving. Tracking shows what it shows, and ' +
            'the only timing the record supports is the full quoted range. Anything else is a ' +
            'guess with the customer’s expectations attached.',
        )
      }
    }

    /*
     * A day figure that is not in the record.
     *
     * Checked separately from the arrival promise because "allow 5 days" carries no
     * delivery verb at all. The previous version only compared against the MINIMUM,
     * so a figure below the range — a number appearing in no field of the order —
     * passed, while the truthful minimum was refused. That is backwards against this
     * codebase's own provenance rule.
     */
    if (!isPast && hasRange) {
      const min = facts.leadTimeDaysMin!
      const max = facts.leadTimeDaysMax!
      const figures = dayFigures(sentence)
      const full = quotesFullRange(sentence, min, max)

      for (const figure of figures) {
        if (full && (figure === min || figure === max)) continue
        if (figure < min) {
          add(
            'leadtime.invented',
            'blocking',
            `The draft quotes ${figure} days, which is faster than anything the record ` +
              `supports. The quoted range is ${min}–${max} days.`,
          )
        } else if (figure === min || figure === max) {
          add(
            'leadtime.optimistic',
            'blocking',
            `The draft quotes one end of the lead time. Quote both: ${min}–${max} days.`,
          )
        } else if (figure > max) {
          add(
            'leadtime.invented',
            'warning',
            `The draft quotes ${figure} days, which is outside the recorded ${min}–${max} range.`,
          )
        } else {
          add(
            'leadtime.invented',
            'blocking',
            `The draft quotes ${figure} days, which is not a figure the record contains. ` +
              `The quoted range is ${min}–${max} days.`,
          )
        }
      }
    }

    // A commitment of money or goods, scoped to what a human actually decided.
    for (const { remedy, pattern } of REMEDY_WORDS) {
      const match = pattern.exec(sentence)
      if (!match) continue
      if (facts.decidedRemedies.includes(remedy)) continue

      const from = Math.max(0, match.index - COMMITMENT_WINDOW)
      const window = sentence.slice(from, match.index + match[0].length + COMMITMENT_WINDOW)
      if (!ACTOR.test(window) && !PASSIVE_DONE.test(window)) continue

      add(
        'promise.money',
        'blocking',
        `This commits to a ${remedy}, and no ${remedy} is recorded as decided on this ` +
          'order. Money and goods are the operator’s call.',
      )
    }

    // A claim that it shipped, when the record has no shipping date.
    if (!facts.shippedAt && SHIPPED_CLAIM.test(sentence)) {
      add(
        'status.not_shipped',
        'blocking',
        `The draft says the order is on its way, but the record has it as "${facts.status}" ` +
          'with no shipping date.',
      )
    }
  }

  if (OVERCLAIM.test(text)) {
    add(
      'promise.certainty',
      'warning',
      'This states a certainty the order record cannot support.',
    )
  }

  /*
   * Tracking numbers.
   *
   * A wrong one is worse than none: the customer checks it, sees someone else's
   * parcel or nothing at all, and now has two problems. Compared against the record
   * after closing digit-to-digit separators and folding case, because the customary
   * printed form of a tracking number has spaces in it and the first version could
   * not see a single one of them.
   */
  const scannable = joinSplitDigits(text)
  const recordTracking = facts.trackingNumber ? normaliseId(facts.trackingNumber) : null
  const recordOrder = normaliseId(facts.orderNumber)

  for (const candidate of scannable.match(/\b[A-Za-z0-9]{10,}\b/g) ?? []) {
    // Tracking numbers carry digits; a long ordinary word does not.
    if (!/\d/.test(candidate)) continue
    const normalised = normaliseId(candidate)
    // A substring of the real number is part of the real number, not an invented
    // one — which is how "DEMO 9400 1000 0000" reads when the record holds it
    // unbroken. Candidates are at least ten characters, so this cannot whitelist a
    // coincidence.
    if (recordTracking && recordTracking.includes(normalised)) continue
    if (normalised === recordOrder) continue
    add(
      'tracking.unknown',
      'blocking',
      recordTracking
        ? `The draft quotes "${candidate}", which is not this order’s tracking number (${facts.trackingNumber}).`
        : `The draft quotes "${candidate}" as an identifier. This order has no tracking number recorded.`,
    )
  }

  // The order number is what lets the customer and the operator talk about the same
  // thing. A reply without it costs a round trip.
  if (!normaliseId(text).includes(recordOrder)) {
    add('reference.missing', 'warning', `The draft does not mention order ${facts.orderNumber}.`)
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
