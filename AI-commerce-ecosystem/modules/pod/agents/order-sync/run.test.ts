/**
 * Receiving, against real SQL.
 *
 * The rule that outranks everything here is that a `simulated` order is never
 * written. The demo adapters return plausible orders marked as such, and ingesting
 * one puts a customer, a total and a line into the same tables a real sale uses —
 * after which nothing downstream can tell the difference and the ledger has revenue
 * nobody paid.
 */

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { runAgent } from '@acf/core/runtime'
import type { AgentRecord, DivisionRecord, RunLoopDeps } from '@acf/core/runtime'
import type { ChannelOrder, SalesChannel } from '@acf/integrations/channels'
import { agentRuns, divisions, events } from '@acf/db'
import { createTestDatabase, POD_MIGRATIONS, type TestDatabase } from '@acf/db/testing'

import { orderLines, orders } from '../../schema/index'
import {
  channelsFrom,
  createOrderSyncAgent,
  DEFAULT_LOOKBACK_HOURS,
  MAX_LOOKBACK_DAYS,
  SYNC_OVERLAP_MINUTES,
  syncWindowStart,
} from './run'

let h: TestDatabase
let divisionId: string

const NOW = new Date('2026-10-12T12:00:00.000Z')

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
      slug: 'pet-goods',
      type: 'pod',
      status: 'active',
      config: { channels: ['shopify'] },
    })
    .returning()
  divisionId = division!.id
})

function channelOrder(over: Partial<ChannelOrder> = {}): ChannelOrder {
  return {
    channel: 'shopify',
    channelOrderId: 'SHOP-7001',
    orderNumber: '#7001',
    customerEmail: 'buyer@example.com',
    totalCents: 1899,
    paid: true,
    hasValidAddress: true,
    placedAt: new Date('2026-10-12T11:00:00.000Z'),
    provenance: 'live',
    lines: [{ channelLineItemId: 'L1', sku: 'mug-11', quantity: 1, unitPriceCents: 1899 }],
    ...over,
  }
}

function stubChannel(orders: ChannelOrder[], opts: { throws?: string } = {}): SalesChannel {
  return {
    async listOrders() {
      if (opts.throws) throw new Error(opts.throws)
      return orders
    },
  } as unknown as SalesChannel
}

async function runSync(opts: {
  channels: Record<string, SalesChannel>
  config?: Record<string, unknown>
  input?: Record<string, unknown>
}) {
  const logged: Array<{ kind: string; message: string }> = []
  const dispatched: string[] = []

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
    tools: { definitionsFor: () => [], async invoke() { return { ok: false, error: 'x', costCents: 0 } } } as never,
    requestApproval: async () => {
      throw new Error('Receiving must not ask for an approval; it records what happened')
    },
  }

  const output = await runAgent(
    createOrderSyncAgent({
      db: h.db as never,
      channels: opts.channels as never,
      now: () => NOW,
      async onNewOrder({ orderId }) {
        dispatched.push(orderId)
      },
    }),
    {
      agent: {
        id: '77777777-7777-7777-7777-777777777777',
        divisionId,
        name: 'Receiving',
        moduleAgentKey: 'order_sync',
        model: 'claude-haiku-5-5',
        systemPrompt: '',
        tools: [],
        autonomy: 'propose',
        maxSteps: 4,
      } as AgentRecord,
      division: {
        id: divisionId,
        name: 'Paw Order',
        type: 'pod',
        config: opts.config ?? { channels: ['shopify'] },
      } as DivisionRecord,
      input: opts.input ?? {},
      task: null,
    },
    deps,
  )

  return { output: output as unknown as Record<string, unknown>, logged, dispatched }
}

/* ------------------------------------------------------------------ *
 * The window
 * ------------------------------------------------------------------ */

describe('syncWindowStart', () => {
  it('falls back to the default lookback when nothing is recorded', () => {
    const start = syncWindowStart(null, NOW)
    expect(NOW.getTime() - start.getTime()).toBe(DEFAULT_LOOKBACK_HOURS * 3600_000)
  })

  it('overlaps the newest order rather than resuming exactly at it', () => {
    // Resuming at the newest timestamp loses anything placed in the same second,
    // and anything a platform made visible out of order.
    const newest = new Date('2026-10-12T11:00:00.000Z')
    const start = syncWindowStart(newest, NOW)
    expect(newest.getTime() - start.getTime()).toBeGreaterThanOrEqual(SYNC_OVERLAP_MINUTES * 60_000)
  })

  it('still asks about the last two days when the newest order is ancient', () => {
    const start = syncWindowStart(new Date('2026-01-01T00:00:00.000Z'), NOW)
    expect(start.getTime()).toBeGreaterThanOrEqual(NOW.getTime() - MAX_LOOKBACK_DAYS * 86_400_000)
  })

  it('never walks back further than the floor, whatever it is handed', () => {
    const start = syncWindowStart(new Date('1999-01-01T00:00:00.000Z'), NOW)
    expect(start.getTime()).toBe(NOW.getTime() - MAX_LOOKBACK_DAYS * 86_400_000)
  })

  it('ignores an unusable date rather than producing an Invalid Date window', () => {
    const start = syncWindowStart(new Date('nonsense'), NOW)
    expect(Number.isNaN(start.getTime())).toBe(false)
  })
})

describe('channelsFrom', () => {
  it('reads the configured channels', () => {
    expect(channelsFrom({ channels: ['shopify', 'etsy'] })).toEqual(['shopify', 'etsy'])
  })

  it('ignores anything that is not a channel this module knows', () => {
    expect(channelsFrom({ channels: ['shopify', 'amazon', '', 42] })).toEqual(['shopify'])
  })

  it('is empty rather than throwing on a shape it cannot read', () => {
    for (const config of [{}, null, undefined, { channels: 'shopify' }]) {
      expect(channelsFrom(config)).toEqual([])
    }
  })
})

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

describe('Receiving', () => {
  it('records an order no webhook delivered, and hands it on', async () => {
    const { output, dispatched } = await runSync({ channels: { shopify: stubChannel([channelOrder()]) } })

    expect((output['channels'] as Array<{ recorded: number }>)[0]!.recorded).toBe(1)
    expect(await h.db.select().from(orders)).toHaveLength(1)
    expect(await h.db.select().from(orderLines)).toHaveLength(1)
    expect(dispatched).toHaveLength(1)
  })

  it('NEVER records a simulated order', async () => {
    /*
     * The whole point. A demo order written here is a customer, a total and a line
     * in the same tables a real sale uses, and from that moment nothing downstream
     * can tell the difference — the ledger shows revenue nobody paid.
     */
    const { output, logged, dispatched } = await runSync({
      channels: { shopify: stubChannel([channelOrder({ provenance: 'simulated' })]) },
    })

    expect(await h.db.select().from(orders)).toHaveLength(0)
    expect(dispatched).toEqual([])
    const row = (output['channels'] as Array<Record<string, unknown>>)[0]!
    expect(row['simulatedDropped']).toBe(1)
    expect(row['status']).toBe('all_simulated')
    expect(logged.some((l) => l.kind === 'pod.sync_simulated_dropped')).toBe(true)
  })

  it('keeps the live ones from a mixed batch and drops only the demo ones', async () => {
    const { output } = await runSync({
      channels: {
        shopify: stubChannel([
          channelOrder({ channelOrderId: 'REAL-1' }),
          channelOrder({ channelOrderId: 'FAKE-1', provenance: 'simulated' }),
        ]),
      },
    })

    const rows = await h.db.select().from(orders)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.channelOrderId).toBe('REAL-1')
    expect((output['channels'] as Array<{ simulatedDropped: number }>)[0]!.simulatedDropped).toBe(1)
  })

  it('reports an order the webhook already recorded as already known', async () => {
    await runSync({ channels: { shopify: stubChannel([channelOrder()]) } })
    const { output, dispatched } = await runSync({
      channels: { shopify: stubChannel([channelOrder()]) },
    })

    const row = (output['channels'] as Array<Record<string, unknown>>)[0]!
    expect(row['recorded']).toBe(0)
    expect(row['alreadyKnown']).toBe(1)
    expect(await h.db.select().from(orders)).toHaveLength(1)
    // And it does not queue the fulfilment desk a second time for the same order.
    expect(dispatched).toEqual([])
  })

  it('keeps syncing the other channel when one is down', async () => {
    // A throw would abandon orders already ingested earlier in the loop.
    const { output } = await runSync({
      config: { channels: ['shopify', 'etsy'] },
      channels: {
        shopify: stubChannel([], { throws: 'shopify 503' }),
        etsy: stubChannel([channelOrder({ channel: 'etsy', channelOrderId: 'ETSY-1' })]),
      },
    })

    const rows = output['channels'] as Array<Record<string, unknown>>
    expect(rows.find((r) => r['channel'] === 'shopify')!['status']).toBe('failed')
    expect(rows.find((r) => r['channel'] === 'etsy')!['recorded']).toBe(1)
    expect(await h.db.select().from(orders)).toHaveLength(1)
  })

  it('says so when a configured channel has no adapter, rather than reporting success', async () => {
    /*
     * The division believes it sells there. A sync that reports success having
     * asked nobody is how an operator concludes there were no orders.
     */
    const { output, logged } = await runSync({
      config: { channels: ['shopify', 'etsy'] },
      channels: { shopify: stubChannel([]) },
    })

    const etsy = (output['channels'] as Array<Record<string, unknown>>).find(
      (r) => r['channel'] === 'etsy',
    )!
    expect(etsy['status']).toBe('no_adapter')
    expect(logged.some((l) => l.kind === 'pod.sync_no_adapter')).toBe(true)
  })

  it('says so when the division lists no channels at all', async () => {
    const { logged } = await runSync({ config: {}, channels: {} })
    expect(logged.some((l) => l.kind === 'pod.sync_no_channels')).toBe(true)
  })

  it('stays quiet when there was nothing new, so the floor is not buried', async () => {
    // An hourly agent writing "0 new orders" every hour hides every other event on
    // the floor, which is where a real problem has to be visible.
    const { logged } = await runSync({ channels: { shopify: stubChannel([]) } })
    expect(logged.some((l) => l.kind === 'pod.sync_recorded')).toBe(false)
  })

  it('carries on past one bad order instead of abandoning the page', async () => {
    const { output } = await runSync({
      channels: {
        shopify: stubChannel([
          // No lines at all: the line loop writes nothing and the order still records.
          channelOrder({ channelOrderId: 'ODD-1', lines: [] }),
          channelOrder({ channelOrderId: 'GOOD-1' }),
        ]),
      },
    })
    expect((output['channels'] as Array<{ recorded: number }>)[0]!.recorded).toBe(2)
  })

  it('honours an explicit window for a catch-up after an outage', async () => {
    const { output } = await runSync({
      channels: { shopify: stubChannel([channelOrder()]) },
      input: { sinceIso: '2026-10-01T00:00:00.000Z' },
    })
    expect(String(output['since'])).toBe('2026-10-01T00:00:00.000Z')
  })

  it('can be pointed at one channel for a manual run', async () => {
    const { output } = await runSync({
      config: { channels: ['shopify', 'etsy'] },
      channels: { shopify: stubChannel([]), etsy: stubChannel([]) },
      input: { channel: 'etsy' },
    })
    expect(output['channels']).toHaveLength(1)
    expect((output['channels'] as Array<{ channel: string }>)[0]!.channel).toBe('etsy')
  })

  it('treats an unreadable input as a default run rather than failing', async () => {
    const { output, logged } = await runSync({
      channels: { shopify: stubChannel([channelOrder()]) },
      input: { channel: 'amazon', sinceIso: 42 } as never,
    })
    expect(logged.some((l) => l.kind === 'pod.sync_input_unreadable')).toBe(true)
    expect((output['channels'] as unknown[]).length).toBeGreaterThan(0)
  })
})
