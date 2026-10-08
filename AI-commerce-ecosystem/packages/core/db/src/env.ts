/**
 * Database connection resolution.
 *
 * Supabase exposes three connection strings and they are not interchangeable:
 *
 * | Use                       | Host / port                                    | Notes |
 * |---------------------------|------------------------------------------------|-------|
 * | drizzle-kit generate/migrate | session pooler, `postgres.<ref>@...:5432`  | IPv4 on every plan, supports prepared statements |
 * | serverless runtime        | transaction pooler, `...:6543`                 | needs `prepare: false` |
 * | direct                    | `db.<ref>.supabase.co:5432`                    | IPv6-only without the paid IPv4 add-on |
 *
 * Migrations default to the session pooler rather than the direct connection because
 * the direct host is IPv6-only, and most Windows dev boxes, home ISPs and CI runners
 * are effectively IPv4-only — there the direct connection just hangs.
 */

export class MissingDatabaseUrlError extends Error {
  constructor(varName: string) {
    super(
      `${varName} is not set. Copy .env.example to .env and fill in the Supabase ` +
        `connection strings from Project Settings -> Database -> Connection string.`,
    )
    this.name = 'MissingDatabaseUrlError'
  }
}

/** The pooled connection the app uses at runtime. */
export function runtimeDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env['DATABASE_URL']
  if (!url) throw new MissingDatabaseUrlError('DATABASE_URL')
  return url
}

/**
 * The connection drizzle-kit and the migration runner use. Falls back to the runtime
 * url so a local Postgres with one connection string still works.
 */
export function migrationDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env['DIRECT_DATABASE_URL'] ?? env['DATABASE_URL']
  if (!url) throw new MissingDatabaseUrlError('DIRECT_DATABASE_URL')
  return url
}

/**
 * Supavisor's transaction pooler (port 6543) does not keep session state, so prepared
 * statements must be disabled. Doing that on a direct or session connection would
 * needlessly give up performance, so it is detected rather than hard-coded.
 */
export function needsPreparedStatementsDisabled(url: string): boolean {
  try {
    return new URL(url).port === '6543'
  } catch {
    return false
  }
}
