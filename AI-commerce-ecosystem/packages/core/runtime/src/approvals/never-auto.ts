/**
 * The hard-coded never-auto list (SPEC.md §Guardrails).
 *
 * These run BEFORE the graduated-autonomy check, so a category that has earned
 * auto-approval still cannot auto-run a refund, a large price change, a purchase, a
 * December delivery promise, or anything flagged high IP risk.
 *
 * This is the floor, not the whole rule. A module can mark one of its approval kinds
 * `neverAuto`, and the operator can set `never_auto` on any rule row; both are checked
 * alongside this list.
 *
 * Every predicate is deliberately over-broad. A false positive costs the operator ten
 * seconds in the inbox; a false negative sends a customer a promise the business
 * cannot keep, or publishes something that draws a takedown.
 */

import type { ApprovalRequest } from './types'

/** Price moves larger than this are operator-only, in every module. */
export const MAX_AGENT_PRICE_CHANGE_PCT = 15

/** Approval kinds that are never automatic anywhere in the platform. */
const ALWAYS_OPERATOR_KINDS: Record<string, string> = {
  refund: 'refunds are always an operator decision',
  purchase: 'purchases are always an operator decision',
  buy_lot: 'buying inventory is always an operator decision',
  contract: 'contracts are always an operator decision',
  material_order: 'ordering materials is always an operator decision',
  division_plan: 'creating a division is always an operator decision',
}

/** Words that mean a human must read it, whatever the classifier decided. */
const ESCALATION_TERMS: Array<[RegExp, string]> = [
  [/\blawyer|attorney|legal action|sue\b|suing|solicitor\b/i, 'message mentions legal action'],
  [/\bchargeback|charge back|dispute(d)? the charge|bank dispute\b/i, 'message mentions a chargeback'],
  [/\bwrong (item|product|size|color|colour|order)\b|\bnot what i ordered\b/i, 'message reports a wrong item'],
  [/\bdamaged?|broken|cracked|smashed|defect(ive)?|torn|stained?\b/i, 'message reports damage'],
  /*
   * Harm to a person or an animal.
   *
   * The support agent's own prompt has always told it to send these straight to the
   * operator untouched, and no code implemented that. A message reading "my dog was
   * sick after chewing this, is the coating non-toxic?" classifies as
   * product_question — it is one — passes isDraftable, and gets a reassuring grounded
   * reply about materials. The one thing that must not happen is an agent reassuring
   * somebody about a possible injury.
   */
  [
    /\b(sick|ill|vomit\w*|poison\w*|toxic|non-?toxic|allerg\w*|rash|burn(ed|t|s)?|choke?d?|choking|injur\w*|hurt|wound\w*|hospital|\bvet\b|veterinar\w*|emergency|died|dying|death)\b/i,
    'message mentions harm to a person or an animal',
  ],
  /*
   * Taking it to the platform or the press.
   *
   * Also promised by the prompt and implemented nowhere. A complaint that is about to
   * become public is the operator's to answer in their own words.
   */
  [
    /\b(report(ing|ed)? (you|this|them) to|etsy support|shopify support|trading standards|better business bureau|\bbbb\b|ombudsman|consumer protection|the press|journalist|trustpilot|leave a (one|1)[ -]star)\b/i,
    'message threatens a platform complaint or publicity',
  ],
]

/**
 * Delivery promises in the December gift window.
 *
 * Matches a delivery verb near a December reference in either order, so both "it will
 * arrive before Christmas" and "by Christmas you will have it" are caught.
 */
const DELIVERY_VERB = String.raw`arriv\w*|deliver\w*|ship\w*|get it|have it|receive\w*|be there|show up|in time`
const DECEMBER_REF = String.raw`christmas|xmas|dec(?:ember|\.)?\b|the 25th|holidays?\b|new year`
const DECEMBER_PROMISE = new RegExp(
  `(?:${DELIVERY_VERB})[^.!?]{0,60}(?:${DECEMBER_REF})|(?:${DECEMBER_REF})[^.!?]{0,60}(?:${DELIVERY_VERB})`,
  'i',
)

/**
 * Why an inbound message must reach a person unanswered, or null.
 *
 * Exported so the thing that DRAFTS can consult the same list as the thing that
 * approves. The support agent's prompt has always said a message about harm, a legal
 * threat or a platform complaint goes straight to the operator untouched — and until
 * this existed, nothing stopped it drafting a reassuring reply to one. never-auto
 * only governs whether a draft can skip the human; it cannot stop the draft being
 * written, and a fluent paragraph beside an Approve button is the thing being avoided.
 */
export function inboundEscalationReason(text: string): string | null {
  for (const [pattern, reason] of ESCALATION_TERMS) {
    if (pattern.test(text)) return reason
  }
  return null
}

function textOf(payload: unknown, keys: readonly string[]): string {
  if (typeof payload !== 'object' || payload === null) return ''
  const bag = payload as Record<string, unknown>
  return keys
    .map((k) => bag[k])
    .filter((v): v is string => typeof v === 'string')
    .join('\n')
}

function fieldOf(payload: unknown, key: string): unknown {
  if (typeof payload !== 'object' || payload === null) return undefined
  return (payload as Record<string, unknown>)[key]
}

/** A reason this must go to the operator, or null if the normal rules may apply. */
export function neverAutoReason(req: ApprovalRequest): string | null {
  const { kind, payload } = req

  const alwaysOperator = ALWAYS_OPERATOR_KINDS[kind]
  if (alwaysOperator) return alwaysOperator

  // High IP risk, whatever kind it is attached to.
  if (fieldOf(payload, 'ipRisk') === 'high' || fieldOf(payload, 'ip_risk') === 'high') {
    return 'flagged ip_risk=high'
  }

  if (kind === 'price_change' || kind === 'price_adjust') {
    const pct = fieldOf(payload, 'pctChange') ?? fieldOf(payload, 'pct_change')
    // An unreadable percentage is treated as too large, never as zero.
    if (typeof pct !== 'number' || !Number.isFinite(pct)) {
      return 'price change percentage is missing or not a number'
    }
    if (Math.abs(pct) > MAX_AGENT_PRICE_CHANGE_PCT) {
      return `price change of ${pct}% exceeds the ${MAX_AGENT_PRICE_CHANGE_PCT}% agent limit`
    }
  }

  // Anything that sends words to a person outside the company.
  if (kind === 'reply' || kind === 'outreach_message' || kind === 'proposal') {
    /*
     * A message that tried to give the agent instructions is always a human's to read.
     *
     * The support runner detects prompt injection and logs it rather than escalating,
     * on the reasoning that escalating would hand anyone who can email the shop a
     * switch for turning the agent off. That reasoning is sound, and it rested on a
     * premise nothing enforced: that every reply is read by a human anyway. It is not
     * — `reply` can graduate, and a graduated bucket auto-approves.
     *
     * So the premise is enforced here instead, where it outranks earned autonomy. The
     * sender can cost themselves a human reader and nothing else.
     */
    const injection =
      fieldOf(payload, 'containsAgentInstructions') ??
      fieldOf(payload, 'promptInjectionDetected')
    if (injection === true || injection === 'true') {
      return 'the inbound message contained text addressed to the agent'
    }

    const intent = fieldOf(payload, 'intent')
    if (intent === 'refund') return 'refunds are always an operator decision'
    if (intent === 'complaint') return 'complaints are always an operator decision'
    if (intent === 'custom') return 'custom requests are always an operator decision'

    // The inbound message decides whether a human must read it; the draft is what
    // would actually be sent.
    const inbound = textOf(payload, ['customerMessage', 'customer_message', 'messageBody'])
    const draft = textOf(payload, ['replyBody', 'reply_body', 'draft', 'body'])

    for (const [pattern, reason] of ESCALATION_TERMS) {
      if (pattern.test(inbound)) return reason
    }
    if (DECEMBER_PROMISE.test(draft)) {
      return 'draft appears to promise a December delivery date'
    }
  }

  return null
}
