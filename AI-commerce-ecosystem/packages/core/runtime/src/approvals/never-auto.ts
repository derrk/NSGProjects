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
