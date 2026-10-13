/**
 * Taking an order from a channel and getting it made.
 *
 * Two things here are worth more than the rest of the file:
 *
 *  1. Ingestion is idempotent because of a database constraint, not a check-then-write.
 *     Webhooks arrive more than once — that is normal, not a fault — and two workers
 *     can process duplicates simultaneously. A `SELECT` then `INSERT` loses that race;
 *     a unique index does not.
 *
 *  2. "Submitted to the supplier" is not "fulfilled". The brief is explicit and it is
 *     right: an order marked fulfilled because we handed it off is how a customer
 *     is told their parcel shipped three days before anyone printed it.
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import { mayRouteOrder, type OrderRoutingCandidate } from './channel-rules'
import { orderLines, orders, products, supplierOrders, suppliers } from './schema/index'

type Db = Record<string, unknown>

export interface IncomingOrderLine {
  channelLineItemId: string
  sku?: string | null
  /**
   * The product id as the CHANNEL numbers it, when the caller knows it.
   *
   * Resolved to our own `productId` during ingestion, because only a database can
   * do that and a webhook handler has no business doing it twice. Without this
   * every webhook line arrives unlinked, and an unlinked line has no cost and no
   * approved SKU — so `mayRouteOrder` holds every single order for approval and
   * the reason it gives is misleading.
   */
  channelProductId?: string | null
  productId?: string | null
  quantity: number
  unitPriceCents: number
  personalization?: Record<string, unknown> | null
  personalized?: boolean
}

export interface IncomingOrder {
  channel: 'etsy' | 'shopify'
  channelOrderId: string
  orderNumber?: string | null
  customerEmail?: string | null
  totalCents: number
  paid: boolean
  hasValidAddress: boolean
  placedAt?: Date | null
  lines: IncomingOrderLine[]
}

export interface IngestResult {
  orderId: string
  created: boolean
  /** Lines inserted by THIS call. A redelivered webhook reports zero. */
  linesCreated: number
  linesSkipped: number
}

/**
 * Record an order and its lines, exactly once.
 *
 * `onConflictDoNothing` against the (channel, order, line) unique index is the whole
 * mechanism. Counting what came back tells the caller whether this delivery was the
 * first, without a second query that could itself race.
 */
export async function ingestOrder(db: Db, divisionId: string, incoming: IncomingOrder): Promise<IngestResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural db type
  const database = db as any

  /*
   * One order is identified by DIVISION, CHANNEL and the channel's own id.
   *
   * All three, in the read, in the conflict target and in the lost-race re-read, and
   * the three of them agreeing is the whole correctness argument. They did not agree
   * before: the read filtered on division and order id, the conflict target was the
   * order id alone, and the re-read dropped the division. Two reproducible failures
   * came out of that, both now tests —
   *
   *   Another division ingesting the same order id got NO row of its own and was
   *   handed the FIRST division's order by the re-read, so its lines were written
   *   against another business's order.
   *
   *   An Etsy order and a Shopify order with the same number became one order,
   *   because `shopify_order_id` was holding both and the index knew nothing about
   *   the channel.
   */
  const identity = and(
    eq(orders.divisionId, divisionId),
    eq(orders.channel, incoming.channel),
    eq(orders.channelOrderId, incoming.channelOrderId),
  )

  let existing = await database.select().from(orders).where(identity).limit(1)

  if (!existing[0]) {
    /*
     * Adopt a row that predates the channel column.
     *
     * Migration 0004 backfills `channel` from the order's lines and leaves it NULL
     * when there were none to derive it from — which is exactly the order whose
     * line inserts failed, and therefore exactly the order most likely to be
     * redelivered. The identity above filters on `channel`, NULL never equals
     * 'shopify', so the read misses it; and the unique index agrees, because NULL
     * is distinct from everything in Postgres. The insert would then succeed and
     * the shop would have the same order twice.
     *
     * Claiming the row is the migration completing itself on the first delivery
     * that can say what the channel was.
     */
    const legacy = await database
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.divisionId, divisionId),
          isNull(orders.channel),
          eq(orders.channelOrderId, incoming.channelOrderId),
        ),
      )
      .limit(1)

    if (legacy[0]) {
      await database
        .update(orders)
        .set({ channel: incoming.channel, updatedAt: new Date() })
        .where(and(eq(orders.id, legacy[0].id), isNull(orders.channel)))
      existing = await database.select().from(orders).where(identity).limit(1)
    }
  }

  let orderId: string
  let created = false

  if (existing[0]) {
    orderId = existing[0].id
    /*
     * A redelivery may carry NEWER facts than the first one did.
     *
     * `orders/updated` fires when an order is paid or its address is corrected, and
     * the whole point of recording these two is that routing reads them later. An
     * ingest that only ever inserted would leave an order that has since been paid
     * looking unpaid forever.
     *
     * Only ever toward true. A later webhook claiming an order is no longer paid is
     * a refund or a cancellation, which is a different event with different
     * consequences than quietly un-paying a line that may already be at a printer.
     */
    const promote: Record<string, unknown> = {}
    if (incoming.paid && !existing[0].paid) promote['paid'] = true
    if (incoming.hasValidAddress && !existing[0].hasValidAddress) {
      promote['hasValidAddress'] = true
    }
    if (Object.keys(promote).length > 0) {
      await database
        .update(orders)
        .set({ ...promote, updatedAt: new Date() })
        .where(eq(orders.id, orderId))
    }
  } else {
    const [row] = await database
      .insert(orders)
      .values({
        divisionId,
        channel: incoming.channel,
        channelOrderId: incoming.channelOrderId,
        orderNumber: incoming.orderNumber ?? null,
        customerEmail: incoming.customerEmail ?? null,
        totalCents: incoming.totalCents,
        // Stored, not just accepted. These gate every routing decision.
        paid: incoming.paid,
        hasValidAddress: incoming.hasValidAddress,
        status: 'received',
        placedAt: incoming.placedAt ?? new Date(),
        actor: 'system',
      })
      .onConflictDoNothing({
        target: [orders.divisionId, orders.channel, orders.channelOrderId],
      })
      .returning()

    if (row) {
      orderId = row.id
      created = true
    } else {
      // Lost the race to another worker; read what it wrote — by the SAME identity
      // the insert conflicted on, so this cannot return somebody else's order.
      const [raced] = await database.select().from(orders).where(identity).limit(1)
      if (!raced) {
        /*
         * Neither inserted nor found. That means the conflict was on some other
         * constraint, and continuing would attach these lines to whatever `orderId`
         * happened to hold. There is no safe guess here.
         */
        throw new Error(
          `could not record ${incoming.channel} order ${incoming.channelOrderId}: the insert ` +
            'conflicted but no matching order exists',
        )
      }
      orderId = raced.id
    }
  }

  /*
   * Link each line to the product it is actually for, once, before the loop.
   *
   * Matched on the CHANNEL's product id rather than the sku: `products` has no sku
   * column, and a free-text field a shop owner can retype is not an identity. One
   * query for the whole order rather than one per line.
   */
  const channelProductIds = [
    ...new Set(
      incoming.lines
        .map((l) => (l.channelProductId ?? '').trim())
        .filter((id) => id !== ''),
    ),
  ]
  const productIdByChannelId = new Map<string, string>()
  if (channelProductIds.length > 0) {
    const column = incoming.channel === 'etsy' ? products.etsyListingId : products.shopifyProductId
    const rows = await database
      .select({ id: products.id, channelId: column })
      .from(products)
      .where(and(eq(products.divisionId, divisionId), inArray(column, channelProductIds)))
    for (const row of rows) {
      if (row.channelId) productIdByChannelId.set(String(row.channelId), String(row.id))
    }
  }

  let linesCreated = 0
  for (const line of incoming.lines) {
    const resolvedProductId =
      line.productId ??
      (line.channelProductId ? (productIdByChannelId.get(line.channelProductId) ?? null) : null)
    const [row] = await database
      .insert(orderLines)
      .values({
        divisionId,
        orderId,
        channel: incoming.channel,
        channelOrderId: incoming.channelOrderId,
        channelLineItemId: line.channelLineItemId,
        productId: resolvedProductId,
        sku: line.sku ?? null,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        personalization: line.personalization ?? null,
        personalized: line.personalized ?? false,
        actor: 'system',
      })
      // The constraint, not a check. A webhook delivered three times inserts once.
      // Division first, matching the index: a line is unique within one division's
      // channel order, not across every division that ever saw that id.
      .onConflictDoNothing({
        target: [
          orderLines.divisionId,
          orderLines.channel,
          orderLines.channelOrderId,
          orderLines.channelLineItemId,
        ],
      })
      .returning()

    if (row) linesCreated += 1
  }

  return {
    orderId,
    created,
    linesCreated,
    linesSkipped: incoming.lines.length - linesCreated,
  }
}

export interface RoutingPolicy {
  /** SKUs the operator has approved for automatic routing. */
  approvedProductIds: ReadonlySet<string> | readonly string[]
  maxFulfillmentCostCents: number
}

export type LineRouting =
  | { lineId: string; routed: true; supplierOrderId: string }
  | { lineId: string; routed: false; reason: string; needs: string }

/**
 * Route every line of an order that is allowed to go.
 *
 * Creates at most one supplier order per line — enforced again by a unique index,
 * because retrying a submission must never charge twice for the same item.
 */
export async function routeOrder(
  db: Db,
  orderId: string,
  policy: RoutingPolicy,
  context: { paid: boolean; hasValidAddress: boolean },
): Promise<LineRouting[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural db type
  const database = db as any
  const approved = new Set(policy.approvedProductIds)

  const lines = await database.select().from(orderLines).where(eq(orderLines.orderId, orderId))
  const results: LineRouting[] = []

  for (const line of lines) {
    const already = await database
      .select()
      .from(supplierOrders)
      .where(eq(supplierOrders.orderLineId, line.id))
      .limit(1)

    if (already[0]) {
      results.push({
        lineId: line.id,
        routed: false,
        reason: 'this line has already been sent to a supplier',
        needs: 'nothing',
      })
      continue
    }

    let costCents = 0
    if (line.productId) {
      const [product] = await database
        .select()
        .from(products)
        .where(eq(products.id, line.productId))
        .limit(1)
      costCents = (product?.costCents ?? 0) * line.quantity
    }

    const candidate: OrderRoutingCandidate = {
      personalized: line.personalized,
      personalizationReviewed: line.personalizationReviewedAt !== null,
      skuApproved: line.productId ? approved.has(line.productId) : false,
      paid: context.paid,
      hasValidAddress: context.hasValidAddress,
      fulfillmentCostCents: costCents,
      maxFulfillmentCostCents: policy.maxFulfillmentCostCents,
    }

    const decision = mayRouteOrder(candidate)
    if (!decision.route) {
      results.push({ lineId: line.id, routed: false, reason: decision.reason, needs: decision.needs })
      continue
    }

    const [created] = await database
      .insert(supplierOrders)
      .values({
        divisionId: line.divisionId,
        orderLineId: line.id,
        status: 'ready_to_route',
        costCents,
        actor: 'system',
      })
      // Belt and braces with the check above: two workers racing the same order both
      // pass the SELECT, and only one gets a row.
      .onConflictDoNothing({ target: supplierOrders.orderLineId })
      .returning()

    if (!created) {
      results.push({
        lineId: line.id,
        routed: false,
        reason: 'another worker routed this line first',
        needs: 'nothing',
      })
      continue
    }

    results.push({ lineId: line.id, routed: true, supplierOrderId: created.id })
  }

  return results
}

/** Mark a line's buyer input and proof as checked by a human. */
export async function reviewPersonalization(
  db: Db,
  orderLineId: string,
  reviewedBy: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural db type
  const database = db as any
  await database
    .update(orderLines)
    .set({
      personalizationReviewedAt: new Date(),
      personalizationReviewedBy: reviewedBy,
      updatedAt: new Date(),
    })
    .where(eq(orderLines.id, orderLineId))
}

/**
 * What the customer should be told the order's state is.
 *
 * Derived from the supplier orders rather than stored, so it cannot drift. Note what
 * is missing: there is no path from "submitted" to "fulfilled". Handing an order to a
 * supplier is not the same as a parcel existing, and conflating them is how a customer
 * is told their order shipped days before anything was printed.
 */
export type CustomerVisibleStatus =
  | 'received'
  | 'awaiting_review'
  | 'in_production'
  | 'partially_shipped'
  | 'shipped'
  | 'delivered'
  | 'exception'

export function customerVisibleStatus(
  supplierOrderStatuses: ReadonlyArray<{ status: string; shippedAt?: Date | null }>,
  lines: ReadonlyArray<{ personalized: boolean; personalizationReviewedAt: Date | null }>,
): CustomerVisibleStatus {
  if (supplierOrderStatuses.some((s) => s.status === 'exception')) return 'exception'

  if (lines.some((l) => l.personalized && l.personalizationReviewedAt === null)) {
    return 'awaiting_review'
  }

  if (supplierOrderStatuses.length === 0) return 'received'

  const shipped = supplierOrderStatuses.filter(
    (s) => s.status === 'shipped' || s.status === 'delivered',
  )
  if (supplierOrderStatuses.every((s) => s.status === 'delivered')) return 'delivered'
  if (shipped.length === supplierOrderStatuses.length) return 'shipped'
  if (shipped.length > 0) return 'partially_shipped'

  /*
   * `ready_to_route` is NOT being made.
   *
   * It means a line was staged for a supplier nobody has contacted yet — the row
   * exists, and that is all. Falling through to `in_production` told a customer
   * their item was in production while it sat in a queue, which is the same family
   * of lie as reporting a parcel shipped because a supplier was emailed.
   *
   * Harmless while nothing created those rows. The Fulfilment desk creates exactly
   * those rows, so this now decides what a real buyer is told.
   */
  if (supplierOrderStatuses.every((s) => s.status === 'ready_to_route')) return 'received'

  // Submitted and in_production both read as "being made" to a customer. Neither is
  // "shipped", and the absence of that mapping is the point.
  return 'in_production'
}

/** Supplier data old enough that a listing built on it would be misleading. */
export const STALE_SUPPLIER_DATA_DAYS = 14

/** Suppliers whose cost and stock figures need re-confirming before they back a listing. */
export async function staleSuppliers(db: Db, divisionId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural db type
  const database = db as any
  return database
    .select()
    .from(suppliers)
    .where(
      and(
        eq(suppliers.divisionId, divisionId),
        sql`${suppliers.dataConfirmedAt} IS NULL OR ${suppliers.dataConfirmedAt} < now() - make_interval(days => ${STALE_SUPPLIER_DATA_DAYS})`,
      ),
    )
}
