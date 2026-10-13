/**
 * Fulfilment desk — what happens to an order after it is recorded.
 *
 * `routeOrder` was the last orphan in this module: written, tested, called by
 * nothing. An order could be ingested and then sat there, because the thing that
 * decides whether a line may be made was a library function with no caller.
 *
 * Makes NO MODEL CALL. Every decision here is `mayRouteOrder`, which is a tested
 * function with five explicit rules, and handing those to a model would replace a
 * rule that always holds with one that usually does. The brief is specific about
 * what may not be automated and this is the agent closest to spending money.
 *
 * WHAT ROUTING IS AND IS NOT
 * Routing creates a `supplier_orders` row at `ready_to_route`. That is a staged
 * intent, not a purchase: nothing is sent to a supplier and nothing is charged.
 * Submission is a separate step that does not exist yet, and this agent does not
 * pretend otherwise — a line it reports as routed has been QUEUED, which is what
 * the word means here and what the output says.
 *
 * The one thing it escalates is personalisation. A personalised line holds until a
 * human has read what the buyer typed, because `personalization_proof` is neverAuto
 * for a reason that cannot be undone once it is printed on a mug.
 */

import type { AgentContext, AgentDefinition } from '@acf/core/runtime'
import { NonRetriableError } from '@acf/core/runtime'
import { and, eq } from 'drizzle-orm'
import * as z from 'zod'

import { routeOrder, type LineRouting } from '../../fulfillment'
import { orderLines, orders, products } from '../../schema/index'

/** Minimal structural view of the drizzle client, so this file does not import @acf/db. */
type Db = Record<string, unknown>

export interface FulfillmentDeps {
  db: Db
  now?: () => Date
}

export const fulfillmentInputSchema = z.object({
  orderId: z.string().optional(),
  /** What a dispatcher would send. */
  refId: z.string().optional(),
  refTable: z.string().optional(),
})

export type FulfillmentInput = z.infer<typeof fulfillmentInputSchema>

export const fulfillmentOutputSchema = z.object({
  orderId: z.string(),
  channelOrderId: z.string().nullable(),
  /**
   * `queued` is deliberately not called `fulfilled` or even `routed` in the
   * operator-facing sense: a supplier order exists, nobody has sent it anywhere.
   */
  status: z.enum(['queued', 'all_held', 'nothing_to_do']),
  linesQueued: z.number(),
  held: z.array(
    z.object({
      lineId: z.string(),
      reason: z.string(),
      needs: z.string(),
    }),
  ),
  /** Approvals filed for personalised lines a human has not read yet. */
  proofApprovalIds: z.array(z.string()),
})

export type FulfillmentOutput = z.infer<typeof fulfillmentOutputSchema>

/** The order this task is about, whichever shape it arrived in. */
export function orderIdFrom(input: FulfillmentInput): string | null {
  if (input.orderId) return input.orderId
  if (input.refTable && input.refTable !== 'pod.orders') return null
  return input.refId ?? null
}

/**
 * The per-order fulfilment ceiling.
 *
 * Absent means NO ceiling was configured, and that is not the same as a ceiling of
 * zero. Zero would hold every line with a cost reason the operator never set, which
 * reads like a policy decision and is actually a missing setting. A sane default is
 * used and the caller is told it was used.
 */
export const DEFAULT_MAX_FULFILLMENT_CENTS = 5_000

export function maxFulfillmentCentsFrom(config: unknown): {
  cents: number
  configured: boolean
} {
  const raw = (config as Record<string, unknown> | null)?.['maxFulfillmentCostCents']
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) {
    return { cents: raw, configured: true }
  }
  return { cents: DEFAULT_MAX_FULFILLMENT_CENTS, configured: false }
}

export function createFulfillmentAgent(
  deps: FulfillmentDeps,
): AgentDefinition<FulfillmentInput, FulfillmentOutput> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural db type
  const db = deps.db as any

  return {
    key: 'fulfillment',
    outputSchema: fulfillmentOutputSchema,

    async run(ctx: AgentContext<FulfillmentInput>): Promise<FulfillmentOutput> {
      const divisionId = ctx.division.id

      const parsed = fulfillmentInputSchema.safeParse(ctx.input)
      if (!parsed.success) {
        throw new NonRetriableError('the task input is not a shape this agent can read')
      }
      const orderId = orderIdFrom(parsed.data)
      if (!orderId) {
        throw new NonRetriableError('no order to work; this agent routes one order and cannot pick one')
      }

      const [order] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.divisionId, divisionId)))
        .limit(1)

      if (!order) {
        throw new NonRetriableError(`order ${orderId} does not exist in this division`)
      }

      /* ---------------- the policy ---------------- */

      /*
       * Approved SKUs are the products this division has actually PUBLISHED.
       *
       * A product reaches `published` only by passing the `product` gate and then
       * the Loading bay, so the status is a record of a decision rather than a
       * guess. Reading anything looser here — every product row, say — would route
       * an order for a listing nobody agreed to sell.
       */
      const published: Array<{ id: string }> = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.divisionId, divisionId), eq(products.status, 'published')))

      const { cents: maxFulfillmentCostCents, configured } = maxFulfillmentCentsFrom(
        ctx.division.config,
      )
      if (!configured) {
        await ctx.log(
          'pod.fulfillment_default_ceiling',
          `no maxFulfillmentCostCents is set for ${ctx.division.name}, so lines are held above ` +
            `${(maxFulfillmentCostCents / 100).toFixed(2)} by default rather than by anyone's decision`,
          { level: 'warn' },
        )
      }

      /*
       * Paid and addressed come from the ORDER ROW, never from the task input.
       *
       * The input is whatever queued this run, and on the webhook path that came
       * from outside. Reading the recorded order means a line is routed only on
       * the strength of what was verified at ingestion — a task hand-crafted to
       * say `paid: true` cannot talk this into spending, because it is not asked.
       *
       * Both columns exist because of this agent: `ingestOrder` was handed them
       * and stored neither, so a worker picking an order up later had to either
       * invent them or hold everything. Inventing them is how an unpaid order
       * reaches a printer.
       */
      const routings: LineRouting[] = await routeOrder(
        db,
        orderId,
        { approvedProductIds: published.map((p) => p.id), maxFulfillmentCostCents },
        { paid: Boolean(order.paid), hasValidAddress: Boolean(order.hasValidAddress) },
      )

      const queued = routings.filter((r) => r.routed)
      const held = routings
        .filter((r): r is Extract<LineRouting, { routed: false }> => !r.routed)
        .map((r) => ({ lineId: r.lineId, reason: r.reason, needs: r.needs }))

      for (const line of held) {
        await ctx.log(
          'pod.line_held',
          `line ${line.lineId} is not going anywhere: ${line.reason}`,
          { level: 'warn', refTable: 'pod.order_lines', refId: line.lineId },
        )
      }

      /* ---------------- the one thing that goes to a person ---------------- */

      /*
       * A personalised line held for review becomes an approval card.
       *
       * Everything else held is held on a fact the operator can already see — an
       * unpaid order, an unapproved SKU, a cost over the ceiling — and filing a card
       * for each would train them to clear the inbox without reading it. A
       * personalisation proof is different: it is the only hold that needs somebody
       * to READ something, and `personalization_proof` is neverAuto because what is
       * printed on a mug cannot be taken back.
       */
      const proofApprovalIds: string[] = []
      const needsReview = held.filter((h) => h.needs === 'review')

      for (const line of needsReview) {
        const [row] = await db
          .select()
          .from(orderLines)
          .where(and(eq(orderLines.id, line.lineId), eq(orderLines.divisionId, divisionId)))
          .limit(1)
        if (!row) continue

        const outcome = await ctx.requestApproval({
          kind: 'personalization_proof',
          category: String(order.channel ?? 'unknown'),
          refTable: 'pod.order_lines',
          refId: line.lineId,
          summary: `Personalised line on order ${order.orderNumber ?? order.channelOrderId ?? orderId}`,
          payload: {
            orderId,
            channelOrderId: order.channelOrderId,
            lineId: line.lineId,
            sku: row.sku,
            quantity: row.quantity,
            /**
             * What the BUYER typed, shown exactly as it arrived.
             *
             * This is the whole point of the card: somebody has to read it before
             * it is printed. It is untrusted text from outside and is rendered as
             * data, never acted on as an instruction.
             */
            buyerInput: row.personalization,
            whyHeld: line.reason,
          },
        })
        proofApprovalIds.push(outcome.approval.id)
      }

      const status: FulfillmentOutput['status'] =
        routings.length === 0 ? 'nothing_to_do' : queued.length > 0 ? 'queued' : 'all_held'

      await ctx.log(
        'pod.order_routed',
        `order ${order.channelOrderId ?? orderId}: ${queued.length} line(s) queued for a supplier, ` +
          `${held.length} held` +
          (proofApprovalIds.length > 0 ? `, ${proofApprovalIds.length} proof(s) waiting on you` : ''),
        { refTable: 'pod.orders', refId: orderId },
      )

      return {
        orderId,
        channelOrderId: order.channelOrderId ?? null,
        status,
        linesQueued: queued.length,
        held,
        proofApprovalIds,
      }
    },
  }
}
