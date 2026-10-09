/**
 * Publishing, and the Printify lock.
 *
 * The lock is the thing worth testing. `publish` locks the product and only a callback
 * releases it, so every path out of `publishProduct` must call back — otherwise the
 * product is permanently uneditable in a real shop.
 */

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { divisions } from '@acf/db'
import { createTestDatabase, POD_MIGRATIONS, type TestDatabase } from '@acf/db/testing'
import { createMockPrintifyClient, PrintifyError } from '@acf/integrations/printify'

import { publishProduct, reconcileStuckPublishes } from './publish'
import { concepts, designs, products } from './schema/index'

let h: TestDatabase

beforeAll(async () => {
  h = await createTestDatabase({ moduleMigrations: [POD_MIGRATIONS] })
}, 120_000)

afterAll(async () => {
  await h.close()
})

beforeEach(async () => {
  await h.truncate()
})

async function seed(printify: ReturnType<typeof createMockPrintifyClient>) {
  const [division] = await h.db
    .insert(divisions)
    .values({ name: 'Deadstock', slug: 'deadstock', type: 'pod', status: 'active' })
    .returning()

  const [concept] = await h.db
    .insert(concepts)
    .values({
      divisionId: division!.id,
      title: 'c',
      promptBrief: 'b',
      style: 'flat-vector',
      status: 'approved',
    })
    .returning()

  const [design] = await h.db
    .insert(designs)
    .values({
      divisionId: division!.id,
      conceptId: concept!.id,
      variantNo: 1,
      imageUrl: 'u',
      sourceModel: 'm',
      genPrompt: 'p',
      width: 1024,
      height: 1024,
    })
    .returning()

  const remote = await printify.createProduct('1', {
    title: 'Nurse Mug',
    description: 'd',
    tags: [],
    blueprintId: 68,
    printProviderId: 99,
    variants: [{ id: 1, price: 1499, is_enabled: true }],
    printAreas: [],
  })

  const [product] = await h.db
    .insert(products)
    .values({
      divisionId: division!.id,
      designId: design!.id,
      type: 'mug_11oz',
      printifyProductId: remote.id,
      title: 'Nurse Mug',
      description: 'd',
      priceCents: 1499,
      costCents: 520,
      status: 'pending_approval',
    })
    .returning()

  return { division: division!, product: product!, remote }
}

describe('publishProduct', () => {
  it('publishes, records it, and releases the lock', async () => {
    const printify = createMockPrintifyClient()
    const { product, remote } = await seed(printify)

    const result = await publishProduct(product.id, { db: h.db as never, printify, shopId: '1' })

    expect(result.status).toBe('published')
    expect(printify.calls.publish).toEqual([remote.id])
    expect(printify.calls.publishingSucceeded).toEqual([remote.id])
    expect(printify.products.get(remote.id)!.is_locked).toBe(false)

    const [row] = await h.db.select().from(products).where(eq(products.id, product.id))
    expect(row!.status).toBe('published')
    expect(row!.publishedAt).not.toBeNull()
  })

  it('is idempotent: a redelivered approval does not publish twice', async () => {
    const printify = createMockPrintifyClient()
    const { product } = await seed(printify)

    await publishProduct(product.id, { db: h.db as never, printify, shopId: '1' })
    const second = await publishProduct(product.id, { db: h.db as never, printify, shopId: '1' })

    // A duplicate publish is a duplicate listing in a real shop.
    expect(second).toMatchObject({ status: 'skipped', reason: 'already published' })
    expect(printify.calls.publish).toHaveLength(1)
  })

  it('releases the lock when something fails AFTER publishing', async () => {
    const printify = createMockPrintifyClient()
    const { product, remote } = await seed(printify)

    // Fail between the publish and the success callback — the dangerous window.
    printify.getProduct = async () => {
      throw new PrintifyError('network went away')
    }

    const result = await publishProduct(product.id, { db: h.db as never, printify, shopId: '1' })

    expect(result.status).toBe('failed')
    // Without this the product stays uneditable in Printify forever.
    expect(printify.calls.publishingFailed).toEqual([
      { productId: remote.id, reason: 'network went away' },
    ])
    expect(printify.products.get(remote.id)!.is_locked).toBe(false)
  })

  it('does not mark a product published when the publish call itself failed', async () => {
    const printify = createMockPrintifyClient()
    const { product } = await seed(printify)
    printify.publish = async () => {
      throw new PrintifyError('rate limited', 429)
    }

    const result = await publishProduct(product.id, { db: h.db as never, printify, shopId: '1' })

    expect(result.status).toBe('failed')
    const [row] = await h.db.select().from(products).where(eq(products.id, product.id))
    expect(row!.status).toBe('pending_approval')
    // Nothing got locked, so nothing needs releasing.
    expect(printify.calls.publishingFailed).toEqual([])
  })

  it('skips a product that was never created in Printify', async () => {
    const printify = createMockPrintifyClient()
    const { division } = await seed(printify)
    const [orphan] = await h.db
      .insert(products)
      .values({
        divisionId: division.id,
        type: 'tee',
        title: 'Draft only',
        description: 'd',
        priceCents: 2199,
        costCents: 1180,
        status: 'pending_approval',
      })
      .returning()

    expect(
      await publishProduct(orphan!.id, { db: h.db as never, printify, shopId: '1' }),
    ).toMatchObject({ status: 'skipped', reason: 'product was never created in Printify' })
  })

  it('skips a product that does not exist', async () => {
    const printify = createMockPrintifyClient()
    expect(
      await publishProduct('00000000-0000-0000-0000-000000000000', {
        db: h.db as never,
        printify,
        shopId: '1',
      }),
    ).toMatchObject({ status: 'skipped' })
  })
})

describe('reconcileStuckPublishes', () => {
  it('releases a product left locked by a crash', async () => {
    const printify = createMockPrintifyClient()
    const { remote } = await seed(printify)

    // The process dying immediately after publish: locked, no callback ever sent.
    await printify.publish('1', remote.id)

    expect(await reconcileStuckPublishes({ db: h.db as never, printify, shopId: '1' })).toBe(1)
    expect(printify.calls.publishingFailed[0]!.productId).toBe(remote.id)
    expect(printify.products.get(remote.id)!.is_locked).toBe(false)
  })

  it('leaves an unlocked product alone', async () => {
    const printify = createMockPrintifyClient()
    await seed(printify)
    expect(await reconcileStuckPublishes({ db: h.db as never, printify, shopId: '1' })).toBe(0)
  })

  it('does not unlock a product it cannot read', async () => {
    const printify = createMockPrintifyClient()
    const { remote } = await seed(printify)
    await printify.publish('1', remote.id)
    printify.getProduct = async () => {
      throw new PrintifyError('gone', 404)
    }

    // A product we cannot read is not one we can safely act on.
    expect(await reconcileStuckPublishes({ db: h.db as never, printify, shopId: '1' })).toBe(0)
  })
})
