/**
 * Loading bay — the last step, and the last orphan.
 *
 * `publishProduct` and `reconcileStuckPublishes` were both written, both tested, and
 * both called by nothing. Approving a `product` therefore did precisely nothing: the
 * card cleared, the operator believed a listing had gone live, and the product sat at
 * `pending_approval` forever. The same shape as the concept gap, one step further
 * down — a function with a test suite and no caller reads exactly like a working
 * feature from everywhere except the database.
 *
 * Makes no model call. By the time a product is approved every judgement has been
 * made and written down; asking a model to confirm them would only add a way for the
 * answer to come back different.
 *
 * The thing to be careful about here is not the decision, it is the LOCK. A Printify
 * publish locks the product until the caller reports back `publishing_succeeded` or
 * `publishing_failed`, and a process that dies between the two leaves a product
 * permanently uneditable in a real shop. `publishProduct` handles every path it can;
 * this runner handles the one it cannot, by reconciling before it publishes.
 */

import type { AgentContext, AgentDefinition } from '@acf/core/runtime'
import { NonRetriableError } from '@acf/core/runtime'
import type { PrintifyClient } from '@acf/integrations/printify'
import * as z from 'zod'

import { publishProduct, reconcileStuckPublishes } from '../../publish'

export const publisherInputSchema = z.object({
  /** Set by a direct or manual invocation. */
  productId: z.string().optional(),
  /** What the dispatcher sends when a `product` approval is approved. */
  refId: z.string().optional(),
  refTable: z.string().optional(),
})

export type PublisherInput = z.infer<typeof publisherInputSchema>

export const publisherOutputSchema = z.object({
  productId: z.string(),
  status: z.enum(['published', 'skipped', 'failed']),
  /** The id the channel gave it. Null unless it actually went live. */
  externalId: z.string().nullable(),
  reason: z.string().nullable(),
  /** Products a previous crash left locked that this run released. */
  releasedStuck: z.number(),
})

export type PublisherOutput = z.infer<typeof publisherOutputSchema>

export interface PublisherDeps {
  db: Record<string, unknown>
  printify: PrintifyClient
}

/** The product this task is about, whichever shape it arrived in. */
export function productIdFrom(input: PublisherInput): string | null {
  if (input.productId) return input.productId
  // A ref to anything else is not ours. Acting on it means looking up a design id in
  // the products table, and the bad case is not "not found" — it is finding a row.
  if (input.refTable && input.refTable !== 'pod.products') return null
  return input.refId ?? null
}

/**
 * The Printify shop this division publishes into.
 *
 * Read from division config, and ABSENT is a hard stop rather than a default. There
 * is no sensible fallback: publishing into whatever shop happened to be first would
 * put a listing in front of somebody else's customers, and publishing into a made-up
 * id fails in a way that looks like a Printify outage.
 */
export function shopIdFrom(config: unknown): string | null {
  const c = (config ?? {}) as Record<string, unknown>
  const raw = c['printifyShopId']
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
  return null
}

export function createPublisherAgent(
  deps: PublisherDeps,
): AgentDefinition<PublisherInput, PublisherOutput> {
  return {
    key: 'publisher',
    outputSchema: publisherOutputSchema,

    async run(ctx: AgentContext<PublisherInput>): Promise<PublisherOutput> {
      const parsed = publisherInputSchema.safeParse(ctx.input)
      if (!parsed.success) {
        throw new NonRetriableError(
          'the task input is not a shape this agent can read; it needs a product to publish',
        )
      }

      const productId = productIdFrom(parsed.data)
      if (!productId) {
        throw new NonRetriableError(
          'no product to publish; this agent pushes an approved listing live and cannot pick one',
        )
      }

      const shopId = shopIdFrom(ctx.division.config)
      if (!shopId) {
        /*
         * Not retriable, and said in the operator's terms rather than the API's.
         *
         * This is the one piece of setup that cannot be inferred from anything, and
         * until there is a screen for it the error message IS the documentation. A
         * generic "publish failed" here would send somebody looking at Printify's
         * status page for a value that is missing from their own database.
         */
        throw new NonRetriableError(
          `division "${ctx.division.name}" has no printifyShopId in its config, so there is ` +
            'nowhere to publish to. Set it on the division before approving listings — it is ' +
            'the numeric shop id from your Printify account, and nothing else can supply it.',
        )
      }

      const log = async (kind: string, message: string, level: 'info' | 'warn' | 'error' = 'info') => {
        await ctx.log(kind, message, { level, refTable: 'pod.products', refId: productId })
      }

      const publishDeps = {
        db: deps.db,
        printify: deps.printify,
        shopId,
        // Scoped. Without it the sweep below reads every division's pending products
        // and calls them against THIS division's shop.
        divisionId: ctx.division.id,
        log,
      }

      /*
       * Reconcile BEFORE publishing, not after.
       *
       * `publishProduct` releases the lock on every path it controls. The path it
       * cannot control is the process dying between the publish call and either
       * callback, and the product that lock belongs to is then uneditable until
       * somebody notices. Running the sweep here means it happens whenever the shop
       * is actually doing something, which is when it matters.
       *
       * It does NOT cover a division whose publishing has stopped entirely — a lock
       * left by the last crash before a quiet week stays until the next publish. That
       * wants its own schedule, and it does not have one yet.
       */
      let releasedStuck = 0
      try {
        releasedStuck = await reconcileStuckPublishes(publishDeps)
        if (releasedStuck > 0) {
          await log(
            'pod.publish_locks_released',
            `released ${releasedStuck} product(s) a previous run left locked in Printify`,
            'warn',
          )
        }
      } catch (err) {
        /*
         * A failed sweep must not stop the publish.
         *
         * The sweep is housekeeping for a rare crash; the publish is the thing the
         * operator approved. Letting a problem during reconciliation block an
         * approved listing would turn a tidy-up into an outage.
         *
         * `reconcileStuckPublishes` already skips a single product it cannot read,
         * so this catches the whole-sweep case — the query itself failing — rather
         * than one bad lookup.
         */
        await log(
          'pod.publish_reconcile_failed',
          `could not sweep for locked products: ${err instanceof Error ? err.message : String(err)}`,
          'warn',
        )
      }

      const result = await publishProduct(productId, publishDeps)

      if (result.status === 'published') {
        ctx.remember({
          kind: 'result',
          content: `Published product ${productId} to shop ${shopId}.`,
          importance: 0.3,
        })
        return {
          productId,
          status: 'published',
          externalId: result.externalId,
          reason: null,
          releasedStuck,
        }
      }

      if (result.status === 'failed') {
        /*
         * Thrown, not returned quietly.
         *
         * A failed publish that returns `ok` leaves a task marked done, a cleared
         * approval, and a product that is not live — which is the exact state the
         * operator has no way to see. Retriable on purpose: a Printify 500 is the
         * ordinary reason this fails and the next attempt usually works. The lock was
         * already released on the way out of publishProduct.
         */
        throw new Error(`publishing ${productId} failed: ${result.reason}`)
      }

      // Skipped: already published, or never created in Printify. Both are states
      // somebody should be able to see rather than a silent success.
      await log('pod.publish_skipped', `did not publish: ${result.reason}`, 'warn')
      return {
        productId,
        status: 'skipped',
        externalId: null,
        reason: result.reason,
        releasedStuck,
      }
    },
  }
}
