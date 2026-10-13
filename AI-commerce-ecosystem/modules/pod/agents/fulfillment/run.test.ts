/**
 * The Fulfilment desk, against real SQL.
 *
 * This is the agent closest to spending money, so the tests are mostly about what
 * it REFUSES to do. The five rules themselves are tested next to `mayRouteOrder`;
 * what is tested here is that this runner feeds them the right facts — read off the
 * order row rather than off whatever queued the run, which on the webhook path came
 * from outside.
 */

import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { requestApproval } from '@acf/core/approvals'
import type { ApprovalOutcome, GateDeps } from '@acf/core/approvals'
import { runAgent } from '@acf/core/runtime'
import type { AgentRecord, DivisionRecord, RunLoopDeps } from '@acf/core/runtime'
import { agentRuns, approvalRules, approvals, divisions, events } from '@acf/db'
import { createTestDatabase, POD_MIGRATIONS, type TestDatabase } from '@acf/db/testing'

import { ingestOrder } from '../../fulfillment'
import { orderLines, orders as ordersTable, products, supplierOrders } from '../../schema/index'
import {
  createFulfillmentAgent,
  DEFAULT_MAX_FULFILLMENT_CENTS,
  maxFulfillmentCentsFrom,
  orderIdFrom,
} from './run'

let h: TestDatabase
let divisionId: string
let productId: string

const NOW = new Date('2026-10-09T12:00:00.000Z')

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
    .values({
      name: 'Paw Order',
      slug: 'paw-order',
      type: 'pod',
      status: 'active',
      config: { maxFulfillmentCostCents: 3000 },
    })
    .returning()
  divisionId = division!.id

  const [product] = await h.db
    .insert(products)
    .values({
      divisionId,
      type: 'mug_11oz',
      title: 'Senior dog mug',
      description: 'd',
      shopifyProductId: 'SHOPIFY-PROD-1',
      priceCents: 1899,
      costCents: 790,
      status: 'published',
    })
    .returning()
  productId = product!.id
})

async function recordOrder(over: Record<string, unknown> = {}, lineOver: Record<string, unknown> = {}) {
  return ingestOrder(h.db as never, divisionId, {
    channel: 'shopify',
    channelOrderId: 'SHOP-9001',
    orderNumber: '#9001',
    customerEmail: 'buyer@example.com',
    totalCents: 1899,
    paid: true,
    hasValidAddress: true,
    lines: [
      {
        channelLineItemId: 'LINE-1',
        sku: 'mug-11',
        channelProductId: 'SHOPIFY-PROD-1',
        quantity: 1,
        unitPriceCents: 1899,
        ...lineOver,
      },
    ],
    ...over,
  } as never)
}

function gateDeps(): GateDeps {
  return {
    approvals: {
      async findByRef(d, kind, refTable, refId) {
        const rows = await h.db.select().from(approvals).where(eq(approvals.refId, refId))
        return (rows.find(
          (r) => r.divisionId === d && r.kind === kind && r.refTable === refTable && r.decision !== 'rejected',
        ) ?? null) as never
      },
      async insert(row) {
        const [i] = await h.db.insert(approvals).values(row as never).returning()
        return i as never
      },
      async findById(id) {
        const [r] = await h.db.select().from(approvals).where(eq(approvals.id, id))
        return (r ?? null) as never
      },
      async update(id, patch) {
        const [r] = await h.db.update(approvals).set(patch as never).where(eq(approvals.id, id)).returning()
        return r as never
      },
    },
    rules: {
      async get(d, kind, category) {
        const rows = await h.db.select().from(approvalRules)
        return (rows.find((r) => r.divisionId === d && r.kind === kind && r.category === category) ?? null) as never
      },
      async upsert(rule) {
        await h.db
          .insert(approvalRules)
          .values(rule as never)
          .onConflictDoUpdate({
            target: [approvalRules.divisionId, approvalRules.kind, approvalRules.category],
            set: rule as never,
          })
        return rule
      },
    },
    events: { async emit(e) { await h.db.insert(events).values(e as never) } },
    bus: { async send() {} },
    clock: { now: () => NOW },
    newId: () => crypto.randomUUID(),
  }
}

async function runDesk(orderId: string, config: Record<string, unknown> | undefined = { maxFulfillmentCostCents: 3000 }) {
  const gate = gateDeps()
  const logged: Array<{ kind: string; message: string }> = []

  const deps: RunLoopDeps = {
    runs: {
      async start(record) {
        const [row] = await h.db.insert(agentRuns).values({ ...record, agentId: null, taskId: null } as never).returning()
        return row as never
      },
      async finish(id, patch) {
        const [row] = await h.db.update(agentRuns).set(patch as never).where(eq(agentRuns.id, id)).returning()
        return row as never
      },
    },
    events: {
      async emit(e) {
        logged.push({ kind: String(e.kind), message: String(e.message) })
        await h.db.insert(events).values({ ...e, agentId: null } as never)
      },
    },
    clock: { now: () => NOW },
    sleeper: { async sleep() {} },
    memory: { async recall() { return [] }, async write() {} },
    tools: {
      definitionsFor: () => [],
      async invoke() { return { ok: false, error: 'no tools', costCents: 0 } },
    } as never,
    requestApproval: (req) => requestApproval(req as never, gate) as Promise<ApprovalOutcome>,
  }

  const output = await runAgent(
    createFulfillmentAgent({ db: h.db as never }),
    {
      agent: {
        id: '66666666-6666-6666-6666-666666666666',
        divisionId,
        name: 'Fulfilment desk',
        moduleAgentKey: 'fulfillment',
        model: 'claude-haiku-5-5',
        systemPrompt: '',
        tools: [],
        autonomy: 'propose',
        maxSteps: 4,
      } as AgentRecord,
      division: { id: divisionId, name: 'Paw Order', type: 'pod', config } as DivisionRecord,
      input: { orderId },
      task: null,
    },
    deps,
  )

  return { output: output as unknown as Record<string, unknown>, logged }
}

/* ------------------------------------------------------------------ *
 * The small pure pieces
 * ------------------------------------------------------------------ */

describe('orderIdFrom', () => {
  it('reads a direct orderId and a matching ref', () => {
    expect(orderIdFrom({ orderId: 'a' })).toBe('a')
    expect(orderIdFrom({ refId: 'b', refTable: 'pod.orders' })).toBe('b')
  })

  it('refuses a ref to something that is not an order', () => {
    expect(orderIdFrom({ refId: 'c', refTable: 'pod.designs' })).toBeNull()
  })
})

describe('maxFulfillmentCentsFrom', () => {
  it('takes a configured ceiling', () => {
    expect(maxFulfillmentCentsFrom({ maxFulfillmentCostCents: 3000 })).toEqual({
      cents: 3000,
      configured: true,
    })
  })

  it('does NOT read a missing ceiling as zero', () => {
    /*
     * Zero would hold every line with a cost reason nobody set, which reads like a
     * policy decision and is a missing setting. The default is used and the caller
     * is told it was used.
     */
    for (const config of [{}, null, undefined, { maxFulfillmentCostCents: 0 }, { maxFulfillmentCostCents: -5 }, { maxFulfillmentCostCents: 'lots' }]) {
      const result = maxFulfillmentCentsFrom(config)
      expect(result.cents, JSON.stringify(config)).toBe(DEFAULT_MAX_FULFILLMENT_CENTS)
      expect(result.configured).toBe(false)
    }
  })
})

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

describe('the fulfilment desk', () => {
  it('queues a paid, addressed line for a published product', async () => {
    const { orderId } = await recordOrder()
    const { output } = await runDesk(orderId)

    expect(output['status']).toBe('queued')
    expect(output['linesQueued']).toBe(1)

    const staged = await h.db.select().from(supplierOrders)
    expect(staged).toHaveLength(1)
    // Staged, not sent. Nothing has been bought.
    expect(staged[0]!.status).toBe('ready_to_route')
  })

  it('HOLDS an unpaid order, reading paid off the row and not the task', async () => {
    /*
     * The fact that made these columns necessary. On the webhook path the task
     * input came from outside; the order row is what was verified at ingestion.
     */
    const { orderId } = await recordOrder({ paid: false })
    const { output } = await runDesk(orderId)

    expect(output['status']).toBe('all_held')
    expect((output['held'] as Array<{ needs: string }>)[0]!.needs).toBe('payment')
    expect(await h.db.select().from(supplierOrders)).toHaveLength(0)
  })

  it('holds an order with no usable address', async () => {
    const { orderId } = await recordOrder({ hasValidAddress: false })
    const { output } = await runDesk(orderId)
    expect((output['held'] as Array<{ needs: string }>)[0]!.needs).toBe('address')
  })

  it('holds a line for a product that was never published', async () => {
    // A product reaches `published` only by passing the product gate and the
    // Loading bay. Routing one that has not is selling something nobody approved.
    await h.db.update(products).set({ status: 'draft' }).where(eq(products.id, productId))
    const { orderId } = await recordOrder()
    const { output } = await runDesk(orderId)
    expect((output['held'] as Array<{ needs: string }>)[0]!.needs).toBe('approval')
  })

  it('holds a line whose product it could not match at all', async () => {
    const { orderId } = await recordOrder({}, { channelProductId: 'NOT-OURS' })
    const { output } = await runDesk(orderId)
    expect(output['status']).toBe('all_held')
  })

  it('holds a line that would cost more than the ceiling', async () => {
    await h.db.update(products).set({ costCents: 9_000 }).where(eq(products.id, productId))
    const { orderId } = await recordOrder()
    const { output } = await runDesk(orderId)
    expect((output['held'] as Array<{ needs: string }>)[0]!.needs).toBe('policy')
  })

  it('says so when it is holding against a ceiling nobody set', async () => {
    const { orderId } = await recordOrder()
    const { logged } = await runDesk(orderId, {})
    expect(logged.some((l) => l.kind === 'pod.fulfillment_default_ceiling')).toBe(true)
  })

  /* ---------------- the one thing that reaches a person ---------------- */

  it('files a proof approval for a personalised line, and routes nothing', async () => {
    const { orderId } = await recordOrder({}, {
      personalization: { 'Pet name': 'Biscuit' },
      personalized: true,
    })
    const { output } = await runDesk(orderId)

    expect(output['linesQueued']).toBe(0)
    expect((output['proofApprovalIds'] as string[])).toHaveLength(1)

    const [filed] = await h.db.select().from(approvals).where(eq(approvals.divisionId, divisionId))
    expect(filed!.kind).toBe('personalization_proof')

    // The card carries what the buyer typed, because reading it is the entire job.
    const payload = filed!.payload as Record<string, unknown>
    expect(payload['buyerInput']).toEqual({ 'Pet name': 'Biscuit' })
  })

  it('does not file a card for a hold the operator can already see', async () => {
    // An unpaid order needs no decision from anybody. Filing a card for it trains
    // the operator to clear the inbox without reading it.
    const { orderId } = await recordOrder({ paid: false })
    await runDesk(orderId)
    expect(await h.db.select().from(approvals)).toHaveLength(0)
  })

  it('does not file a second proof card when the task is redelivered', async () => {
    const { orderId } = await recordOrder({}, {
      personalization: { 'Pet name': 'Biscuit' },
      personalized: true,
    })
    await runDesk(orderId)
    await runDesk(orderId)
    expect(await h.db.select().from(approvals)).toHaveLength(1)
  })

  /* ---------------- idempotency and scope ---------------- */

  it('does not stage a second supplier order when run twice', async () => {
    const { orderId } = await recordOrder()
    await runDesk(orderId)
    const second = await runDesk(orderId)

    expect(await h.db.select().from(supplierOrders)).toHaveLength(1)
    expect(second.output['linesQueued']).toBe(0)
  })

  it('will not touch an order belonging to another division', async () => {
    const [theirs] = await h.db
      .insert(divisions)
      .values({ name: 'Other', slug: 'other', type: 'pod', status: 'active' })
      .returning()
    const { orderId } = await ingestOrder(h.db as never, theirs!.id, {
      channel: 'shopify',
      channelOrderId: 'THEIRS-1',
      totalCents: 100,
      paid: true,
      hasValidAddress: true,
      lines: [{ channelLineItemId: 'L1', quantity: 1, unitPriceCents: 100 }],
    } as never)

    await expect(runDesk(orderId)).rejects.toThrow(/does not exist in this division/)
  })

  it('refuses a task with no order rather than picking one', async () => {
    const gate = gateDeps()
    await expect(
      runAgent(
        createFulfillmentAgent({ db: h.db as never }),
        {
          agent: {
            id: '66666666-6666-6666-6666-666666666666',
            divisionId,
            name: 'Fulfilment desk',
            moduleAgentKey: 'fulfillment',
            model: 'claude-haiku-5-5',
            systemPrompt: '',
            tools: [],
            autonomy: 'propose',
            maxSteps: 4,
          } as AgentRecord,
          division: { id: divisionId, name: 'Paw Order', type: 'pod' } as DivisionRecord,
          input: {},
          task: null,
        },
        {
          runs: {
            async start(record) {
              const [row] = await h.db.insert(agentRuns).values({ ...record, agentId: null, taskId: null } as never).returning()
              return row as never
            },
            async finish(id, patch) {
              const [row] = await h.db.update(agentRuns).set(patch as never).where(eq(agentRuns.id, id)).returning()
              return row as never
            },
          },
          events: { async emit(e) { await h.db.insert(events).values({ ...e, agentId: null } as never) } },
          clock: { now: () => NOW },
          sleeper: { async sleep() {} },
          memory: { async recall() { return [] }, async write() {} },
          tools: { definitionsFor: () => [], async invoke() { return { ok: false, error: 'x', costCents: 0 } } } as never,
          requestApproval: (req) => requestApproval(req as never, gate) as Promise<ApprovalOutcome>,
        } as RunLoopDeps,
      ),
    ).rejects.toThrow(/cannot pick one/)
  })

  it('routes the lines it can and holds the ones it cannot, in one order', async () => {
    const { orderId } = await recordOrder({
      lines: [
        {
          channelLineItemId: 'LINE-1',
          channelProductId: 'SHOPIFY-PROD-1',
          quantity: 1,
          unitPriceCents: 1899,
        },
        {
          channelLineItemId: 'LINE-2',
          channelProductId: 'SHOPIFY-PROD-1',
          quantity: 1,
          unitPriceCents: 1899,
          personalization: { Name: 'Rex' },
          personalized: true,
        },
      ],
    })

    const { output } = await runDesk(orderId)
    expect(output['status']).toBe('queued')
    expect(output['linesQueued']).toBe(1)
    expect((output['proofApprovalIds'] as string[])).toHaveLength(1)
    expect(await h.db.select().from(orderLines).where(and(eq(orderLines.divisionId, divisionId)))).toHaveLength(2)
  })
})

describe('what the desk says is still missing', () => {
  it('warns that a staged line has no supplier and cannot be sent', async () => {
    /*
     * routeOrder stages a supplier order without choosing a supplier, because
     * choosing one is a decision with an approval behind it. The row is real,
     * correct and unsendable, and the support agent quoting a lead time off it
     * gets null for both ends of the range.
     */
    const { orderId } = await recordOrder()
    const { logged } = await runDesk(orderId)
    expect(logged.some((l) => l.kind === 'pod.queued_without_supplier')).toBe(true)
  })

  it('moves the order to needs_review when a proof is waiting on a person', async () => {
    // needs_review existed and nothing set it. An order left at `received` while a
    // card waits is invisible to every screen that counts work in progress.
    const { orderId } = await recordOrder({}, {
      personalization: { Name: 'Rex' },
      personalized: true,
    })
    await runDesk(orderId)

    const [row] = await h.db.select().from(ordersTable).where(eq(ordersTable.id, orderId))
    expect(row!.status).toBe('needs_review')
  })

  it('does not advance an order nobody has to look at', async () => {
    const { orderId } = await recordOrder()
    await runDesk(orderId)
    const [row] = await h.db.select().from(ordersTable).where(eq(ordersTable.id, orderId))
    expect(row!.status).toBe('received')
  })
})
