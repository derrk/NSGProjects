import { and, eq, isNull, or } from 'drizzle-orm'

import { CredentialNotConfiguredError } from '@acf/core/tools'
import { credentials, type Database } from '@acf/db'

/**
 * Resolve a credential NAME to its value.
 *
 * The value is never stored in the database. The `credentials` table maps a name to
 * the environment variable that holds it, so a prompt, a tool log and an event can all
 * reference `printify_token` without the secret ever entering a row.
 *
 * A division's own credential wins over a company-wide one of the same name, which is
 * what lets two POD shops hold different Shopify tokens.
 */
export async function resolveCredential(
  db: Database,
  divisionId: string,
  name: string,
): Promise<string> {
  const rows = await db
    .select()
    .from(credentials)
    .where(
      and(
        eq(credentials.name, name),
        or(eq(credentials.divisionId, divisionId), isNull(credentials.divisionId)),
      ),
    )

  // Prefer the division-scoped row when both exist.
  const row = rows.find((r) => r.divisionId === divisionId) ?? rows[0]
  if (!row) throw new CredentialNotConfiguredError(name)

  const value = process.env[row.envKey]
  if (!value) {
    throw new CredentialNotConfiguredError(
      `${name} (the environment variable ${row.envKey} is empty)`,
    )
  }
  return value
}
