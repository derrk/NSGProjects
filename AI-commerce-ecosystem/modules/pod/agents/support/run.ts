/**
 * The support deck (SPEC.md §Module 1 → customer messages).
 *
 * One inbound message in; either a drafted reply sitting in the operator's inbox as a
 * `reply` approval, or an escalation carrying the customer's ask and deliberately NO
 * suggested wording.
 *
 * Sending is NOT here, and not anywhere. `send_email` in this system files a draft;
 * there is no code path from this module to a customer's inbox. The replies row and
 * the approval ARE the output, and the human who reads the approval is the one who
 * sends. That is the whole design, not a gap waiting to be filled.
 */

import { inboundEscalationReason } from '@acf/core/approvals'
import type { AgentContext, AgentDefinition } from '@acf/core/runtime'
import { NonRetriableError } from '@acf/core/runtime'
import { MODELS, type ModelClient } from '@acf/integrations/anthropic'
import { eq, inArray } from 'drizzle-orm'

import {
  messages,
  orderLines,
  orders,
  products,
  replies,
  supplierOrders,
  suppliers,
} from '../../schema/index'
import {
  checkReplyGrounding,
  isDraftable,
  type GroundingProblem,
  type OrderFacts,
  type SupportIntent,
} from './grounding'
import { SUPPORT_SYSTEM_PROMPT } from './index'
import { classifyRequest, CLASSIFIER_SYSTEM_PROMPT, draftRequest } from './prompt'
import {
  classificationSchema,
  MAX_FACTS_CITED,
  MAX_REDRAFT_ATTEMPTS,
  messageIdFrom,
  oneLine,
  replyDraftSchema,
  SUPPORT_INTENTS,
  supportOutputSchema,
  validateDraft,
  type SupportInput,
  type SupportOutput,
} from './schema'

type Db = Record<string, unknown>

export interface SupportDeps {
  db: Db
  model: ModelClient
  /**
   * Injected so a run is reproducible. `run()` never reads the wall clock itself: the
   * same message, the same record and the same scripted answers must produce the same
   * rows, or a run cannot be replayed to work out what a customer was told and why.
   */
  now?: () => Date
}

/** The length the inbox card gives the one-line ask before it wraps. */
const SUMMARY_CHARS = 160

/** One grounding problem as one line, so the same text reads the same in all three places. */
function formatProblem(p: GroundingProblem): string {
  return `${p.check}: ${p.message}`
}

/**
 * The autonomy bucket an escalation is filed under.
 *
 * Deliberately NOT the bucket its drafts use. The gate's graduated autonomy is keyed
 * on (kind, category), and `reply/where_is_it` earning auto-approval after twenty good
 * drafts would otherwise also auto-approve the `where_is_it` message that could not be
 * drafted at all — deciding, without a human, the one case whose entire purpose was to
 * reach one. An escalation that auto-approves is an escalation nobody reads.
 *
 * This separates the counters; it does not stop the escalation bucket itself
 * graduating eventually. Marking the `reply` kind `neverAuto` for escalations is the
 * real fix and it lives in module.ts, which is not mine to edit. See the report.
 */
export function escalationCategory(intent: SupportIntent | 'unclassified'): string {
  return `escalation:${intent}`
}

/**
 * The fine intent, mapped onto the coarse `messages.intent` column.
 *
 * These are two different vocabularies and they do not line up, which is worth stating
 * plainly rather than papering over. `messages.intent` was written for an inbox filter:
 * it separates "when does it arrive" from "give me the number" because an operator
 * scanning the queue wants that split. `SupportIntent` was written to answer one
 * question — may an agent draft this at all — so it separates "my parcel is late" from
 * "my parcel arrived broken", which the coarse column lumps together under `complaint`.
 *
 * Two coarse values are therefore unreachable from here. `tracking` is unreachable
 * because `where_is_it` covers both halves of that split and guessing which half a
 * message meant, from a classification that never drew the line, would be inventing a
 * fact about the customer. `sizing` is unreachable because `product_question` covers
 * materials and care as well, and filing a question about fabric weight as a sizing
 * question would quietly corrupt the one report the column exists to feed.
 *
 * `personalization_question` maps to `custom` with a consequence attached: never-auto
 * treats `custom` as always-operator, so these replies can never graduate to automatic
 * approval. For buyer-supplied text on its way to a printer that is the answer we want
 * anyway — it is unrecoverable once it is on the mug.
 */
export function toRecordedIntent(intent: SupportIntent): string {
  switch (intent) {
    case 'where_is_it':
      return 'shipping_eta'
    case 'damaged_or_wrong':
      return 'complaint'
    case 'cancel_or_change':
      return 'custom'
    case 'refund_request':
      return 'refund'
    case 'personalization_question':
      return 'custom'
    case 'product_question':
      return 'other'
    default:
      return 'other'
  }
}

/**
 * Take the classifier at its word only when the word is one we know.
 *
 * Structured outputs drop the enum, so `intent` arrives as free text. An unrecognised
 * value becomes `other`, which is not draftable — a misclassification therefore costs
 * the operator a message to read, never a customer a wrong answer.
 */
export function normaliseIntent(raw: string): SupportIntent | null {
  const cleaned = raw.trim().toLowerCase().replace(/[\s-]+/g, '_')
  const known = SUPPORT_INTENTS.find((i) => i === cleaned)
  return known ?? null
}

export interface FactsResult {
  facts: OrderFacts | null
  /** Why no facts could be built, when none could. */
  reason: string | null
  /** Things the operator should know about the record itself, not about the draft. */
  notes: string[]
  /**
   * False when `placedAt` is the ingestion time standing in for a null `placed_at`.
   *
   * `OrderFacts.placedAt` is typed non-null, so the substitution has to be carried
   * beside the value rather than inside it. Without this the model is handed a date
   * it will treat as the day the customer ordered, and the marking survives only in
   * an operator note the model never sees.
   */
  placedAtRecorded: boolean
}

/**
 * Assemble the record the draft is allowed to cite.
 *
 * Nothing here is inferred. Where the schema has no column the field is null and the
 * draft simply cannot make that claim, which is the correct outcome: a carrier name we
 * guessed is a customer tracking the wrong website.
 */
export async function buildOrderFacts(db: Db, orderId: string | null): Promise<FactsResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural db type
  const q = db as any
  const notes: string[] = []

  if (!orderId) {
    return {
      facts: null,
      reason: 'the message is not linked to an order, so there is no record to answer from',
      notes,
      placedAtRecorded: false,
    }
  }

  const [order] = await q.select().from(orders).where(eq(orders.id, orderId)).limit(1)
  if (!order) {
    return { facts: null, reason: `order ${orderId} no longer exists`, notes, placedAtRecorded: false }
  }

  /*
   * A customer-facing identifier is not optional.
   *
   * Without one the reply cannot name the thing it is about, the operator cannot match
   * it to the queue, and grounding's own order-number check degrades to always passing.
   * Better to hand the whole message to a human than to file a draft whose safety rail
   * has quietly stopped working.
   */
  const orderNumber: string | null = order.orderNumber ?? order.shopifyOrderId ?? null
  if (!orderNumber) {
    return {
      facts: null,
      reason: `order ${orderId} has no order number or channel order id to quote`,
      notes,
      placedAtRecorded: false,
    }
  }

  const lines: Array<{
    lineId: string
    sku: string | null
    quantity: number
    title: string | null
  }> = await q
    .select({
      lineId: orderLines.id,
      sku: orderLines.sku,
      quantity: orderLines.quantity,
      title: products.title,
    })
    .from(orderLines)
    .leftJoin(products, eq(orderLines.productId, products.id))
    .where(eq(orderLines.orderId, orderId))

  const lineIds = lines.map((l) => l.lineId)
  const routed: Array<{
    orderLineId: string
    trackingNumber: string | null
    shippedAt: Date | null
    shipDaysMin: number | null
    shipDaysMax: number | null
  }> = lineIds.length
    ? await q
        .select({
          // Selected so coverage can be measured. Without it there is no way to tell
          // "every routed line shipped" from "every line shipped", and those are the
          // same sentence to a customer only when nothing was left unrouted.
          orderLineId: supplierOrders.orderLineId,
          trackingNumber: supplierOrders.trackingNumber,
          shippedAt: supplierOrders.shippedAt,
          shipDaysMin: suppliers.shipDaysMin,
          shipDaysMax: suppliers.shipDaysMax,
        })
        .from(supplierOrders)
        .leftJoin(suppliers, eq(supplierOrders.supplierId, suppliers.id))
        .where(inArray(supplierOrders.orderLineId, lineIds))
    : []

  /*
   * Lines nobody has sent anywhere.
   *
   * routeOrder declines individual lines — unapproved SKU, unreviewed personalisation,
   * over the per-order cost ceiling — so a partly routed order is a designed outcome,
   * not a hypothetical. Every fact below is about the whole order, so every one of them
   * has to know these exist.
   */
  const routedLineIds = new Set(routed.map((r) => r.orderLineId))
  const unroutedCount = lines.filter((l) => !routedLineIds.has(l.lineId)).length
  const fullyRouted = lines.length > 0 && unroutedCount === 0

  /*
   * Tracking, when an order ships in more than one parcel.
   *
   * Quoting one line's number as the order's is exactly the failure the grounding
   * checks refuse in the other direction: the customer follows it, sees one of their
   * two items, and writes again about the one that is missing. When the lines disagree
   * we carry no tracking at all and say so to the operator.
   */
  const trackingNumbers = [
    ...new Set(routed.map((r) => r.trackingNumber).filter((t): t is string => !!t)),
  ]
  const routedWithoutTracking = routed.filter((r) => !r.trackingNumber).length

  let trackingNumber: string | null = null
  if (routed.length === 0) {
    // Nothing went through a supplier, so the channel's own number is all there is.
    trackingNumber = order.trackingNumber ?? null
  } else if (trackingNumbers.length === 0) {
    // Nothing has tracking yet. Ordinary for an order still in production, and not a
    // caveat — the absence speaks for itself and `Tracking: not recorded` says it.
  } else if (trackingNumbers.length > 1) {
    notes.push(
      `this order ships in ${trackingNumbers.length} parcels with separate tracking, so no single number is quotable`,
    )
  } else if (!fullyRouted) {
    /*
     * One number, but not for the whole order.
     *
     * Handing it over anyway is the same failure as the multi-parcel case wearing a
     * different shape: the customer follows it, sees one parcel, and writes again
     * about the line that was never sent anywhere.
     */
    notes.push(
      `${unroutedCount} line(s) on this order have not been routed to a supplier, so the tracking number that exists does not cover the order`,
    )
  } else if (routedWithoutTracking > 0) {
    notes.push(
      `${routedWithoutTracking} routed line(s) have no tracking number yet, so the one that exists does not cover the order`,
    )
  } else {
    trackingNumber = trackingNumbers[0] ?? null
  }

  /*
   * Shipped means the customer's whole order has gone out.
   *
   * A half-shipped order told "it has shipped" produces the ticket the honest answer
   * would have prevented, so every routed line must have a shipping date before this
   * is non-null, and the LATEST one is the date the order was really complete.
   */
  const shipDates = routed.map((r) => r.shippedAt).filter((d): d is Date => d instanceof Date)
  let shippedAt: Date | null = null
  if (fullyRouted && shipDates.length === routed.length) {
    shippedAt = shipDates.reduce((a, b) => (a >= b ? a : b))
  } else if (routed.length === 0 && order.shippedAt instanceof Date) {
    // Nothing is routed through a supplier, so the channel-level date is all there is.
    shippedAt = order.shippedAt
  } else if (!fullyRouted) {
    /*
     * The case that used to slip through entirely.
     *
     * The old test compared ship dates against ROUTED rows, so an order whose second
     * line was never routed at all satisfied it: every routed line had shipped, and
     * `shippedAt` went non-null with no note. grounding.ts then skipped its
     * status.not_shipped check — because that check only runs when shippedAt is null —
     * and "your order went out on 1 October and is on its way" returned zero problems
     * while half the order had not been sent to anyone.
     */
    notes.push(
      `${unroutedCount} of ${lines.length} line(s) have not been routed to a supplier, ` +
        'so this order has NOT shipped and must not be described as having shipped',
    )
  } else if (shipDates.length > 0) {
    notes.push(`${shipDates.length} of ${routed.length} lines have shipped; the order has not`)
  }

  /*
   * Lead time across suppliers.
   *
   * Widest ends, not an average and not the first supplier's. Two suppliers quoting
   * 5-10 and 14-28 means this customer waits up to 28 days, and narrowing that to
   * something tidier is how the optimistic end gets quoted by accident.
   */
  const mins = routed.map((r) => r.shipDaysMin).filter((n): n is number => typeof n === 'number')
  const maxes = routed.map((r) => r.shipDaysMax).filter((n): n is number => typeof n === 'number')

  /*
   * A missing upper bound makes the range unquotable, not narrower.
   *
   * These were filtered independently, so a supplier with a recorded min and no max
   * contributed to the lower bound and silently vanished from the upper one — and the
   * answer came out TIGHTER than the evidence, which is the optimistic-end problem
   * arriving through the back door. The same applies to a line nobody routed: its
   * supplier is unknown, so its wait is unknown.
   */
  const upperBoundKnown = routed.length > 0 && maxes.length === routed.length && fullyRouted
  const leadTimeDaysMin = mins.length > 0 ? Math.min(...mins) : null
  const leadTimeDaysMax = upperBoundKnown ? Math.max(...maxes) : null

  if (leadTimeDaysMin !== null && leadTimeDaysMax === null) {
    notes.push(
      'the longest this order could take is not recorded, so no delivery window may be quoted at all',
    )
  }

  /*
   * `placedAt` is nullable and `createdAt` is when WE ingested the order, not when the
   * customer placed it. The substitution is recorded rather than smoothed over, because
   * an estimate that loses its marking is indistinguishable from a fact next week.
   */
  const placedAtRecorded = order.placedAt instanceof Date
  const placedAt: Date = placedAtRecorded ? order.placedAt : order.createdAt
  if (!placedAtRecorded) {
    notes.push(
      'the order has no placed-at date; the ingestion time is standing in for it, so the date this order was placed is not known and may not be stated',
    )
  }

  return {
    facts: {
      orderNumber,
      status: order.status,
      placedAt,
      shippedAt,
      // No column holds a carrier anywhere in this schema, so no draft may name one.
      carrier: null,
      trackingNumber,
      leadTimeDaysMin,
      leadTimeDaysMax,
      items: lines.map((l) => ({
        sku: l.sku ?? 'unknown',
        title: l.title ?? l.sku ?? 'item',
        quantity: l.quantity,
      })),
      /*
       * There is no "a human decided a refund" flag on the order, so the only honest
       * reading available is that the money has already gone back. That is strictly
       * narrower than what the field means, and narrower is the safe direction: the
       * worst case is a draft refusing to mention a refund the operator just approved,
       * which the operator fixes in the inbox in one edit.
       */
      decidedRemedies: order.status === 'refunded' ? (['refund'] as const) : [],
    },
    reason: null,
    notes,
    placedAtRecorded,
  }
}

/**
 * The OrderFacts as they go into `replies.cited_data`.
 *
 * Flat, and every value a string, a number, a boolean, a null or an array of strings.
 * The Comms Lab renders this object as a two-column table with `String(value)` in the
 * right-hand cell under the heading "Facts it was allowed to use", so anything nested
 * reaches the operator as the text `[object Object]` — on the one surface whose whole
 * job is letting them check a claim against the record. A traceability field that
 * renders as `[object Object]` is worse than none: it looks like it is working.
 */
function serialiseFacts(facts: OrderFacts): Record<string, unknown> {
  return {
    orderNumber: facts.orderNumber,
    status: facts.status,
    placedAt: facts.placedAt.toISOString(),
    shippedAt: facts.shippedAt ? facts.shippedAt.toISOString() : null,
    carrier: facts.carrier,
    trackingNumber: facts.trackingNumber,
    leadTimeDaysMin: facts.leadTimeDaysMin,
    leadTimeDaysMax: facts.leadTimeDaysMax,
    items: facts.items.map((i) => `${i.quantity} x ${i.title} (${i.sku})`),
    // Listed rather than flagged: a decision about one remedy must not unlock a
    // claim about another.
    decidedRemedies: [...facts.decidedRemedies],
  }
}

/**
 * What sits in `cited_data` beside the facts, and is therefore not one of them.
 *
 * Listed once so the re-file path can hand the approval the same thing the first
 * filing did. A payload key called `citedData` that means the record on one path and
 * the record plus four other things on another is how a reader stops trusting either.
 */
const CITED_DATA_SIDECARS = [
  'supportIntent',
  'recordNotes',
  'groundingWarnings',
  'modelClaimedFacts',
] as const

/** The stored facts alone, as they were written. */
function storedFactsOnly(citedData: unknown): Record<string, unknown> {
  if (typeof citedData !== 'object' || citedData === null) return {}
  return Object.fromEntries(
    Object.entries(citedData as Record<string, unknown>).filter(
      ([key]) => !(CITED_DATA_SIDECARS as readonly string[]).includes(key),
    ),
  )
}

export function createSupportAgent(deps: SupportDeps): AgentDefinition<SupportInput, SupportOutput> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural db type
  const db = deps.db as any
  const now = deps.now ?? (() => new Date())

  return {
    key: 'support',
    outputSchema: supportOutputSchema,

    async run(ctx: AgentContext<SupportInput>): Promise<SupportOutput> {
      const divisionId = ctx.division.id
      const messageId = messageIdFrom(ctx.input) ?? messageIdFrom(ctx.task?.input)
      if (!messageId) {
        throw new NonRetriableError(
          'no message id in the task input (expected messageId, refId, or an approval payload)',
        )
      }

      const [message] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1)
      if (!message) throw new NonRetriableError(`message ${messageId} does not exist`)
      if (message.divisionId !== divisionId) {
        throw new NonRetriableError(`message ${messageId} does not belong to this division`)
      }

      /*
       * Idempotency, and the exact size of it.
       *
       * A redelivered message.received must not produce a second draft. Two drafts for
       * one customer means a shop that forgot it had already answered — at best
       * contradicting itself, at worst contradicting itself about a refund. This runs
       * before any model call, so a redelivery costs one select rather than three.
       *
       * It is a check-then-write and it does not survive concurrency. `replies` has
       * `pod_replies_message_idx` on message_id and that index is NOT unique, so two
       * workers handed the same event both read zero rows here and both insert further
       * down. The gate de-duplicates the approval CARD by refId, so what the race
       * actually produces is two drafts under one card: the operator reads and sends
       * one, and the other sits in `pending_approval` against the same customer saying
       * something else. Only a unique index on pod.replies(message_id) closes it, and
       * that lives in the schema file this agent may not edit — reported rather than
       * papered over, because a second read here would narrow the window and look like
       * it had shut it.
       */
      const [existingReply] = await db
        .select()
        .from(replies)
        .where(eq(replies.messageId, messageId))
        .limit(1)

      if (existingReply) {
        const stored = (existingReply.citedData ?? {}) as {
          supportIntent?: string
          groundingWarnings?: unknown
        }
        // The intent rides in cited_data precisely so a re-file lands in the same
        // autonomy bucket without paying for a second classification.
        const intent = normaliseIntent(stored.supportIntent ?? '') ?? 'other'
        const warnings = Array.isArray(stored.groundingWarnings)
          ? stored.groundingWarnings.filter((w): w is string => typeof w === 'string')
          : []

        const outcome = await ctx.requestApproval({
          kind: 'reply',
          category: intent,
          refTable: 'pod.messages',
          refId: messageId,
          summary: oneLine(`Reply already drafted: ${message.subject ?? 'no subject'}`, SUMMARY_CHARS),
          payload: {
            messageId,
            replyId: existingReply.id,
            orderId: message.orderId,
            intent: message.intent ?? 'other',
            supportIntent: intent,
            customerMessage: message.body,
            replyBody: existingReply.body,
            warnings,
            citedData: storedFactsOnly(existingReply.citedData),
          },
        })

        await ctx.log('pod.reply_exists', `message ${messageId} already has a draft`, {
          refTable: 'pod.messages',
          refId: messageId,
        })

        return {
          messageId,
          replyId: existingReply.id,
          approvalId: outcome.approval.id,
          intent,
          recordedIntent: message.intent ?? 'other',
          status: 'already_drafted',
          escalationReason: null,
          warnings,
          redraftAttempts: 0,
        }
      }

      /*
       * The same guard for the other terminal state. An escalated message has no reply
       * row to find, and re-running the classifier on it would spend real money to
       * reach the same conclusion and hand the gate a request it will call a duplicate.
       */
      if (message.status === 'escalated') {
        const outcome = await ctx.requestApproval({
          kind: 'reply',
          // Not reclassified, so the fine intent is genuinely unknown here. Saying so
          // is cheaper than a model call and more honest than reusing the last one.
          category: escalationCategory('unclassified'),
          refTable: 'pod.messages',
          refId: messageId,
          summary: oneLine(`Escalated: ${message.subject ?? message.body}`, SUMMARY_CHARS),
          payload: {
            messageId,
            orderId: message.orderId,
            intent: message.intent ?? 'other',
            customerMessage: message.body,
            escalated: true,
            reason: 'this message was already escalated and is waiting on a human',
          },
        })

        return {
          messageId,
          replyId: null,
          approvalId: outcome.approval.id,
          intent: 'other',
          recordedIntent: message.intent ?? 'other',
          status: 'escalated',
          escalationReason: 'already_escalated',
          warnings: [],
          redraftAttempts: 0,
        }
      }

      const {
        facts,
        reason: factsReason,
        notes,
        placedAtRecorded,
      } = await buildOrderFacts(db, message.orderId)

      /*
       * What the record does not settle travels with the record, to every turn that
       * sees it. A caveat kept back for the approval payload reaches the operator after
       * the draft has already made the claim.
       */
      const caveats = { placedAtRecorded, notes }

      /* ---------------- classify ---------------- */

      const classified = await deps.model.structured({
        model: MODELS.routine,
        system: CLASSIFIER_SYSTEM_PROMPT,
        parts: [
          {
            kind: 'text',
            text: classifyRequest({
              facts,
              caveats,
              subject: message.subject,
              body: message.body,
            }),
          },
        ],
        schema: classificationSchema,
      })
      ctx.recordUsage(classified.usage)

      const intent = normaliseIntent(classified.output.intent)
      if (!intent) {
        await ctx.log(
          'pod.intent_unrecognised',
          `classifier returned "${classified.output.intent}", which is not an intent; treating it as other`,
          { level: 'warn', refTable: 'pod.messages', refId: messageId },
        )
      }
      const resolved: SupportIntent = intent ?? 'other'
      const recordedIntent = toRecordedIntent(resolved)
      const customerAsk = oneLine(classified.output.customerAsk, 200)

      /*
       * A message that tries to steer the agent is logged and carried on from, which is
       * what the committed system prompt tells the model to do. Escalating on the flag
       * alone would be worse than useless: every reply is read by a human before it
       * goes anywhere, so the attempt has already failed, and a rule that escalates on
       * it hands anyone who can email the shop a switch for turning the agent off.
       */
      if (classified.output.containsAgentInstructions) {
        await ctx.log(
          'pod.prompt_injection',
          `message ${messageId} contains text aimed at the agent rather than the shop`,
          { level: 'warn', refTable: 'pod.messages', refId: messageId },
        )
      }

      /** Draft attempts spent. Reported even on the paths that end in an escalation. */
      let redraftAttempts = 0

      const escalate = async (
        escalationReason:
          | 'not_draftable'
          | 'no_order_facts'
          | 'no_grounded_draft'
          | 'inbound_escalation',
        why: string,
        extra: Record<string, unknown> = {},
      ): Promise<SupportOutput> => {
        await db
          .update(messages)
          .set({ intent: recordedIntent, status: 'escalated', updatedAt: now() })
          .where(eq(messages.id, messageId))

        const outcome = await ctx.requestApproval({
          kind: 'reply',
          category: escalationCategory(resolved),
          refTable: 'pod.messages',
          refId: messageId,
          summary: oneLine(`Escalated (${resolved}): ${customerAsk}`, SUMMARY_CHARS),
          payload: {
            messageId,
            orderId: message.orderId,
            intent: recordedIntent,
            supportIntent: resolved,
            customerMessage: message.body,
            customerAsk,
            containsAgentInstructions: classified.output.containsAgentInstructions,
            escalated: true,
            reason: why,
            recordNotes: notes,
            ...extra,
            /*
             * No replyBody, no draft, no body. Deliberately.
             *
             * The payload keys a reply approval carries are the keys the inbox card
             * renders and the keys never-auto scans. Omitting them is what stops a
             * suggested wording appearing next to an Approve button — which is the
             * actual danger here. The agent has no view on whether this refund should
             * be given, and a fluent paragraph that looks like it does is how the
             * wrong answer gets sent by reflex in four seconds.
             */
          },
        })

        await ctx.log('pod.escalated', `${resolved}: ${why}`, {
          level: 'warn',
          refTable: 'pod.messages',
          refId: messageId,
        })

        return {
          messageId,
          replyId: null,
          approvalId: outcome.approval.id,
          intent: resolved,
          recordedIntent,
          status: 'escalated',
          escalationReason,
          warnings: [],
          redraftAttempts,
        }
      }

      /*
       * Harm, a legal threat, or a platform complaint: straight to the operator,
       * unanswered.
       *
       * The system prompt has promised this since it was written and nothing
       * implemented it. "My dog was sick after chewing this, is the coating
       * non-toxic?" classifies as product_question — it IS one — passes isDraftable,
       * and gets a reassuring, grounded reply about materials. The one thing that
       * must not happen here is an agent reassuring somebody about a possible injury.
       *
       * The list is never-auto's own, so the thing that drafts and the thing that
       * approves cannot disagree about what counts.
       */
      const inboundEscalation = inboundEscalationReason(
        `${message.subject ?? ''}
${message.body}`,
      )
      if (inboundEscalation) {
        await ctx.log('pod.support_escalated_inbound', inboundEscalation, {
          level: 'warn',
          refTable: 'pod.messages',
          refId: messageId,
        })
        return escalate('inbound_escalation', inboundEscalation)
      }

      if (!isDraftable(resolved)) {
        return escalate(
          'not_draftable',
          `a ${resolved} message is a decision, not a question, and the operator makes it`,
        )
      }

      if (!facts) {
        // Draftable, and still undraftable: every grounding check compares the text
        // against the record, so with no record there is nothing holding the model to
        // anything. Inventing empty defaults would pass every check and mean nothing.
        return escalate('no_order_facts', factsReason ?? 'no order record could be built')
      }

      /* ---------------- draft, then refuse it ---------------- */

      const shopName = ctx.division.name
      const systemPrompt = ctx.agent.systemPrompt || SUPPORT_SYSTEM_PROMPT

      let body: string | null = null
      let draftFactsUsed: string[] = []
      let warnings: GroundingProblem[] = []
      let problems: string[] = []
      let blocking: GroundingProblem[] = []

      for (let attempt = 0; attempt <= MAX_REDRAFT_ATTEMPTS; attempt++) {
        redraftAttempts = attempt
        const result = await deps.model.structured({
          model: MODELS.routine,
          system: systemPrompt,
          parts: [
            {
              kind: 'text',
              text: draftRequest({
                shopName,
                facts,
                caveats,
                subject: message.subject,
                body: message.body,
                problems,
              }),
            },
          ],
          schema: replyDraftSchema,
        })
        ctx.recordUsage(result.usage)

        const candidate = result.output.body.trim()
        const grounding = checkReplyGrounding(candidate, facts)
        blocking = grounding.filter((p) => p.severity === 'blocking')
        warnings = grounding.filter((p) => p.severity === 'warning')
        const style = validateDraft(result.output)

        if (blocking.length === 0) {
          // Style problems that survived the last redraft ride along as warnings. A
          // grounded, true reply the operator has to trim still answers the customer.
          body = candidate
          // Structured outputs drop the array bound, so the model can return nine.
          // `validateDraft` reports the overrun to the operator; this is what stops the
          // extra entries reaching the row underneath it.
          draftFactsUsed = result.output.factsUsed.slice(0, MAX_FACTS_CITED)
          warnings = [
            ...warnings,
            ...style.map((text) => ({ check: 'style', message: text, severity: 'warning' as const })),
          ]
          break
        }

        problems = [...blocking.map((p) => p.message), ...style]
      }

      if (!body) {
        return escalate(
          'no_grounded_draft',
          `${MAX_REDRAFT_ATTEMPTS + 1} drafts each made a claim the order record does not support`,
          { blockedBy: blocking.map(formatProblem) },
        )
      }

      const plainWarnings = warnings.map(formatProblem)
      const citedFacts = serialiseFacts(facts)

      const [reply] = await db
        .insert(replies)
        .values({
          divisionId,
          messageId,
          body,
          autoSent: false,
          status: 'pending_approval',
          /*
           * The record IS cited_data, spread at the top level rather than nested under
           * a key of its own. The Comms Lab prints this object as a table of
           * `String(value)` under the heading "Facts it was allowed to use", which is
           * the surface an operator uses to decide whether a reply invented something;
           * a nested object reaches them there as `[object Object]`, so the check that
           * matters silently stops being possible.
           *
           * The four keys beside the facts are each named for what they are. Only
           * `supportIntent` is load-bearing: a redelivery re-files the approval in the
           * same autonomy bucket by reading it, rather than paying for a second
           * classification, and the coarse `messages.intent` cannot be reversed into it.
           */
          citedData: {
            ...citedFacts,
            supportIntent: resolved,
            recordNotes: notes,
            groundingWarnings: plainWarnings,
            /*
             * The model's account of its own citations, never checked against the
             * record above. Named for its source, because under a heading that says
             * "facts" an unverified model string is exactly the thing this system
             * exists to not do.
             */
            modelClaimedFacts: draftFactsUsed,
          },
          actor: `agent:${ctx.agent.id}`,
        })
        .returning()

      await db
        .update(messages)
        .set({ intent: recordedIntent, status: 'drafted', updatedAt: now() })
        .where(eq(messages.id, messageId))

      if (plainWarnings.length > 0) {
        await ctx.log('pod.draft_warnings', plainWarnings.join('; '), {
          level: 'warn',
          refTable: 'pod.replies',
          refId: reply.id,
        })
      }

      ctx.remember({
        kind: 'result',
        content: `Drafted a ${resolved} reply for order ${facts.orderNumber} after ${redraftAttempts} redraft(s).`,
        importance: 0.25,
      })

      const outcome = await ctx.requestApproval({
        kind: 'reply',
        /*
         * The FINE intent is the autonomy bucket. The coarse column would put a
         * personalisation question and a bespoke-order request in one bucket, and
         * earning automatic approval on the first would then carry over to the second.
         */
        category: resolved,
        refTable: 'pod.messages',
        refId: messageId,
        summary: oneLine(`Reply ready (${resolved}): ${customerAsk}`, SUMMARY_CHARS),
        payload: {
          messageId,
          replyId: reply.id,
          orderId: message.orderId,
          /*
           * `intent`, `customerMessage` and `replyBody` are the exact keys never-auto
           * reads. It scans the inbound text for chargebacks, legal threats and damage,
           * and the draft for a December delivery promise, and it cannot do either if
           * this payload spells them differently.
           */
          intent: recordedIntent,
          supportIntent: resolved,
          customerMessage: message.body,
          replyBody: body,
          customerAsk,
          containsAgentInstructions: classified.output.containsAgentInstructions,
          /* The model's own account of what it cited, not a check that it did. */
          modelClaimedFacts: draftFactsUsed,
          warnings: plainWarnings,
          recordNotes: notes,
          redraftAttempts,
          citedData: citedFacts,
        },
      })

      /*
       * An auto-approved reply is reported as auto-approved.
       *
       * `reply` is marked neverAuto at the module level and the never-auto list is
       * checked before graduation, so this should not be reachable — but "should not
       * be reachable" is not the same as "is handled", and the previous mapping
       * folded `auto_approved` into `approval_requested`, telling the operator a reply
       * was waiting for them when nothing was. Loud at warn level, because with no
       * send path an auto-approved reply is read by nobody and sent by nobody.
       */
      if (outcome.status === 'auto_approved') {
        await ctx.log(
          'pod.reply_auto_approved',
          `reply ${reply.id} was auto-approved; with no send path it will be read by nobody ` +
            'and sent by nobody. The reply kind should be neverAuto.',
          { level: 'error', refTable: 'pod.replies', refId: reply.id },
        )
      }

      return {
        messageId,
        replyId: reply.id,
        approvalId: outcome.approval.id,
        intent: resolved,
        recordedIntent,
        status:
          outcome.status === 'duplicate'
            ? 'already_requested'
            : outcome.status === 'auto_approved'
              ? 'auto_approved'
              : 'approval_requested',
        warnings: plainWarnings,
        escalationReason: null,
        redraftAttempts,
      }
    },
  }
}
