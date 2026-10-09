/**
 * `db.query` — read-only SQL against the core views.
 *
 * This is the one core tool that runs text the model wrote, so it is the one worth
 * being paranoid about. The defence is not a blocklist of dangerous words — those are
 * endlessly bypassable — but three structural limits:
 *
 *  1. The statement must be a single SELECT. Parsed by shape, not by keyword search,
 *     and anything with a second statement is refused outright.
 *  2. It may only name tables from an allowlist of VIEWS. Base tables are not
 *     reachable, so there is nothing to read that the dashboard does not already show.
 *  3. It runs in a READ ONLY transaction with a statement timeout. Even if the first
 *     two were wrong, Postgres itself refuses to write.
 *
 * Belt, braces and a second pair of braces, because the alternative is an agent that
 * talked its way into the credentials table.
 */

import { sql } from 'drizzle-orm'
import * as z from 'zod'

import type { ToolSpec } from '@acf/core/tools'
import type { Database } from '@acf/db'

/**
 * What an agent may read.
 *
 * Views only. They are already the aggregated, operator-facing shape of the data, and
 * none of them expose a credential, a prompt or a customer's raw message.
 */
export const READABLE_VIEWS = [
  'v_division_pnl',
  'v_company_cash',
  'v_agent_health',
  'v_queue_depth',
] as const

export const MAX_ROWS = 200
export const STATEMENT_TIMEOUT_MS = 5_000

const inputSchema = z.object({
  sql: z
    .string()
    .describe(
      'A single read-only SELECT statement. It may only read these views: ' +
        READABLE_VIEWS.join(', ') +
        '. No base tables, no writes, no multiple statements.',
    ),
})

export type DbQueryInput = z.infer<typeof inputSchema>

export class UnsafeQueryError extends Error {
  constructor(reason: string) {
    super(`refused: ${reason}`)
    this.name = 'UnsafeQueryError'
  }
}

/** Strip comments and string literals so they cannot hide a second statement. */
function stripNoise(statement: string): string {
  return statement
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
}

/**
 * Check a statement before it reaches the database.
 *
 * Returns the trimmed statement, or throws with a reason the model can act on.
 */
export function assertReadOnlySelect(raw: string): string {
  const statement = raw.trim().replace(/;\s*$/, '')
  if (!statement) throw new UnsafeQueryError('the query is empty')

  const bare = stripNoise(statement)

  // A second statement is the classic way to smuggle a write past a prefix check.
  if (bare.includes(';')) {
    throw new UnsafeQueryError('only one statement is allowed')
  }
  if (!/^\s*(select|with)\b/i.test(bare)) {
    throw new UnsafeQueryError('only SELECT (or WITH ... SELECT) is allowed')
  }

  // Data-modifying CTEs are still SELECT-shaped at the top level.
  if (/\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|copy)\b/i.test(bare)) {
    throw new UnsafeQueryError('the query may not modify anything')
  }
  if (/\bpg_sleep|dblink|pg_read_file|lo_import|lo_export|pg_ls_dir\b/i.test(bare)) {
    throw new UnsafeQueryError('that function is not available')
  }

  /*
   * Every identifier after FROM or JOIN must be an allowed view, or a CTE this query
   * declared itself.
   *
   * Stricter than asking whether an allowed view appears anywhere in the text, which
   * would happily pass `SELECT * FROM credentials WHERE 1=1 -- v_company_cash`.
   *
   * CTE names are collected first and then treated as readable. The bodies of those
   * CTEs are scanned by the same pass, so `WITH x AS (SELECT * FROM credentials)` is
   * still caught on the inner FROM — declaring a name does not launder what it reads.
   */
  const cteNames = new Set(
    [...bare.matchAll(/(?:^|[\s,(])([a-z_][a-z0-9_]*)\s+as\s*\(/gi)].map((m) =>
      (m[1] ?? '').toLowerCase(),
    ),
  )

  const referenced = [...bare.matchAll(/\b(?:from|join)\s+([a-z_][a-z0-9_."]*)/gi)].map((m) =>
    (m[1] ?? '').replace(/"/g, '').toLowerCase(),
  )
  if (referenced.length === 0) {
    throw new UnsafeQueryError('the query must read one of the allowed views')
  }

  let readsAnAllowedView = false
  for (const name of referenced) {
    const unqualified = name.includes('.') ? (name.split('.').pop() ?? name) : name
    if (READABLE_VIEWS.includes(unqualified as (typeof READABLE_VIEWS)[number])) {
      readsAnAllowedView = true
      continue
    }
    if (cteNames.has(unqualified)) continue
    throw new UnsafeQueryError(`"${name}" is not readable. Allowed: ${READABLE_VIEWS.join(', ')}`)
  }

  // A query made only of CTEs that read nothing real is pointless, and allowing it
  // opens the door to function calls with no genuine source.
  if (!readsAnAllowedView) {
    throw new UnsafeQueryError('the query must read one of the allowed views')
  }

  return statement
}

export function createDbQueryTool(db: Database): ToolSpec<DbQueryInput, unknown> {
  return {
    name: 'db.query',
    description:
      'Run one read-only SELECT against the company dashboard views and get rows back. ' +
      `Readable views: ${READABLE_VIEWS.join(', ')}. ` +
      'Base tables are not reachable and nothing can be written. ' +
      `At most ${MAX_ROWS} rows are returned.`,
    inputSchema,
    jsonSchema: z.toJSONSchema(inputSchema) as Record<string, unknown>,

    async handler(input, ctx) {
      const statement = assertReadOnlySelect(input.sql)

      // The last line of defence, and the one that does not depend on this file being
      // clever: Postgres itself refuses to write in a READ ONLY transaction.
      const rows = await db.transaction(async (tx) => {
        await tx.execute(sql`SET TRANSACTION READ ONLY`)
        await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`))
        const result = await tx.execute(sql.raw(`SELECT * FROM (${statement}) AS q LIMIT ${MAX_ROWS}`))
        return (result as unknown as { rows?: unknown[] }).rows ?? (result as unknown as unknown[])
      })

      await ctx.log('tool.db_query', `read ${rows.length} row(s)`)
      return { rows, rowCount: rows.length, truncated: rows.length === MAX_ROWS }
    },
  }
}
