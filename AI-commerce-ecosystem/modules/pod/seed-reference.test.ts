/**
 * The reference seeder, against real SQL.
 *
 * Two things matter here and only one of them is "does it insert rows".
 *
 * The first is that a SECOND division gets its own copy. The unique index used to be
 * on `phrase` alone, so the first division seeded took all ten phrases and every
 * division after it took none — and an IP gate with no phrases reports every design
 * clean, which is what it also reports when a design is clean. Migration 0003 made
 * the index per-division; this is the test that says so.
 *
 * The second is that it does NOT undo the operator. It runs on every boot, so an
 * operator who deleted a phrase or edited a markup would otherwise find it back
 * tomorrow with nothing but an updated_at to explain it.
 */

import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { divisions } from '@acf/db'
import { createTestDatabase, POD_MIGRATIONS, type TestDatabase } from '@acf/db/testing'

import { POD_BLOCKED_PHRASES, POD_PRICING_RULES } from './reference-data'
import { blockedPhrases, pricingRules } from './schema/index'
import { createPodReferenceSeeder } from './seed-reference'

let h: TestDatabase

beforeAll(async () => {
  h = await createTestDatabase({ moduleMigrations: [POD_MIGRATIONS] })
}, 120_000)

afterAll(async () => {
  await h.close()
})

beforeEach(async () => {
  await h.truncate()
})

async function division(name: string, slug: string) {
  const [row] = await h.db
    .insert(divisions)
    .values({ name, slug, type: 'pod', status: 'active' })
    .returning()
  return row!
}

function context(divisionId: string) {
  const logs: Array<{ message: string; level: string }> = []
  return {
    logs,
    ctx: {
      divisionId,
      config: {},
      async log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
        logs.push({ message, level })
      },
    },
  }
}

describe('createPodReferenceSeeder', () => {
  it('gives a division the blocklist its IP gate reads', async () => {
    const d = await division('Paw Order', 'paw-order')
    const { ctx } = context(d.id)
    await createPodReferenceSeeder(h.db as never)(ctx)

    const rows = await h.db
      .select()
      .from(blockedPhrases)
      .where(eq(blockedPhrases.divisionId, d.id))
    expect(rows).toHaveLength(POD_BLOCKED_PHRASES.length)
    expect(rows.every((r) => r.reason !== null && r.reason !== '')).toBe(true)

    const rules = await h.db.select().from(pricingRules).where(eq(pricingRules.divisionId, d.id))
    expect(rules).toHaveLength(POD_PRICING_RULES.length)
  })

  it('gives the SECOND division its own copy, which the old index made impossible', async () => {
    /*
     * The bug, exactly. Keyed on `phrase` alone with onConflictDoNothing, this
     * second call inserted nothing and Paw Order ran with an empty blocklist while
     * reading, from the code, as though the gate were on.
     */
    const first = await division('Deadstock', 'deadstock')
    const second = await division('Paw Order', 'paw-order')
    const seed = createPodReferenceSeeder(h.db as never)

    await seed(context(first.id).ctx)
    await seed(context(second.id).ctx)

    for (const d of [first, second]) {
      const rows = await h.db
        .select()
        .from(blockedPhrases)
        .where(eq(blockedPhrases.divisionId, d.id))
      expect(rows).toHaveLength(POD_BLOCKED_PHRASES.length)
    }
  })

  it('is safe to run on every boot', async () => {
    const d = await division('Deadstock', 'deadstock')
    const seed = createPodReferenceSeeder(h.db as never)
    await seed(context(d.id).ctx)
    await seed(context(d.id).ctx)
    await seed(context(d.id).ctx)

    const rows = await h.db
      .select()
      .from(blockedPhrases)
      .where(eq(blockedPhrases.divisionId, d.id))
    expect(rows).toHaveLength(POD_BLOCKED_PHRASES.length)
  })

  it('DOES put back a phrase that was deleted, which is the safe direction and a gap', async () => {
    /*
     * Documented rather than defended. A deleted row raises no conflict, so
     * onConflictDoNothing inserts it again — meaning there is currently no way to
     * permanently remove a default phrase.
     *
     * For a blocklist that is the right way round: the failure mode of re-arming a
     * gate is an operator annoyed at a false positive, and the failure mode of
     * honouring the delete is a takedown. But it is a real limit, and the moment a
     * delete UI exists this needs a tombstone instead of this test.
     */
    const d = await division('Deadstock', 'deadstock')
    const seed = createPodReferenceSeeder(h.db as never)
    await seed(context(d.id).ctx)

    await h.db
      .delete(blockedPhrases)
      .where(and(eq(blockedPhrases.divisionId, d.id), eq(blockedPhrases.phrase, 'olympic')))

    await seed(context(d.id).ctx)

    const rows = await h.db
      .select()
      .from(blockedPhrases)
      .where(eq(blockedPhrases.divisionId, d.id))
    expect(rows.map((r) => r.phrase)).toContain('olympic')
  })

  it('does not overwrite a markup the operator changed', async () => {
    const d = await division('Deadstock', 'deadstock')
    const seed = createPodReferenceSeeder(h.db as never)
    await seed(context(d.id).ctx)

    await h.db
      .update(pricingRules)
      .set({ markupMultiple: 3.5 })
      .where(and(eq(pricingRules.divisionId, d.id), eq(pricingRules.productType, 'tee')))

    await seed(context(d.id).ctx)

    const [tee] = await h.db
      .select()
      .from(pricingRules)
      .where(and(eq(pricingRules.divisionId, d.id), eq(pricingRules.productType, 'tee')))
    expect(tee!.markupMultiple).toBeCloseTo(3.5)
  })

  it('says out loud when a division had been running without a blocklist', async () => {
    const d = await division('Paw Order', 'paw-order')
    const { ctx, logs } = context(d.id)
    await createPodReferenceSeeder(h.db as never)(ctx)

    expect(logs[0]!.level).toBe('warn')
    expect(logs[0]!.message).toMatch(/blocked phrase/)
  })

  it('stays quiet on a division that already had everything', async () => {
    const d = await division('Deadstock', 'deadstock')
    const seed = createPodReferenceSeeder(h.db as never)
    await seed(context(d.id).ctx)

    const { ctx, logs } = context(d.id)
    await seed(ctx)
    expect(logs).toEqual([])
  })
})
