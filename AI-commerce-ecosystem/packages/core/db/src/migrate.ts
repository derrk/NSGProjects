/**
 * Apply pending migrations.
 *
 * Run with `pnpm --filter @acf/db db:migrate`, which goes through migrate-cli.ts.
 * Uses DIRECT_DATABASE_URL (the session pooler) rather than the runtime transaction
 * pooler: migrations need session state.
 *
 * NOT re-exported from the package barrel, and the CLI that used to sit at the
 * bottom of this file is now in migrate-cli.ts. Both for the same reason: this file
 * imports `node:url` and `node:path` at the top level and the old CLI block called
 * `process.argv` and `process.exit` at module scope, so anything that imported
 * `@acf/db` for a database handle dragged all of it along. In a Next edge bundle
 * that is not a warning, it is a compile error — and the thing that failed to
 * compile was the boot hook that reconciles every division, which then silently did
 * not run. Import this as `@acf/db/migrate`, from a script, deliberately.
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
