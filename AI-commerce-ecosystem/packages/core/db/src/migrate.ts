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

import { migrationDatabaseUrl } from './env'

export const CORE_MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle')

export interface MigrateOptions {
  url?: string
  /**
   * Each enabled module's migration folder, applied after core.
   *
   * Passed in rather than discovered: core must not reach into modules/, and a module
   * owns its own Postgres schema.
   */
  moduleMigrations?: string[]
}

export async function runMigrations(options: MigrateOptions = {}): Promise<void> {
  const url = options.url ?? migrationDatabaseUrl()
  // max: 1 because the migrator must run every statement on one session. Notices are
  // suppressed for the same reason as in client.ts: "already exists, skipping" is not
  // an error and should not look like one.
  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    const db = drizzle(client)
    // The second argument is REQUIRED on drizzle-orm 0.45.x. The one-argument form
    // shown on the current docs site is v1 release-candidate syntax.
    await migrate(db, { migrationsFolder: CORE_MIGRATIONS })
    for (const folder of options.moduleMigrations ?? []) {
      await migrate(db, { migrationsFolder: folder, migrationsTable: `__drizzle_migrations_${folder.split(/[\/]/).slice(-2, -1)[0]}` })
    }
  } finally {
    await client.end()
  }
}

const isEntrypoint = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`

if (isEntrypoint) {
  runMigrations({})
    .then(() => {
      console.log('migrations applied')
      process.exit(0)
    })
    .catch((err: unknown) => {
      console.error('migration failed:', err)
      process.exit(1)
    })
}
