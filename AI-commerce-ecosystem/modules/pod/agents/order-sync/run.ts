/**
 * Order sync — the pull half of ingestion.
 *
 * A webhook is a push, and a push is lost when the receiver is down. Deploys
 * restart the process, a bad release 500s for ten minutes, Shopify gives up after
 * its retries, and the orders that arrived in that window exist on the platform and
 * nowhere here. Nobody notices, because the symptom of a missing order is silence.
 *
 * It is also the only path Etsy has. The spec's own integration notes say the Etsy
 * adapter is still to be built, and polling `listOrders` is the shape that works
 * whether or not a platform offers webhooks at all.
 *
 * So this runs on a clock, asks each configured channel what it has seen since a
 * point it derives from the orders already recorded, and ingests the lot.
 * Over-fetching is deliberate and free: ingestion is idempotent by unique index, so
 * an order this has already seen costs one conflicting insert and reports itself as
 * already recorded.
 *
 * THE RULE THAT OUTRANKS EVERYTHING HERE
 * A `simulated` order is not an order. The demo adapters return plausible orders
 * marked as such, and ingesting one writes a customer, a total and a line into the
 * same tables a real sale uses — at which point nothing downstream can tell the
 * difference, the ledger has revenue nobody paid, and the operator is reading
 * invented money. Dropped, counted, and said out loud.
 */

import type { AgentContext, AgentDefinition } from '@acf/core/runtime'
import type { ChannelKey, ChannelOrder, SalesChannel } from '@acf/integrations/channels'
import { and, desc, eq } from 'drizzle-orm'
import * as z from 'zod'

import { ingestOrder } from '../../fulfillment'
import { orders } from '../../schema/index'

/** Minimal structural view of the drizzle client, so this file does not import @acf/db. */
type Db = Record<string, unknown>

export interface OrderSyncDeps {
  db: Db
  /** The adapters this app has composed. A channel with no adapter is skipped. */
  channels: Partial<Record<ChannelKey, SalesChannel>>
  /**
   * Queue the fulfilment desk for an order that is new to us.
   *
   * Takes the division and a label as well as the id, because the composition root
   * that supplies this resolves agents by module and key and has no idea which
   * division a given run belongs to — only the running agent does.
   */
  onNewOrder?: (order: {
    orderId: string
    divisionId: string
    label: string
  }) => Promise<void>
  now?: () => Date
}

export const orderSyncInputSchema = z.object({
  /** Override the window, for a one-off catch-up after an outage. */
  sinceIso: z.string().optional(),
  /** Limit to one channel, for a manual run. */
  channel: z.enum(['etsy', 'shopify']).optional(),
})

export type OrderSyncInput = z.infer<typeof orderSyncInputSchema>

export const orderSyncOutputSchema = z.object({
  since: z.string(),
  channels: z.array(
    z.object({
      channel: z.string(),
      status: z.enum(['synced', 'no_adapter', 'failed', 'all_simulated']),
      seen: z.number(),
      recorded: z.number(),
      alreadyKnown: z.number(),
      /** Orders dropped for being demo data. Never ingested, always counted. */
      simulatedDropped: z.number(),
      error: z.string().nullable(),
    }),
  ),
  /** Orders this run heard about for the first time. */
  newOrderIds: z.array(z.string()),
})

export type OrderSyncOutput = z.infer<typeof orderSyncOutputSchema>

/**
 * How far back to look when nothing says otherwise.
 *
 * Longer than any plausible outage, short enough that a first run on a shop with
 * years of history does not try to ingest all of it.
 */
export const DEFAULT_LOOKBACK_HOURS = 48

/**
 * Overlap re-fetched on every run.
 *
 * Starting exactly at the newest order already recorded loses anything placed in
 * the same second, and anything a platform made visible out of order. Idempotency
 * makes the overlap free, so it is generous.
 */
export const SYNC_OVERLAP_MINUTES = 30

/** Never walk back further than this, however empty the table is. */
export const MAX_LOOKBACK_DAYS = 30

export function syncWindowStart(
  newestPlacedAt: Date | null,
  now: Date,
  lookbackHours = DEFAULT_LOOKBACK_HOURS,
): Date {
  const floor = new Date(now.getTime() - MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
  const fallback = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000)

  if (!newestPlacedAt || Number.isNaN(newestPlacedAt.getTime())) return fallback

  const overlapped = new Date(newestPlacedAt.getTime() - SYNC_OVERLAP_MINUTES * 60 * 1000)
  // Never later than the plain lookback either: a shop whose newest order is from
  // last year should still be asked about the last two days.
  const start = overlapped < fallback ? overlapped : fallback
  return start < floor ? floor : start
}

/** Channels this division sells on, from its config. */
export function channelsFrom(config: unknown): ChannelKey[] {
  const raw = (config as Record<string, unknown> | null)?.['channels']
  if (!Array.isArray(raw)) return []
  const out: ChannelKey[] = []
  for (const value of raw) {
    const key = String(value).trim().toLowerCase()
    if ((key === 'etsy' || key === 'shopify') && !out.includes(key)) out.push(key)
  }
  return out
}

export function createOrderSyncAgent(
  deps: OrderSyncDeps,
): AgentDefinition<OrderSyncInput, OrderSyncOutput> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural db type
  const db = deps.db as any
  const now = deps.now ?? (() => new Date())

  return {
    key: 'order_sync',
    outputSchema: orderSyncOutputSchema,

    async run(ctx: AgentContext<OrderSyncInput>): Promise<OrderSyncOutput> {
      const divisionId = ctx.division.id
      const at = now()

      const parsed = orderSyncInputSchema.safeParse(ctx.input)
      const input: OrderSyncInput = parsed.success ? parsed.data : {}
      if (!parsed.success) {
        await ctx.log(
          'pod.sync_input_unreadable',
          'the task input is not a shape this agent can read; syncing the default window',
          { level: 'warn' },
        )
      }

      const wanted = channelsFrom(ctx.division.config)
      const selected = input.channel ? wanted.filter((c) => c === input.channel) : wanted

      if (selected.length === 0) {
        await ctx.log(
          'pod.sync_no_channels',
          `${ctx.division.name} lists no sales channels in its config, so there is nowhere ` +
            'to sync from',
          { level: 'warn' },
        )
      }

      const results: OrderSyncOutput['channels'] = []
      const newOrderIds: string[] = []
      const newOrderLabels = new Map<string, string>()
      let earliest: Date | null = null

      for (const channel of selected) {
        const adapter = deps.channels[channel]
        if (!adapter) {
          /*
           * A channel the operator configured and the app cannot reach.
           *
           * Said at warn rather than skipped quietly: the division believes it sells
           * there, and a sync that reports success having asked nobody is how an
           * operator concludes there were no orders.
           */
          await ctx.log(
            'pod.sync_no_adapter',
            `${channel} is configured for ${ctx.division.name} but this app has no adapter for it; ` +
              'no orders were fetched and none will be',
            { level: 'warn' },
          )
          results.push({
            channel,
            status: 'no_adapter',
            seen: 0,
            recorded: 0,
            alreadyKnown: 0,
            simulatedDropped: 0,
            error: null,
          })
          continue
        }

        /* ---------------- how far back ---------------- */

        const [newest]: Array<{ placedAt: Date | null }> = await db
          .select({ placedAt: orders.placedAt })
          .from(orders)
          .where(and(eq(orders.divisionId, divisionId), eq(orders.channel, channel)))
          .orderBy(desc(orders.placedAt))
          .limit(1)

        const override = input.sinceIso ? new Date(input.sinceIso) : null
        const since =
          override && !Number.isNaN(override.getTime())
            ? override
            : syncWindowStart(newest?.placedAt ?? null, at)
        if (!earliest || since < earliest) earliest = since

        /* ---------------- ask ---------------- */

        let fetched: ChannelOrder[]
        try {
          fetched = await adapter.listOrders(since)
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err)
          /*
           * Logged and carried, not thrown.
           *
           * One channel being down must not stop the other from syncing, and a
           * throw here would abandon orders already ingested earlier in the loop.
           * The run reports the failure per channel so a persistent one is visible.
           */
          await ctx.log('pod.sync_failed', `${channel}: ${reason}`, { level: 'error' })
          results.push({
            channel,
            status: 'failed',
            seen: 0,
            recorded: 0,
            alreadyKnown: 0,
            simulatedDropped: 0,
            error: reason.slice(0, 300),
          })
          continue
        }

        /* ---------------- drop what is not real ---------------- */

        const live = fetched.filter((o) => o.provenance !== 'simulated')
        const simulatedDropped = fetched.length - live.length

        if (simulatedDropped > 0) {
          await ctx.log(
            'pod.sync_simulated_dropped',
            `${channel}: ${simulatedDropped} order(s) came back marked simulated and were not ` +
              'recorded; no sales channel is connected, so nothing here is a real sale',
            { level: 'warn' },
          )
        }

        let recorded = 0
        let alreadyKnown = 0

        for (const order of live) {
          try {
            const result = await ingestOrder(db, divisionId, {
              channel: order.channel,
              channelOrderId: order.channelOrderId,
              orderNumber: order.orderNumber,
              customerEmail: order.customerEmail,
              totalCents: order.totalCents,
              paid: order.paid,
              hasValidAddress: order.hasValidAddress,
              placedAt: order.placedAt,
              lines: order.lines.map((l) => ({
                channelLineItemId: l.channelLineItemId,
                sku: l.sku,
                quantity: l.quantity,
                unitPriceCents: l.unitPriceCents,
                personalization: l.personalization ?? null,
                personalized: l.personalized ?? false,
              })),
            })

            if (result.created) {
              recorded += 1
              newOrderIds.push(result.orderId)
              newOrderLabels.set(
                result.orderId,
                `Order ${order.orderNumber ?? order.channelOrderId}`,
              )
            } else {
              alreadyKnown += 1
            }
          } catch (err) {
            // One bad order does not abandon the rest of the page.
            await ctx.log(
              'pod.sync_order_failed',
              `${channel} order ${order.channelOrderId}: ${err instanceof Error ? err.message : String(err)}`,
              { level: 'error' },
            )
          }
        }

        results.push({
          channel,
          status: live.length === 0 && simulatedDropped > 0 ? 'all_simulated' : 'synced',
          seen: fetched.length,
          recorded,
          alreadyKnown,
          simulatedDropped,
          error: null,
        })
      }

      /* ---------------- hand the new ones on ---------------- */

      for (const orderId of newOrderIds) {
        try {
          await deps.onNewOrder?.({
            orderId,
            divisionId,
            label: newOrderLabels.get(orderId) ?? `Order ${orderId.slice(0, 8)}`,
          })
        } catch (err) {
          /*
           * The order is saved; only the nudge failed. Loud, because nothing will
           * route it until somebody runs the desk — an order sitting unrouted is
           * exactly the silence this agent exists to prevent.
           */
          await ctx.log(
            'pod.sync_dispatch_failed',
            `order ${orderId} is recorded but could not be queued for fulfilment: ` +
              `${err instanceof Error ? err.message : String(err)}`,
            { level: 'error', refTable: 'pod.orders', refId: orderId },
          )
        }
      }

      const totalRecorded = results.reduce((n, r) => n + r.recorded, 0)
      if (totalRecorded > 0) {
        /*
         * Only worth a line when something arrived.
         *
         * An hourly agent that writes "0 new orders" every hour buries every other
         * event on the floor, and the floor is where a real problem has to be
         * visible.
         */
        await ctx.log(
          'pod.sync_recorded',
          `${totalRecorded} order(s) arrived by sync that no webhook had delivered`,
        )
      }

      return {
        since: (earliest ?? at).toISOString(),
        channels: results,
        newOrderIds,
      }
    },
  }
}
