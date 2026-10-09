import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { needsPreparedStatementsDisabled, runtimeDatabaseUrl } from './env'
import * as schema from './schema/index'

export type Database = ReturnType<typeof createDatabase>

export interface CreateDatabaseOptions {
  url?: string
  /** Keep this small on serverless: every warm lambda holds its own pool. */
  max?: number
}

/**
 * Pool size.
 *
 * DB_POOL_MAX exists for the local dev database: PGlite behind a socket serves ONE
 * connection at a time, so a pool of five produces ECONNRESET on the second query
 * rather than any useful error. Set it to 1 there. Real Postgres wants the default.
 */
function poolSize(explicit?: number): number {
  if (explicit !== undefined) return explicit
  const fromEnv = Number(process.env['DB_POOL_MAX'])
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 5
}

export function createDatabase(options: CreateDatabaseOptions = {}) {
  const url = options.url ?? runtimeDatabaseUrl()
  const client = postgres(url, {
    max: poolSize(options.max),
    ...(needsPreparedStatementsDisabled(url) ? { prepare: false } : {}),
  })
  return drizzle(client, { schema })
}

/**
 * Lazily created singleton for the Next.js app and the Inngest functions, so a warm
 * serverless instance reuses one pool instead of opening a new one per request.
 */
let cached: Database | undefined

export function db(): Database {
  cached ??= createDatabase()
  return cached
}
