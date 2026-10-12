export * as schema from './schema/index'
export * from './schema/index'
export * from './client'
export * from './env'
/*
 * `runMigrations` is deliberately NOT here. It lives at `@acf/db/migrate`.
 *
 * It pulls in `node:url` and `node:path` at module scope, so re-exporting it made
 * every import of this barrel — including the one a Next boot hook needs for a
 * database handle — fail to compile in the edge bundle. A migration runner is a
 * script's dependency, not an application's.
 */
