/**
 * Apply pending migrations.
 *
 * Run with `pnpm --filter @acf/db db:migrate`. Uses DIRECT_DATABASE_URL (the session
 * pooler) rather than the runtime transaction pooler: migrations need session state.
 */

import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import { migrationDatabaseUrl } from './env.js'

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle')

export async function runMigrations(url = migrationDatabaseUrl()): Promise<void> {
  // max: 1 — the migrator must run every statement on one session.
  const client = postgres(url, { max: 1 })
  try {
    // The second argument is REQUIRED on drizzle-orm 0.45.x. The one-argument form
    // shown on the current docs site is v1 release-candidate syntax.
    await migrate(drizzle(client), { migrationsFolder })
  } finally {
    await client.end()
  }
}

const isEntrypoint = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`

if (isEntrypoint) {
  runMigrations()
    .then(() => {
      console.log('migrations applied')
      process.exit(0)
    })
    .catch((err: unknown) => {
      console.error('migration failed:', err)
      process.exit(1)
    })
}
