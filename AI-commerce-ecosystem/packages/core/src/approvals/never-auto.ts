/**
 * The hard-coded never-auto list (SPEC.md §Approval gate).
 *
 * These checks run BEFORE the graduated-autonomy check, so a category that has earned
 * auto-approval still cannot auto-send a refund, a big price change, a December
 * delivery promise, or anything flagged as high IP risk.
 *
 * Design note: every predicate here is deliberately over-broad. A false positive costs
 * the operator ten seconds in the inbox; a false negative sends a customer a promise
 * the shop cannot keep, or publishes a design that draws a takedown. When in doubt,
 * these return a reason.
 */

import type { ApprovalRequest } from './types.js'

/** Price moves larger than this must be an operator action, never an agent's. */
export const MAX_AGENT_PRICE_CHANGE_PCT = 15

/**
 * Words that mean a human needs to read the message, whatever the classifier decided
 * (SPEC.md §Support auto-send rule).
 */
const ESCALATION_TERMS: Array<[RegExp, string]> = [
  [/\blawyer|attorney|legal action|sue\b|suing|solicitor\b/i, 'message mentions legal action'],
  [/\bchargeback|charge back|dispute(d)? the charge|bank dispute\b/i, 'message mentions a chargeback'],
  [/\bwrong (item|product|size|color|colour|order)\b|\bnot what i ordered\b/i, 'message reports a wrong item'],
  [/\bdamaged?|broken|cracked|smashed|defect(ive)?|tear|torn|stained?\b/i, 'message reports damage'],
]

/**
 * Delivery-date promises in the December gift window.
 *
 * Matches a delivery verb near a December/Christmas reference in either order, so both
 * "it will arrive before Christmas" and "by Christmas you will have it" are caught.
 */
const DELIVERY_VERB = String.raw`arriv\w*|deliver\w*|ship\w*|get it|have it|receive\w*|be there|show up|in time`
const DECEMBER_REF = String.raw`christmas|xmas|dec(?:ember|\.)?\b|the 25th|holidays?\b|new year`
const DECEMBER_PROMISE = new RegExp(
  `(?:${DELIVERY_VERB})[^.!?]{0,60}(?:${DECEMBER_REF})|(?:${DECEMBER_REF})[^.!?]{0,60}(?:${DELIVERY_VERB})`,
  'i',
)

/** Pull candidate free text out of an unknown payload without trusting its shape. */
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

/**
 * Returns a human-readable reason this request must go to the operator, or `null` if
 * the normal graduated-autonomy rules may apply.
 */
export function neverAutoReason(req: ApprovalRequest): string | null {
  const { kind, payload } = req

  // Opening a shop commits a domain, a plan fee and a brand. Always an operator call.
  if (kind === 'shop_proposal') return 'opening a shop is always an operator decision'

  // High IP risk, whatever the kind it is attached to.
  if (fieldOf(payload, 'ipRisk') === 'high' || fieldOf(payload, 'ip_risk') === 'high') {
    return 'concept is flagged ip_risk=high'
  }

  if (kind === 'price_change') {
    const pct = fieldOf(payload, 'pctChange') ?? fieldOf(payload, 'pct_change')
    // An unreadable or missing percentage is treated as too large, not as zero.
    if (typeof pct !== 'number' || !Number.isFinite(pct)) {
      return 'price change percentage is missing or not a number'
    }
    if (Math.abs(pct) > MAX_AGENT_PRICE_CHANGE_PCT) {
      return `price change of ${pct}% exceeds the ${MAX_AGENT_PRICE_CHANGE_PCT}% agent limit`
    }
  }

  if (kind === 'reply') {
    const intent = fieldOf(payload, 'intent')
    if (intent === 'refund') return 'refunds are always an operator decision'
    if (intent === 'complaint') return 'complaints are always an operator decision'
    if (intent === 'custom') return 'custom requests are always an operator decision'

    // Scan both the customer's message and the agent's draft: the draft is what would
    // be sent, the inbound message is what decides whether a human must read it.
    const inbound = textOf(payload, ['customerMessage', 'customer_message', 'messageBody', 'body'])
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
