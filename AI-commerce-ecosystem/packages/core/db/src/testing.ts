/**
 * An in-process Postgres for tests.
 *
 * PGlite runs the REAL schema from the REAL generated migrations, so enums, NOT NULL
 * constraints, foreign keys, partial unique indexes and the dashboard views are all
 * genuinely exercised. A hand-rolled fake would prove none of that.
 *
 * Construction costs roughly 1.5 seconds, so build one per test FILE and truncate
 * between tests (~3ms), never one per test.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
import { drizzle } from 'drizzle-orm/pglite'

import * as schema from './schema/index'

const here = dirname(fileURLToPath(import.meta.url))

export const CORE_MIGRATIONS = resolve(here, '..', 'drizzle')
export const POD_MIGRATIONS = resolve(here, '..', '..', '..', '..', 'modules', 'pod', 'drizzle')

/** Every .sql file in a migration folder, in filename order. */
export function migrationFiles(folder: string): string[] {
  return readdirSync(folder)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(folder, f), 'utf8'))
}

export interface TestDatabase {
  client: PGlite
  db: ReturnType<typeof drizzle<typeof schema>>
  /** Empty every table without paying to rebuild the schema. */
  truncate(): Promise<void>
  close(): Promise<void>
}

export interface CreateTestDatabaseOptions {
  /** Extra migration folders to apply after core, e.g. a module's. */
  moduleMigrations?: string[]
}

export async function createTestDatabase(
  options: CreateTestDatabaseOptions = {},
): Promise<TestDatabase> {
  // pgvector moved out of PGlite core in 0.5 into its own package. agent_memory's
  // embedding column needs it, or the first migration fails on `type "vector"`.
  const client = new PGlite({ extensions: { vector } })

  for (const sql of migrationFiles(CORE_MIGRATIONS)) {
    await client.exec(sql)
  }
  for (const folder of options.moduleMigrations ?? []) {
    for (const sql of migrationFiles(folder)) {
      await client.exec(sql)
    }
  }

  const db = drizzle(client, { schema }) as unknown as ReturnType<typeof drizzle<typeof schema>>

  return {
    client,
    db,
    async truncate() {
      // Discovered rather than listed, so a new table never silently leaks state
      // between tests. Views are excluded automatically by table_type.
      const result = await client.query<{ full_name: string }>(`
        SELECT quote_ident(table_schema) || '.' || quote_ident(table_name) AS full_name
        FROM information_schema.tables
        WHERE table_type = 'BASE TABLE'
          AND table_schema IN ('public', 'pod')
          AND table_name <> '__drizzle_migrations'
      `)
      const names = result.rows.map((r) => r.full_name)
      if (names.length > 0) {
        await client.exec(`TRUNCATE ${names.join(', ')} RESTART IDENTITY CASCADE;`)
      }
    },
    async close() {
      await client.close()
    },
  }
}
