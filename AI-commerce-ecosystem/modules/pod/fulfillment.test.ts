/**
 * Order ingestion and routing, against real Postgres.
 *
 * Idempotency here is enforced by unique indexes, so testing it against a fake would
 * test nothing — the whole question is what the database does when two writes race.
 */

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { divisions } from '@acf/db'
import { createTestDatabase, POD_MIGRATIONS, type TestDatabase } from '@acf/db/testing'

import {
  customerVisibleStatus,
  ingestOrder,
  reviewPersonalization,
  routeOrder,
  staleSuppliers,
  STALE_SUPPLIER_DATA_DAYS,
  type IncomingOrder,
} from './fulfillment'
import { concepts, designs, orderLines, orders, products, supplierOrders, suppliers } from './schema/index'

let h: TestDatabase
let divisionId: string
let productId: string

beforeAll(async () => {
  h = await createTestDatabase({ moduleMigrations: [POD_MIGRATIONS] })
}, 120_000)

afterAll(async () => {
  await h.close()
})

beforeEach(async () => {
  await h.truncate()

  const [division] = await h.db
    .insert(divisions)
    .values({ name: 'Deadstock', slug: 'deadstock', type: 'pod', status: 'active' })
    .returning()
  divisionId = division!.id

  const [concept] = await h.db
    .insert(concepts)
    .values({ divisionId, title: 'c', promptBrief: 'b', style: 'flat-vector', status: 'approved' })
    .returning()
  const [design] = await h.db
    .insert(designs)
    .values({
      divisionId,
      conceptId: concept!.id,
      variantNo: 1,
      imageUrl: 'u',
      sourceModel: 'm',
      genPrompt: 'p',
      width: 1024,
      height: 1024,
    })
    .returning()
  const [product] = await h.db
    .insert(products)
    .values({
      divisionId,
      designId: design!.id,
      type: 'mug_11oz',
      title: 'Nurse Mug',
      description: 'd',
      priceCents: 1499,
      costCents: 520,
      status: 'published',
    })
    .returning()
  productId = product!.id
})

function incoming(over: Partial<IncomingOrder> = {}): IncomingOrder {
  return {
    channel: 'shopify',
    channelOrderId: 'SHOP-1001',
    orderNumber: '#1001',
    customerEmail: 'buyer@example.com',
    totalCents: 1499,
    paid: true,
    hasValidAddress: true,
    lines: [
      {
        channelLineItemId: 'LINE-1',
        sku: 'mug-11',
        productId,
        quantity: 1,
        unitPriceCents: 1499,
      },
    ],
    ...over,
  }
}

/* ------------------------------------------------------------------ *
 * Ingestion
 * ------------------------------------------------------------------ */

describe('ingestOrder', () => {
  it('records the order and its lines', async () => {
    const result = await ingestOrder(h.db as never, divisionId, incoming())

    expect(result).toMatchObject({ created: true, linesCreated: 1, linesSkipped: 0 })
    expect(await h.db.select().from(orders)).toHaveLength(1)
    expect(await h.db.select().from(orderLines)).toHaveLength(1)
  })

  it('IS IDEMPOTENT: a webhook delivered three times records one order', async () => {
    // Webhooks arriving more than once is normal, not a fault.
    const first = await ingestOrder(h.db as never, divisionId, incoming())
    const second = await ingestOrder(h.db as never, divisionId, incoming())
    const third = await ingestOrder(h.db as never, divisionId, incoming())

    expect(first.linesCreated).toBe(1)
    expect(second).toMatchObject({ created: false, linesCreated: 0, linesSkipped: 1 })
    expect(third.linesCreated).toBe(0)
    expect(second.orderId).toBe(first.orderId)

    expect(await h.db.select().from(orders)).toHaveLength(1)
    expect(await h.db.select().from(orderLines)).toHaveLength(1)
  })

  it('survives two deliveries arriving at the same moment', async () => {
    // A check-then-write loses this race; a unique index does not.
    const [a, b] = await Promise.all([
      ingestOrder(h.db as never, divisionId, incoming()),
      ingestOrder(h.db as never, divisionId, incoming()),
    ])

    expect(a.orderId).toBe(b.orderId)
    expect(a.linesCreated + b.linesCreated).toBe(1)
    expect(await h.db.select().from(orderLines)).toHaveLength(1)
  })

  it('adds a line that appears in a later delivery of the same order', async () => {
    await ingestOrder(h.db as never, divisionId, incoming())
    const second = await ingestOrder(
      h.db as never,
      divisionId,
      incoming({
        lines: [
          { channelLineItemId: 'LINE-1', productId, quantity: 1, unitPriceCents: 1499 },
          { channelLineItemId: 'LINE-2', productId, quantity: 2, unitPriceCents: 1499 },
        ],
      }),
    )

    expect(second).toMatchObject({ linesCreated: 1, linesSkipped: 1 })
    expect(await h.db.select().from(orderLines)).toHaveLength(2)
  })

  it('keeps the same line id from two different channels apart', async () => {
    await ingestOrder(h.db as never, divisionId, incoming({ channel: 'shopify' }))
    await ingestOrder(
      h.db as never,
      divisionId,
      incoming({ channel: 'etsy', channelOrderId: 'ETSY-1001' }),
    )

    // "LINE-1" means different things on different platforms.
    expect(await h.db.select().from(orderLines)).toHaveLength(2)
  })
})

/* ------------------------------------------------------------------ *
 * Routing
 * ------------------------------------------------------------------ */

describe('routeOrder', () => {
  const policy = () => ({ approvedProductIds: [productId], maxFulfillmentCostCents: 2_000 })
  const paidOk = { paid: true, hasValidAddress: true }

  it('routes an approved paid line once', async () => {
    const { orderId } = await ingestOrder(h.db as never, divisionId, incoming())
    const results = await routeOrder(h.db as never, orderId, policy(), paidOk)

    expect(results[0]).toMatchObject({ routed: true })
    expect(await h.db.select().from(supplierOrders)).toHaveLength(1)
  })

  it('ROUTES ONCE even when called repeatedly', async () => {
    const { orderId } = await ingestOrder(h.db as never, divisionId, incoming())

    await routeOrder(h.db as never, orderId, policy(), paidOk)
    const second = await routeOrder(h.db as never, orderId, policy(), paidOk)

    // Routing twice means paying a supplier twice for one item.
    expect(second[0]).toMatchObject({ routed: false, reason: expect.stringContaining('already') })
    expect(await h.db.select().from(supplierOrders)).toHaveLength(1)
  })

  it('creates one supplier order when two workers route at the same moment', async () => {
    const { orderId } = await ingestOrder(h.db as never, divisionId, incoming())

    await Promise.all([
      routeOrder(h.db as never, orderId, policy(), paidOk),
      routeOrder(h.db as never, orderId, policy(), paidOk),
    ])

    expect(await h.db.select().from(supplierOrders)).toHaveLength(1)
  })

  it('holds a line whose SKU has not been approved', async () => {
    const { orderId } = await ingestOrder(h.db as never, divisionId, incoming())
    const results = await routeOrder(
      h.db as never,
      orderId,
      { approvedProductIds: [], maxFulfillmentCostCents: 2_000 },
      paidOk,
    )

    expect(results[0]).toMatchObject({ routed: false, needs: 'approval' })
    expect(await h.db.select().from(supplierOrders)).toHaveLength(0)
  })

  it('holds an unpaid order', async () => {
    const { orderId } = await ingestOrder(h.db as never, divisionId, incoming({ paid: false }))
    const results = await routeOrder(h.db as never, orderId, policy(), {
      paid: false,
      hasValidAddress: true,
    })

    expect(results[0]).toMatchObject({ routed: false, needs: 'payment' })
  })

  it('HOLDS a personalised line until a human reviews the proof', async () => {
    const { orderId } = await ingestOrder(
      h.db as never,
      divisionId,
      incoming({
        lines: [
          {
            channelLineItemId: 'LINE-P',
            productId,
            quantity: 1,
            unitPriceCents: 1499,
            personalized: true,
            personalization: { petName: 'Biscuit' },
          },
        ],
      }),
    )

    const held = await routeOrder(h.db as never, orderId, policy(), paidOk)
    expect(held[0]).toMatchObject({ routed: false, needs: 'review' })

    const [line] = await h.db.select().from(orderLines)
    await reviewPersonalization(h.db as never, line!.id, 'operator')

    const routed = await routeOrder(h.db as never, orderId, policy(), paidOk)
    expect(routed[0]).toMatchObject({ routed: true })
  })

  it('holds a line that would cost more than the ceiling', async () => {
    const { orderId } = await ingestOrder(
      h.db as never,
      divisionId,
      incoming({
        lines: [{ channelLineItemId: 'LINE-BIG', productId, quantity: 10, unitPriceCents: 1499 }],
      }),
    )

    const results = await routeOrder(
      h.db as never,
      orderId,
      { approvedProductIds: [productId], maxFulfillmentCostCents: 2_000 },
      paidOk,
    )

    // 10 x 520c = 5200c, over the 2000c ceiling.
    expect(results[0]).toMatchObject({ routed: false, needs: 'policy' })
  })
})

/* ------------------------------------------------------------------ *
 * Customer-visible status
 * ------------------------------------------------------------------ */

describe('customerVisibleStatus', () => {
  const noLines: Array<{ personalized: boolean; personalizationReviewedAt: Date | null }> = []

  it('NEVER reports shipped just because a supplier was told', () => {
    // The whole point: handing an order to a supplier is not a parcel existing.
    expect(customerVisibleStatus([{ status: 'submitted' }], noLines)).toBe('in_production')
    expect(customerVisibleStatus([{ status: 'in_production' }], noLines)).toBe('in_production')
  })

  it('reports shipped only when every line has shipped', () => {
    expect(
      customerVisibleStatus([{ status: 'shipped' }, { status: 'shipped' }], noLines),
    ).toBe('shipped')
  })

  it('distinguishes a partial shipment', () => {
    expect(
      customerVisibleStatus([{ status: 'shipped' }, { status: 'in_production' }], noLines),
    ).toBe('partially_shipped')
  })

  it('reports delivered only when everything is delivered', () => {
    expect(customerVisibleStatus([{ status: 'delivered' }], noLines)).toBe('delivered')
    expect(
      customerVisibleStatus([{ status: 'delivered' }, { status: 'shipped' }], noLines),
    ).toBe('shipped')
  })

  it('surfaces an exception above everything else', () => {
    expect(
      customerVisibleStatus([{ status: 'shipped' }, { status: 'exception' }], noLines),
    ).toBe('exception')
  })

  it('reports awaiting review while a personalised line is unchecked', () => {
    expect(
      customerVisibleStatus([], [{ personalized: true, personalizationReviewedAt: null }]),
    ).toBe('awaiting_review')
  })

  it('reports received before anything has been routed', () => {
    expect(customerVisibleStatus([], [{ personalized: false, personalizationReviewedAt: null }])).toBe(
      'received',
    )
  })
})

/* ------------------------------------------------------------------ *
 * Supplier data freshness
 * ------------------------------------------------------------------ */

describe('staleSuppliers', () => {
  it('flags a supplier whose figures were never confirmed', async () => {
    await h.db
      .insert(suppliers)
      .values({ divisionId, name: 'CJ', kind: 'dropship', dataConfirmedAt: null })

    const stale = await staleSuppliers(h.db as never, divisionId)
    expect(stale).toHaveLength(1)
  })

  it('flags a supplier whose figures have aged out', async () => {
    const old = new Date(Date.now() - (STALE_SUPPLIER_DATA_DAYS + 2) * 86_400_000)
    await h.db
      .insert(suppliers)
      .values({ divisionId, name: 'CJ', kind: 'dropship', dataConfirmedAt: old })

    expect(await staleSuppliers(h.db as never, divisionId)).toHaveLength(1)
  })

  it('leaves a recently confirmed supplier alone', async () => {
    await h.db
      .insert(suppliers)
      .values({ divisionId, name: 'CJ', kind: 'dropship', dataConfirmedAt: new Date() })

    expect(await staleSuppliers(h.db as never, divisionId)).toHaveLength(0)
  })
})
