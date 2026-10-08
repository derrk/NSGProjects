import { defineConfig } from 'drizzle-kit'

/**
 * Paths here MUST use forward slashes, including on Windows: drizzle-kit treats these
 * values as globs, so a backslash is eaten as an escape character. `schema` fails
 * loudly when that happens, but `out` fails SILENTLY — it writes migrations into a
 * literal directory with the separators stripped. Do not build these with path.join().
 *
 * `schema` points at one barrel file rather than a glob so a table can never be
 * collected twice (which drizzle-kit reports as a warning, then emits a bad migration).
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    // Migrations run against the session pooler; see src/env.ts for why not the
    // direct connection. `generate` does not connect, so a placeholder is fine there.
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgresql://localhost:5432/postgres',
  },
  strict: true,
  verbose: true,
})
