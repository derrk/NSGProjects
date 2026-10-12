/**
 * The Loading bay, against real SQL.
 *
 * The thing this agent is for is a function that existed and was called by nothing,
 * so most of these tests are about the states that produced: a cleared approval and
 * a product that never went live, a lock nobody released, a config value nobody set.
 *
 * `publishProduct` itself is tested next to its own file. What is tested here is the
 * wiring: that a failure is LOUD rather than a quiet ok, that a missing shop id stops
 * the run with a sentence somebody can act on, and that a redelivered approval does
 * not publish twice.
 */

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { runAgent } from '@acf/core/runtime'
import type { AgentRecord, DivisionRecord, RunLoopDeps } from '@acf/core/runtime'
import { agentRuns, divisions, events } from '@acf/db'
import { createTestDatabase, POD_MIGRATIONS, type TestDatabase } from '@acf/db/testing'

import { products } from '../../schema/index'
import { createPublisherAgent, productIdFrom, shopIdFrom } from './run'

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

const NOW = new Date('2026-10-09T12:00:00.000Z')
const SHOP = '998877'

interface FakePrintify {
  calls: string[]
  failPublish?: string
  failGet?: string
  locked?: Set<string>
}

function printify(opts: FakePrintify) {
  opts.calls = opts.calls ?? []
  return {
    client: {
      async publish(shopId: string, id: string) {
        opts.calls.push(`publish:${shopId}:${id}`)
        if (opts.failPublish) throw new Error(opts.failPublish)
      },
      async getProduct(shopId: string, id: string) {
        opts.calls.push(`get:${id}`)
        if (opts.failGet) throw new Error(opts.failGet)
        return { id: `ext_${id}`, is_locked: opts.locked?.has(id) ?? false }
      },
      async publishingSucceeded(_shop: string, id: string) {
        opts.calls.push(`succeeded:${id}`)
      },
      async publishingFailed(_shop: string, id: string) {
        opts.calls.push(`failed:${id}`)
      },
    } as never,
    calls: opts.calls,
  }
}

async function seedDivision(config: Record<string, unknown> = { printifyShopId: SHOP }) {
  const [row] = await h.db
    .insert(divisions)
    .values({ name: 'Pet depot', slug: 'pet-depot', type: 'pod', status: 'active', config })
    .returning()
  return row!
}

async function seedProduct(divisionId: string, over: Record<string, unknown> = {}) {
  const [row] = await h.db
    .insert(products)
    .values({
      divisionId,
      title: 'Senior dog schedule mug',
      description: 'A mug.',
      type: 'mug_11oz',
      printifyProductId: 'pf_1',
      priceCents: 1899,
      costCents: 790,
      status: 'pending_approval',
      actor: 'operator',
      ...over,
    })
    .returning()
  return row!
}

async function runPublisher(opts: {
  division: Record<string, unknown>
  input: Record<string, unknown>
  printify: FakePrintify
}) {
  const logged: Array<{ kind: string; message: string }> = []
  const { client } = printify(opts.printify)

  const agent: AgentRecord = {
    id: '55555555-5555-5555-5555-555555555555',
    divisionId: String(opts.division['id']),
    name: 'Loading bay',
    moduleAgentKey: 'publisher',
    model: 'claude-haiku-5-5',
    systemPrompt: 'You publish an approved listing.',
    tools: [],
    autonomy: 'propose',
    maxSteps: 4,
  }

  const division = {
    id: String(opts.division['id']),
    name: String(opts.division['name']),
    type: 'pod',
    config: opts.division['config'],
  } as DivisionRecord

  const deps: RunLoopDeps = {
    runs: {
      async start(record) {
        const [row] = await h.db
          .insert(agentRuns)
          .values({ ...record, agentId: null, taskId: null } as never)
          .returning()
        return row as never
      },
      async finish(id, patch) {
        const [row] = await h.db
          .update(agentRuns)
          .set(patch as never)
          .where(eq(agentRuns.id, id))
          .returning()
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
    requestApproval: async () => {
      throw new Error('the Loading bay must not ask for an approval; it acts on one')
    },
  }

  const output = await runAgent(
    createPublisherAgent({ db: h.db as never, printify: client }),
    { agent, division, input: opts.input, task: null },
    deps,
  )

  return { output: output as unknown as Record<string, unknown>, logged }
}

/* ------------------------------------------------------------------ *
 * The small pure pieces
 * ------------------------------------------------------------------ */

describe('productIdFrom', () => {
  it('reads a direct productId', () => {
    expect(productIdFrom({ productId: 'a' })).toBe('a')
  })

  it('reads the dispatcher ref', () => {
    expect(productIdFrom({ refId: 'b', refTable: 'pod.products' })).toBe('b')
  })

  it('refuses a ref to something that is not a product', () => {
    expect(productIdFrom({ refId: 'c', refTable: 'pod.designs' })).toBeNull()
  })
})

describe('shopIdFrom', () => {
  it('reads the configured shop', () => {
    expect(shopIdFrom({ printifyShopId: ' 12345 ' })).toBe('12345')
  })

  it('accepts a number, because a shop id looks like one and JSON keeps it', () => {
    expect(shopIdFrom({ printifyShopId: 12345 })).toBe('12345')
  })

  it('has no fallback, because publishing into the wrong shop is worse than not publishing', () => {
    expect(shopIdFrom({})).toBeNull()
    expect(shopIdFrom({ printifyShopId: '' })).toBeNull()
    expect(shopIdFrom({ printifyShopId: '   ' })).toBeNull()
    expect(shopIdFrom(null)).toBeNull()
  })
})

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

describe('the publisher run', () => {
  it('publishes an approved product and reports back to release the lock', async () => {
    const division = await seedDivision()
    const product = await seedProduct(division.id)
    const p: FakePrintify = { calls: [] }

    const { output } = await runPublisher({
      division,
      input: { refId: product.id, refTable: 'pod.products' },
      printify: p,
    })

    expect(output['status']).toBe('published')
    expect(p.calls).toContain(`publish:${SHOP}:pf_1`)
    // The callback is what releases the lock. Without it the product is uneditable
    // in a real shop, forever.
    expect(p.calls).toContain('succeeded:pf_1')

    const [row] = await h.db.select().from(products).where(eq(products.id, product.id))
    expect(row!.status).toBe('published')
    expect(row!.publishedAt).not.toBeNull()
  })

  it('stops with a sentence somebody can act on when the shop id is missing', async () => {
    /*
     * The one piece of setup nothing can infer, and there is no screen for it yet —
     * so this message IS the documentation. A generic failure here sends somebody to
     * Printify's status page looking for a value missing from their own database.
     */
    const division = await seedDivision({})
    const product = await seedProduct(division.id)

    await expect(
      runPublisher({ division, input: { productId: product.id }, printify: { calls: [] } }),
    ).rejects.toThrow(/printifyShopId/)

    const [row] = await h.db.select().from(products).where(eq(products.id, product.id))
    expect(row!.status).toBe('pending_approval')
  })

  it('fails LOUDLY when the publish fails', async () => {
    /*
     * The state this prevents: a cleared approval, a task marked done, and a product
     * that is not live. That is precisely the state the operator cannot see, and it
     * is what the whole system was in before this agent existed.
     */
    const division = await seedDivision()
    const product = await seedProduct(division.id)

    await expect(
      runPublisher({
        division,
        input: { productId: product.id },
        printify: { calls: [], failPublish: 'printify 503' },
      }),
    ).rejects.toThrow(/failed/)

    const [row] = await h.db.select().from(products).where(eq(products.id, product.id))
    expect(row!.status).toBe('pending_approval')
  })

  it('releases the lock when the publish succeeds but the follow-up does not', async () => {
    // The dangerous window. The product is already locked at this point, and the
    // only thing that unlocks it is a callback we have to make on the way out.
    const division = await seedDivision()
    const product = await seedProduct(division.id)
    const p: FakePrintify = { calls: [], failGet: 'printify timeout' }

    await expect(
      runPublisher({ division, input: { productId: product.id }, printify: p }),
    ).rejects.toThrow()

    expect(p.calls).toContain('failed:pf_1')
  })

  it('does not publish twice when the approval is redelivered', async () => {
    const division = await seedDivision()
    const product = await seedProduct(division.id, {
      status: 'published',
      publishedAt: new Date('2026-10-01T00:00:00Z'),
    })
    const p: FakePrintify = { calls: [] }

    const { output } = await runPublisher({
      division,
      input: { productId: product.id },
      printify: p,
    })

    expect(output['status']).toBe('skipped')
    expect(output['reason']).toMatch(/already published/)
    expect(p.calls.filter((c) => c.startsWith('publish:'))).toHaveLength(0)
  })

  it('says so rather than silently succeeding when there is nothing to publish', async () => {
    const division = await seedDivision()
    const product = await seedProduct(division.id, { printifyProductId: null })

    const { output, logged } = await runPublisher({
      division,
      input: { productId: product.id },
      printify: { calls: [] },
    })

    expect(output['status']).toBe('skipped')
    expect(logged.some((l) => l.kind === 'pod.publish_skipped')).toBe(true)
  })

  it('refuses a task with no product rather than guessing one', async () => {
    const division = await seedDivision()
    await expect(
      runPublisher({ division, input: {}, printify: { calls: [] } }),
    ).rejects.toThrow(/cannot pick one/)
  })

  it('releases products a previous crash left locked, before publishing', async () => {
    const division = await seedDivision()
    const stuck = await seedProduct(division.id, {
      title: 'Locked by a crash',
      printifyProductId: 'pf_stuck',
    })
    const product = await seedProduct(division.id, { title: 'Today', printifyProductId: 'pf_2' })

    const p: FakePrintify = { calls: [], locked: new Set(['pf_stuck']) }
    const { output, logged } = await runPublisher({
      division,
      input: { productId: product.id },
      printify: p,
    })

    expect(output['releasedStuck']).toBeGreaterThan(0)
    expect(p.calls).toContain('failed:pf_stuck')
    expect(logged.some((l) => l.kind === 'pod.publish_locks_released')).toBe(true)
    // And the publish it was actually asked to do still happened.
    expect(output['status']).toBe('published')
    expect(stuck.id).toBeTruthy()
  })

  it('still publishes when a product in the lock sweep cannot be read', async () => {
    /*
     * The sweep is housekeeping for a rare crash; the publish is the thing the
     * operator approved. A Printify hiccup on some unrelated product must not turn a
     * tidy-up into an outage.
     */
    const division = await seedDivision()
    await seedProduct(division.id, { title: 'Other', printifyProductId: 'pf_other' })
    const product = await seedProduct(division.id, { title: 'Today', printifyProductId: 'pf_2' })

    let first = true
    const client = {
      async publish() {},
      async getProduct(_shop: string, id: string) {
        // Fail only the sweep's lookup, not the publish's.
        if (first && id === 'pf_other') {
          first = false
          throw new Error('printify 500')
        }
        return { id: `ext_${id}`, is_locked: false }
      },
      async publishingSucceeded() {},
      async publishingFailed() {},
    } as never

    const logged: Array<{ kind: string }> = []
    const output = await runAgent(
      createPublisherAgent({ db: h.db as never, printify: client }),
      {
        agent: {
          id: '55555555-5555-5555-5555-555555555555',
          divisionId: division.id,
          name: 'Loading bay',
          moduleAgentKey: 'publisher',
          model: 'claude-haiku-5-5',
          systemPrompt: '',
          tools: [],
          autonomy: 'propose',
          maxSteps: 4,
        } as AgentRecord,
        division: {
          id: division.id,
          name: division.name,
          type: 'pod',
          config: division.config,
        } as DivisionRecord,
        input: { productId: product.id },
        task: null,
      },
      {
        runs: {
          async start(record) {
            const [row] = await h.db
              .insert(agentRuns)
              .values({ ...record, agentId: null, taskId: null } as never)
              .returning()
            return row as never
          },
          async finish(id, patch) {
            const [row] = await h.db
              .update(agentRuns)
              .set(patch as never)
              .where(eq(agentRuns.id, id))
              .returning()
            return row as never
          },
        },
        events: {
          async emit(e) {
            logged.push({ kind: String(e.kind) })
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
        requestApproval: async () => {
          throw new Error('must not ask for approval')
        },
      } as RunLoopDeps,
    )

    expect((output as unknown as Record<string, unknown>)['status']).toBe('published')
    // Nothing was released and nothing blew up: the unreadable product was skipped.
    expect((output as unknown as Record<string, unknown>)['releasedStuck']).toBe(0)
    expect(logged.length).toBeGreaterThan(0)
  })

  it('does not sweep another division’s locked products', async () => {
    /*
     * The sweep had no division filter, so it read every pending product in the
     * table and called each one against THIS division's shop id. Usually that is a
     * wasted lookup that throws and is skipped — but two divisions on one Printify
     * shop would have each releasing the other's locks, and the cost grew with the
     * whole table rather than with one division's work.
     */
    const mine = await seedDivision()
    const [theirs] = await h.db
      .insert(divisions)
      .values({ name: 'Other', slug: 'other', type: 'pod', status: 'active', config: { printifyShopId: SHOP } })
      .returning()
    await seedProduct(theirs!.id, { title: 'Theirs', printifyProductId: 'pf_theirs' })
    const product = await seedProduct(mine.id, { title: 'Mine', printifyProductId: 'pf_mine' })

    const p: FakePrintify = { calls: [], locked: new Set(['pf_theirs']) }
    const { output } = await runPublisher({
      division: mine,
      input: { productId: product.id },
      printify: p,
    })

    expect(output['releasedStuck']).toBe(0)
    expect(p.calls.some((c) => c.includes('pf_theirs'))).toBe(false)
  })
})
