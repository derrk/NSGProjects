/**
 * Publishing an approved listing.
 *
 * Separate from the Store ops agent because of how Printify's publish works: the call
 * LOCKS the product, and the lock is only released when the caller reports back
 * `publishing_succeeded` or `publishing_failed`. A process that dies between the two
 * leaves the product permanently uneditable in a real shop.
 *
 * So the callback sits in a `finally`-shaped position on every path out, and
 * `reconcileStuckPublishes` exists for the one case that cannot cover: the process
 * dying between the publish and either callback.
 */

import { and, eq } from 'drizzle-orm'

import type { PrintifyClient } from '@acf/integrations/printify'

import { products } from './schema/index'

export interface PublishDeps {
  db: Record<string, unknown>
  printify: PrintifyClient
  shopId: string
  /**
   * Whose products these are.
   *
   * Required by `reconcileStuckPublishes`, which without it swept EVERY division's
   * pending products and called them against THIS division's shop id. The usual
   * outcome was a wasted lookup that threw and was skipped — but two divisions
   * sharing a Printify shop would have each one releasing the other's locks, and the
   * cost grew with the whole table rather than with one division's work.
   */
  divisionId?: string
  log?: (kind: string, message: string, level?: 'info' | 'warn' | 'error') => Promise<void>
}

export type PublishResult =
  | { status: 'published'; productId: string; externalId: string }
  | { status: 'skipped'; productId: string; reason: string }
  | { status: 'failed'; productId: string; reason: string }

/**
 * Publish one approved product.
 *
 * The external id is recorded before the callback, so a crash after publishing but
 * before reporting back still leaves a trail pointing at the locked product.
 */
export async function publishProduct(
  productId: string,
  deps: PublishDeps,
): Promise<PublishResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural db type
  const db = deps.db as any
  const log = deps.log ?? (async () => {})

  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1)
  if (!product) return { status: 'skipped', productId, reason: 'no such product' }
  if (!product.printifyProductId) {
    return { status: 'skipped', productId, reason: 'product was never created in Printify' }
  }
  if (product.status === 'published') {
    // Idempotent: a redelivered product.approved must not publish twice.
    return { status: 'skipped', productId, reason: 'already published' }
  }

  try {
    await deps.printify.publish(deps.shopId, product.printifyProductId)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await log('pod.publish_failed', `could not publish ${product.title}: ${reason}`, 'error')
    return { status: 'failed', productId, reason }
  }

  // From here the product is LOCKED in Printify until we call back.
  try {
    const fresh = await deps.printify.getProduct(deps.shopId, product.printifyProductId)
    const externalId = fresh.id

    await db
      .update(products)
      .set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(products.id, productId))

    await deps.printify.publishingSucceeded(deps.shopId, product.printifyProductId, {
      id: externalId,
      handle: product.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    })

    await log('pod.published', `published ${product.title}`)
    return { status: 'published', productId, externalId }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    // Release the lock on the way out. Without this the product is stuck forever.
    await deps.printify
      .publishingFailed(deps.shopId, product.printifyProductId, reason)
      .catch(() => {
        /* nothing more we can do here; the reconciler will find it */
      })
    await log('pod.publish_failed', `publish of ${product.title} failed: ${reason}`, 'error')
    return { status: 'failed', productId, reason }
  }
}

/**
 * Release products left locked by a crash.
 *
 * The callback above handles the ordinary failure. This handles the one it cannot:
 * the process dying between `publish` and either callback. Run it on a schedule.
 */
export async function reconcileStuckPublishes(deps: PublishDeps): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural db type
  const db = deps.db as any
  const log = deps.log ?? (async () => {})

  // Scoped to one division when the caller says which, because a sweep is not a
  // reason to touch another division's shop. Unscoped is kept only so the existing
  // callers that predate the field keep compiling; it is the wrong way to run this.
  const pending = await db
    .select()
    .from(products)
    .where(
      deps.divisionId
        ? and(eq(products.status, 'pending_approval'), eq(products.divisionId, deps.divisionId))
        : eq(products.status, 'pending_approval'),
    )

  let released = 0
  for (const product of pending) {
    if (!product.printifyProductId) continue
    try {
      const remote = await deps.printify.getProduct(deps.shopId, product.printifyProductId)
      if (!remote.is_locked) continue

      await deps.printify.publishingFailed(
        deps.shopId,
        product.printifyProductId,
        'the publish was interrupted; releasing the lock so the product can be edited',
      )
      released += 1
      await log(
        'pod.publish_unstuck',
        `released a stuck publish lock on ${product.title}`,
        'warn',
      )
    } catch {
      // A product we cannot read is not one we can safely unlock.
      continue
    }
  }
  return released
}
