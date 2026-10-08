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

export function createDatabase(options: CreateDatabaseOptions = {}) {
  const url = options.url ?? runtimeDatabaseUrl()
  const client = postgres(url, {
    max: options.max ?? 5,
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
