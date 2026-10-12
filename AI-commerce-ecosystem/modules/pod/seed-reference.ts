/**
 * Writing the POD module's reference data into a division.
 *
 * Split from `reference-data.ts` because that file must stay importable at boot with
 * no database, and from `module.ts` for the same reason. This one touches drizzle, so
 * only the composition root loads it.
 *
 * Runs on every reconcile, so every statement here is an upsert and the function is
 * safe to call on a division that already has all of it.
 */

import type { DivisionCreateContext } from '@acf/core/modules'

import { POD_BLOCKED_PHRASES, POD_PRICING_RULES } from './reference-data'
import { blockedPhrases, pricingRules } from './schema/index'

/** Minimal structural view of the drizzle client, so this file does not import @acf/db. */
type Db = Record<string, unknown>

export function createPodReferenceSeeder(
  database: Db,
): (ctx: DivisionCreateContext) => Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural db type
  const db = database as any

  return async (ctx: DivisionCreateContext) => {
    /*
     * onConflictDoNothing, not DoUpdate.
     *
     * An operator who edited a markup from 2.2 to 3.0 meant it, and re-asserting the
     * default on every boot would quietly undo that with nothing but an updated_at to
     * explain it. New entries added to the list still arrive; rows that exist are
     * left exactly as the operator left them.
     *
     * A DELETED row is a different case and this does NOT preserve it: the row is
     * gone, so there is no conflict, so it comes back on the next boot. That is the
     * safe direction for both of these tables — a missing blocked phrase is a gate
     * that lets something through, and a missing pricing rule is a product with no
     * price — but it does mean there is no way to permanently remove a default yet.
     * When there is a delete UI it needs a tombstone, and the test for this says so
     * rather than asserting a protection that is not here.
     */
    const phrases = await db
      .insert(blockedPhrases)
      .values(
        POD_BLOCKED_PHRASES.map((p) => ({
          phrase: p.phrase,
          reason: p.reason,
          divisionId: ctx.divisionId,
          actor: 'system',
        })),
      )
      .onConflictDoNothing()
      .returning()

    const rules = await db
      .insert(pricingRules)
      .values(
        POD_PRICING_RULES.map((r) => ({
          ...r,
          divisionId: ctx.divisionId,
          actor: 'system',
        })),
      )
      .onConflictDoNothing()
      .returning()

    const added = phrases.length + rules.length
    if (added > 0) {
      // Said out loud, because a division that had none of this until now was running
      // an IP gate against an empty list — and nothing it produced in that time was
      // checked, however clean the designs happened to look.
      await ctx.log(
        `seeded ${phrases.length} blocked phrase(s) and ${rules.length} pricing rule(s); ` +
          'any design or niche this division produced before now was checked against ' +
          'whatever it had, which may have been nothing',
        phrases.length > 0 ? 'warn' : 'info',
      )
    }
  }
}
