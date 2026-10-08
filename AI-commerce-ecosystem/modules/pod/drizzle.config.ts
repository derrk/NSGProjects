import { defineConfig } from 'drizzle-kit'

/**
 * The POD module's own migrations, under the `pod` Postgres schema.
 *
 * Each module owns its schema and its migration folder; the core runner applies core
 * migrations first, then each enabled module's. Forward slashes only, even on
 * Windows — drizzle-kit treats these as globs, and `out` fails SILENTLY on a
 * backslash, writing into a directory with the separators stripped.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './schema/index.ts',
  out: './drizzle',
  schemaFilter: ['pod'],
  dbCredentials: {
    url:
      process.env.DIRECT_DATABASE_URL ??
      process.env.DATABASE_URL ??
      'postgresql://localhost:5432/postgres',
  },
  strict: true,
  verbose: true,
})
