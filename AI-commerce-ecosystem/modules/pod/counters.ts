/**
 * The numbers on the factory floor.
 *
 * Every station declares a counter name and core resolves none of them — it hands
 * over a division id and a window and nothing else, so it never has to learn what a
 * design is. That is the same boundary that lets a division be deleted.
 *
 * The rule that matters here: null is not zero. A counter returns null when the thing
 * it counts cannot be counted yet, and the floor shows a dash. Returning 0 instead
 * would make a station that has never worked look exactly like a station that had a
 * quiet day — and the floor exists to tell those apart.
 */

import { and, count, eq, gte, lt } from 'drizzle-orm'

import type { CounterContext, CounterResolvers } from '@acf/core/modules'

import { concepts, designs, orders, products, replies, suppliers } from './schema/index'

type Db = Record<string, unknown>

/** Rows of `table` for this division inside the window, by its createdAt. */
async function countInWindow(
  db: Db,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural table type
  table: any,
  ctx: CounterContext,
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural db type
  const database = db as any
  const [row] = await database
    .select({ n: count() })
    .from(table)
    .where(
      and(
        eq(table.divisionId, ctx.divisionId),
        gte(table.createdAt, ctx.since),
        lt(table.createdAt, ctx.until),
      ),
    )
  return Number(row?.n ?? 0)
}

export function createPodCounters(db: Db): CounterResolvers {
  return {
    /** Concepts the scout proposed today. */
    'pod.concepts_today': async (ctx) => countInWindow(db, concepts, ctx),

    /** Design variants produced today. Three per approved concept. */
    'pod.designs_today': async (ctx) => countInWindow(db, designs, ctx),

    /**
     * Listings that went public today.
     *
     * Counted on `publishedAt`, not `createdAt`: a product drafted last week and
     * published this morning belongs to this morning. Counting it by creation would
     * report the day the work started rather than the day anything reached a buyer.
     */
    'pod.published_today': async (ctx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural db type
      const database = db as any
      const [row] = await database
        .select({ n: count() })
        .from(products)
        .where(
          and(
            eq(products.divisionId, ctx.divisionId),
            gte(products.publishedAt, ctx.since),
            lt(products.publishedAt, ctx.until),
          ),
        )
      return Number(row?.n ?? 0)
    },

    /**
     * Replies drafted today.
     *
     * Drafted, never sent — this system has no send path. The floor labels it
     * accordingly, because "replies today" on a support station reads as messages
     * that reached a customer, and none have.
     */
    'pod.replies_today': async (ctx) => countInWindow(db, replies, ctx),

    /**
     * Suppliers the scout has written up, ever.
     *
     * Not a daily figure: the scout runs weekly, so a daily count would read zero on
     * six days out of seven and tell the operator nothing. The floor labels this one
     * as a running total rather than today's.
     */
    'pod.suppliers_reviewed': async (ctx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural db type
      const database = db as any
      const [row] = await database
        .select({ n: count() })
        .from(suppliers)
        .where(eq(suppliers.divisionId, ctx.divisionId))
      return Number(row?.n ?? 0)
    },

    /**
     * Finance reports filed.
     *
     * There is no table for them yet — the Counting house writes its note into the
     * run record and a memory, neither of which is a report row. Null rather than
     * zero, so the floor shows a dash and nobody reads "0 reports" as a failing
     * agent.
     */
    'pod.reports_filed': async () => null,

    /*
     * The two below are goal metrics rather than station counters.
     *
     * They resolve through the same mechanism because a goal asks the same question
     * a counter does — "how many of X does this division have" — and a second
     * parallel way to answer it is a second place for the answer to be wrong.
     * Cumulative: the window is ignored, which is what a goal means.
     */

    /** Products currently published. What "60 products live" counts. */
    'pod.products_live': async (ctx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural db type
      const database = db as any
      const [row] = await database
        .select({ n: count() })
        .from(products)
        .where(and(eq(products.divisionId, ctx.divisionId), eq(products.status, 'published')))
      return Number(row?.n ?? 0)
    },

    /** Orders received, ever. */
    'pod.orders_total': async (ctx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural db type
      const database = db as any
      const [row] = await database
        .select({ n: count() })
        .from(orders)
        .where(eq(orders.divisionId, ctx.divisionId))
      return Number(row?.n ?? 0)
    },
  }
}

/** Every counter this module can resolve. Declared on the module, validated at boot. */
export const POD_COUNTER_NAMES = [
  'pod.concepts_today',
  'pod.designs_today',
  'pod.published_today',
  'pod.replies_today',
  'pod.suppliers_reviewed',
  'pod.reports_filed',
  'pod.products_live',
  'pod.orders_total',
]
