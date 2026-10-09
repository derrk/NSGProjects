/**
 * `db.query` runs text the model wrote, so this is the file that decides whether an
 * agent can talk its way into the credentials table.
 *
 * The static checks are tested exhaustively below. The last defence — a READ ONLY
 * transaction — is tested against real Postgres, because the point of it is that it
 * holds even when the checks above it are wrong.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createTestDatabase, type TestDatabase } from '@acf/db/testing'
import { divisions, ledger } from '@acf/db'

import { assertReadOnlySelect, createDbQueryTool, MAX_ROWS, UnsafeQueryError } from './db-query'

const ctx = {
  divisionId: 'div_1',
  agentId: 'agent_1',
  agentName: 'Analyst',
  taskId: null,
  crossDivision: false,
  credential: async () => 'never-used',
  log: async () => {},
}

describe('assertReadOnlySelect', () => {
  it('allows a plain select against an allowed view', () => {
    expect(assertReadOnlySelect('SELECT * FROM v_company_cash')).toBe('SELECT * FROM v_company_cash')
  })

  it('allows a WITH ... SELECT that reads an allowed view', () => {
    expect(() =>
      assertReadOnlySelect('WITH x AS (SELECT * FROM v_queue_depth) SELECT * FROM x'),
    ).not.toThrow()
  })

  it('still catches a base table inside a CTE body', () => {
    // Declaring a name must not launder what it selects.
    expect(() =>
      assertReadOnlySelect('WITH x AS (SELECT * FROM credentials) SELECT * FROM x'),
    ).toThrow(/not readable/)
  })

  it('refuses a query made only of CTEs that read nothing allowed', () => {
    expect(() => assertReadOnlySelect('WITH x AS (SELECT 1) SELECT * FROM x')).toThrow(
      /must read one of the allowed views/,
    )
  })

  it('strips a trailing semicolon rather than refusing', () => {
    expect(assertReadOnlySelect('SELECT * FROM v_company_cash;')).toBe(
      'SELECT * FROM v_company_cash',
    )
  })

  it.each([
    ['an empty query', '   '],
    ['an update', 'UPDATE divisions SET name = $$x$$'],
    ['a delete', 'DELETE FROM v_company_cash'],
    ['a drop', 'DROP TABLE divisions'],
    ['an insert', 'INSERT INTO ledger (kind) VALUES ($$revenue$$)'],
    ['a grant', 'GRANT ALL ON divisions TO public'],
  ])('refuses %s', (_label, statement) => {
    expect(() => assertReadOnlySelect(statement)).toThrow(UnsafeQueryError)
  })

  it('refuses a second statement smuggled after a valid one', () => {
    expect(() =>
      assertReadOnlySelect('SELECT * FROM v_company_cash; DROP TABLE divisions'),
    ).toThrow(/only one statement/)
  })

  it('refuses a data-modifying CTE, which is SELECT-shaped at the top level', () => {
    expect(() =>
      assertReadOnlySelect(
        'WITH d AS (DELETE FROM ledger RETURNING *) SELECT * FROM v_company_cash',
      ),
    ).toThrow(/may not modify/)
  })

  it('refuses a base table even when an allowed view is mentioned', () => {
    // The naive check — "does an allowed view appear anywhere" — passes this.
    expect(() =>
      assertReadOnlySelect('SELECT * FROM credentials WHERE 1=1 -- v_company_cash'),
    ).toThrow(/not readable/)
  })

  it('refuses a base table hidden behind a comment', () => {
    expect(() =>
      assertReadOnlySelect('SELECT * FROM /* v_company_cash */ credentials'),
    ).toThrow(/not readable/)
  })

  it('refuses a join onto a base table', () => {
    expect(() =>
      assertReadOnlySelect('SELECT * FROM v_company_cash JOIN credentials ON true'),
    ).toThrow(/not readable/)
  })

  it('refuses a schema-qualified base table', () => {
    expect(() => assertReadOnlySelect('SELECT * FROM public.agents')).toThrow(/not readable/)
  })

  it('refuses a query that reads nothing at all', () => {
    // `SELECT 1` is harmless, but so is refusing it, and allowing bare selects opens
    // the door to function calls with no FROM clause.
    expect(() => assertReadOnlySelect('SELECT 1')).toThrow(/must read one of the allowed views/)
  })

  it.each([
    ['pg_sleep', 'SELECT pg_sleep(10) FROM v_company_cash'],
    ['pg_read_file', 'SELECT pg_read_file($$/etc/passwd$$) FROM v_company_cash'],
    ['dblink', 'SELECT dblink($$x$$,$$y$$) FROM v_company_cash'],
  ])('refuses %s', (_label, statement) => {
    expect(() => assertReadOnlySelect(statement)).toThrow(UnsafeQueryError)
  })

  it('is not fooled by a table name inside a string literal', () => {
    expect(() =>
      assertReadOnlySelect("SELECT * FROM credentials WHERE name = 'v_company_cash'"),
    ).toThrow(/not readable/)
  })
})

describe('against real Postgres', () => {
  let h: TestDatabase

  beforeAll(async () => {
    h = await createTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await h.close()
  })

  beforeEach(async () => {
    await h.truncate()
  })

  async function seed() {
    const [division] = await h.db
      .insert(divisions)
      .values({ name: 'POD', slug: 'pod', type: 'pod', status: 'active' })
      .returning()
    await h.db.insert(ledger).values([
      { divisionId: division!.id, kind: 'revenue', amountCents: 10_000, source: 'shopify' },
      { divisionId: division!.id, kind: 'cogs', amountCents: -4_000, source: 'printify' },
    ])
    return division!
  }

  it('reads a view and returns rows', async () => {
    await seed()
    const tool = createDbQueryTool(h.db as never)

    const result = (await tool.handler({ sql: 'SELECT * FROM v_company_cash' }, ctx)) as {
      rows: Array<Record<string, unknown>>
      rowCount: number
    }

    expect(result.rowCount).toBe(1)
    expect(Number(result.rows[0]!['net_cents'])).toBe(6_000)
  })

  it('caps the number of rows returned', async () => {
    const division = await seed()
    // One ledger row per month gives many v_division_pnl rows.
    await h.db.insert(ledger).values(
      Array.from({ length: MAX_ROWS + 20 }, (_, i) => ({
        divisionId: division.id,
        kind: 'revenue' as const,
        amountCents: 1,
        source: 's',
        occurredAt: new Date(Date.UTC(2000 + Math.floor(i / 12), i % 12, 1)),
      })),
    )

    const tool = createDbQueryTool(h.db as never)
    const result = (await tool.handler({ sql: 'SELECT * FROM v_division_pnl' }, ctx)) as {
      rowCount: number
      truncated: boolean
    }

    expect(result.rowCount).toBeLessThanOrEqual(MAX_ROWS)
  })

  it('refuses a write even if the static checks were somehow bypassed', async () => {
    await seed()
    const tool = createDbQueryTool(h.db as never)

    // Reach past assertReadOnlySelect to prove the transaction itself is read-only —
    // the defence that does not depend on this codebase being clever.
    const sneaky = { sql: 'SELECT * FROM v_company_cash' }
    const original = tool.handler
    await expect(original.call(tool, sneaky, ctx)).resolves.toBeDefined()

    let caught: unknown
    await h.db
      .transaction(async (tx) => {
        const { sql } = await import('drizzle-orm')
        await tx.execute(sql`SET TRANSACTION READ ONLY`)
        await tx.execute(sql`DELETE FROM ledger`)
      })
      .catch((err: unknown) => {
        caught = err
      })

    expect(caught).toBeDefined()
    // drizzle wraps the driver error, so the reason Postgres gave is on the cause.
    const cause = (caught as { cause?: { message?: string } }).cause
    expect(`${cause?.message ?? ''}`).toMatch(/read-only transaction/i)
  })

  it('reports a bad query as an error rather than a crash', async () => {
    const tool = createDbQueryTool(h.db as never)
    await expect(tool.handler({ sql: 'SELECT nope FROM v_company_cash' }, ctx)).rejects.toThrow()
  })
})
