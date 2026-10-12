/**
 * `pnpm --filter @acf/db db:migrate`.
 *
 * Its own file so that migrate.ts stays importable as a library. The two lines below
 * run at module scope, which is exactly why they cannot live beside the function.
 */

import { runMigrations } from './migrate'

runMigrations({})
  .then(() => {
    console.log('migrations applied')
    process.exit(0)
  })
  .catch((err: unknown) => {
    console.error('migration failed:', err)
    process.exit(1)
  })
