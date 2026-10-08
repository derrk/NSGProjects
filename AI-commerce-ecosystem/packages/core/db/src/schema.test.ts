/**
 * Proves the real migrations apply and the dashboard views compute what they claim.
 *
 * A view that quietly returns the wrong number is worse than one that errors: the
 * Company screen is the first thing the operator reads every morning, and a margin
 * that is silently inverted would go unnoticed for weeks.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createTestDatabase, POD_MIGRATIONS, type TestDatabase } from './testing'
import { agentRuns, agents, approvals, divisions, ledger, opportunities, tasks } from './schema/index'

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

async function seedDivision(name = 'POD Store') {
  const [division] = await h.db
    .insert(divisions)
    .values({ name, slug: name.toLowerCase().replace(/\s+/g, '-'), status: 'active' })
    .returning()
  return division!
}

describe('migrations', () => {
  it('creates every core table', async () => {
    const result = await h.client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    )
    const names = result.rows.map((r) => r.table_name).sort()

    expect(names).toEqual(
      expect.arrayContaining([
        'agent_memory',
        'agent_runs',
        'agents',
        'approval_rules',
        'approvals',
        'credentials',
        'divisions',
        'entities',
        'events',
        'goals',
        'ledger',
        'modules',
        'opportunities',
        'tasks',
        'users',
      ]),
    )
  })

  it('creates the module tables under their own schema, not public', async () => {
    const result = await h.client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'pod'`,
    )
    const names = result.rows.map((r) => r.table_name).sort()

    expect(names).toEqual(
      expect.arrayContaining(['concepts', 'designs', 'niches', 'orders', 'products']),
    )

    // Core must never grow a module's table. That is what keeps a division removable.
    const inPublic = await h.client.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN ('concepts', 'designs', 'niches')`,
    )
    expect(inPublic.rows[0]!.n).toBe(0)
  })

  it('enables pgvector so agent_memory can hold an embedding', async () => {
    const result = await h.client.query<{ data_type: string; udt_name: string }>(
      `SELECT data_type, udt_name FROM information_schema.columns
       WHERE table_name = 'agent_memory' AND column_name = 'embedding'`,
    )
    expect(result.rows[0]!.udt_name).toBe('vector')
  })
})

describe('v_division_pnl', () => {
  it('sums each ledger kind and reports margin as their total', async () => {
    const division = await seedDivision()

    await h.db.insert(ledger).values([
      // Signed by effect: revenue positive, costs negative.
      { divisionId: division.id, kind: 'revenue', amountCents: 10_000, source: 'shopify' },
      { divisionId: division.id, kind: 'revenue', amountCents: 5_000, source: 'shopify' },
      { divisionId: division.id, kind: 'cogs', amountCents: -6_000, source: 'printify' },
      { divisionId: division.id, kind: 'expense', amountCents: -1_000, source: 'shopify_plan' },
      { divisionId: division.id, kind: 'api_cost', amountCents: -500, source: 'anthropic' },
      // Not a P&L kind; must not touch margin.
      { divisionId: division.id, kind: 'asset', amountCents: 50_000, source: 'inventory' },
    ])

    const result = await h.client.query<Record<string, string>>(
      `SELECT * FROM v_division_pnl WHERE division_id = $1`,
      [division.id],
    )

    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]!
    expect(Number(row['revenue_cents'])).toBe(15_000)
    expect(Number(row['cogs_cents'])).toBe(-6_000)
    expect(Number(row['expense_cents'])).toBe(-1_000)
    expect(Number(row['api_cost_cents'])).toBe(-500)
    // 15000 - 6000 - 1000 - 500, with the asset row excluded.
    expect(Number(row['margin_cents'])).toBe(7_500)
  })

  it('treats a refund as negative revenue rather than an expense', async () => {
    const division = await seedDivision()
    await h.db.insert(ledger).values([
      { divisionId: division.id, kind: 'revenue', amountCents: 10_000, source: 'shopify' },
      { divisionId: division.id, kind: 'revenue', amountCents: -2_500, source: 'shopify_refund' },
    ])

    const result = await h.client.query<Record<string, string>>(
      `SELECT revenue_cents, expense_cents FROM v_division_pnl WHERE division_id = $1`,
      [division.id],
    )
    expect(Number(result.rows[0]!['revenue_cents'])).toBe(7_500)
    expect(Number(result.rows[0]!['expense_cents'])).toBe(0)
  })

  it('splits the rollup by month', async () => {
    const division = await seedDivision()
    await h.db.insert(ledger).values([
      {
        divisionId: division.id,
        kind: 'revenue',
        amountCents: 1_000,
        source: 's',
        occurredAt: new Date('2026-09-15T00:00:00Z'),
      },
      {
        divisionId: division.id,
        kind: 'revenue',
        amountCents: 2_000,
        source: 's',
        occurredAt: new Date('2026-10-02T00:00:00Z'),
      },
    ])

    const result = await h.client.query(`SELECT * FROM v_division_pnl WHERE division_id = $1`, [
      division.id,
    ])
    expect(result.rows).toHaveLength(2)
  })

  it('keeps divisions separate', async () => {
    const a = await seedDivision('Division A')
    const b = await seedDivision('Division B')
    await h.db.insert(ledger).values([
      { divisionId: a.id, kind: 'revenue', amountCents: 1_000, source: 's' },
      { divisionId: b.id, kind: 'revenue', amountCents: 9_999, source: 's' },
    ])

    const result = await h.client.query<Record<string, string>>(
      `SELECT revenue_cents FROM v_division_pnl WHERE division_id = $1`,
      [a.id],
    )
    expect(Number(result.rows[0]!['revenue_cents'])).toBe(1_000)
  })
})

describe('v_company_cash', () => {
  it('rolls the whole company up across divisions', async () => {
    const a = await seedDivision('Division A')
    const b = await seedDivision('Division B')

    await h.db.insert(ledger).values([
      { divisionId: a.id, kind: 'revenue', amountCents: 20_000, source: 's' },
      { divisionId: a.id, kind: 'cogs', amountCents: -8_000, source: 'p' },
      { divisionId: b.id, kind: 'revenue', amountCents: 5_000, source: 's' },
      { divisionId: b.id, kind: 'api_cost', amountCents: -1_000, source: 'anthropic' },
      { divisionId: a.id, kind: 'asset', amountCents: 100_000, source: 'inventory' },
      { divisionId: a.id, kind: 'liability', amountCents: -30_000, source: 'card' },
    ])

    const result = await h.client.query<Record<string, string>>(`SELECT * FROM v_company_cash`)
    const row = result.rows[0]!

    expect(Number(row['cash_in_cents'])).toBe(25_000)
    expect(Number(row['cash_out_cents'])).toBe(-9_000)
    expect(Number(row['net_cents'])).toBe(16_000)
    expect(Number(row['net_worth_cents'])).toBe(70_000)
  })

  it('returns zeros, not nulls, on an empty ledger', async () => {
    const result = await h.client.query<Record<string, string>>(`SELECT * FROM v_company_cash`)
    expect(Number(result.rows[0]!['net_cents'])).toBe(0)
    expect(Number(result.rows[0]!['net_worth_cents'])).toBe(0)
  })
})

describe('v_agent_health', () => {
  async function seedAgent(division: { id: string }, name = 'designer') {
    const [agent] = await h.db
      .insert(agents)
      .values({ divisionId: division.id, name, model: 'claude-sonnet-5-5', schedule: '0 6 * * *' })
      .returning()
    return agent!
  }

  it('reports an agent that has never run with no success rate', async () => {
    const division = await seedDivision()
    await seedAgent(division)

    const result = await h.client.query<Record<string, unknown>>(`SELECT * FROM v_agent_health`)
    expect(result.rows).toHaveLength(1)
    expect(Number(result.rows[0]!['runs_7d'])).toBe(0)
    // NULL, not 0: "no data" and "failed everything" are different conditions.
    expect(result.rows[0]!['success_rate_7d']).toBeNull()
  })

  it('computes the 7-day success rate and cost', async () => {
    const division = await seedDivision()
    const agent = await seedAgent(division)

    await h.db.insert(agentRuns).values([
      { agentId: agent.id, divisionId: division.id, status: 'ok', costCents: 4 },
      { agentId: agent.id, divisionId: division.id, status: 'ok', costCents: 2 },
      { agentId: agent.id, divisionId: division.id, status: 'ok', costCents: 1 },
      { agentId: agent.id, divisionId: division.id, status: 'error', costCents: 1 },
    ])

    const result = await h.client.query<Record<string, string>>(`SELECT * FROM v_agent_health`)
    const row = result.rows[0]!
    expect(Number(row['runs_7d'])).toBe(4)
    expect(Number(row['ok_7d'])).toBe(3)
    expect(Number(row['success_rate_7d'])).toBeCloseTo(0.75, 5)
    expect(Number(row['cost_cents_7d'])).toBeCloseTo(8, 5)
  })

  it('ignores runs older than seven days', async () => {
    const division = await seedDivision()
    const agent = await seedAgent(division)

    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    await h.db.insert(agentRuns).values([
      { agentId: agent.id, divisionId: division.id, status: 'ok', startedAt: old, costCents: 99 },
      { agentId: agent.id, divisionId: division.id, status: 'ok', costCents: 1 },
    ])

    const result = await h.client.query<Record<string, string>>(`SELECT * FROM v_agent_health`)
    expect(Number(result.rows[0]!['runs_7d'])).toBe(1)
    expect(Number(result.rows[0]!['cost_cents_7d'])).toBeCloseTo(1, 5)
  })
})

describe('v_queue_depth', () => {
  it('counts what is waiting, per division', async () => {
    const division = await seedDivision()

    await h.db.insert(tasks).values([
      { divisionId: division.id, title: 'a', status: 'queued' },
      { divisionId: division.id, title: 'b', status: 'queued' },
      { divisionId: division.id, title: 'c', status: 'blocked' },
      { divisionId: division.id, title: 'd', status: 'done' },
    ])
    await h.db.insert(approvals).values([
      {
        divisionId: division.id,
        kind: 'design',
        category: 'flat-vector',
        refTable: 'pod.concepts',
        refId: 'c1',
        summary: 's',
        payload: {},
        requestedBy: 'agent:designer',
      },
    ])
    await h.db
      .insert(opportunities)
      .values({ divisionId: division.id, source: 'scout', title: 'o', summary: 's' })

    const result = await h.client.query<Record<string, string>>(
      `SELECT * FROM v_queue_depth WHERE division_id = $1`,
      [division.id],
    )
    const row = result.rows[0]!
    expect(Number(row['queued_tasks'])).toBe(2)
    expect(Number(row['blocked_tasks'])).toBe(1)
    expect(Number(row['pending_approvals'])).toBe(1)
    expect(Number(row['new_opportunities'])).toBe(1)
  })

  it('lists a division with nothing waiting, rather than omitting it', async () => {
    const division = await seedDivision()
    const result = await h.client.query<Record<string, string>>(
      `SELECT * FROM v_queue_depth WHERE division_id = $1`,
      [division.id],
    )
    // An absent row would read as "no division" on the dashboard instead of "idle".
    expect(result.rows).toHaveLength(1)
    expect(Number(result.rows[0]!['queued_tasks'])).toBe(0)
  })
})

describe('approvals idempotency index', () => {
  it('refuses a second live approval for the same reference', async () => {
    const division = await seedDivision()
    const row = {
      divisionId: division.id,
      kind: 'design',
      category: 'flat-vector',
      refTable: 'pod.concepts',
      refId: 'concept-1',
      summary: 's',
      payload: {},
      requestedBy: 'agent:designer',
    }

    await h.db.insert(approvals).values(row)
    await expect(h.db.insert(approvals).values(row)).rejects.toThrow()
  })

  it('allows a rejected reference to be proposed again', async () => {
    const division = await seedDivision()
    const row = {
      divisionId: division.id,
      kind: 'design',
      category: 'flat-vector',
      refTable: 'pod.concepts',
      refId: 'concept-2',
      summary: 's',
      payload: {},
      requestedBy: 'agent:designer',
    }

    await h.db.insert(approvals).values({ ...row, decision: 'rejected' })
    await expect(h.db.insert(approvals).values(row)).resolves.toBeDefined()
  })
})
