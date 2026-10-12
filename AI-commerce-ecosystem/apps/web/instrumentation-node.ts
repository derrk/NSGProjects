/**
 * Bringing the database up to what the code now says, at boot. Node runtime only.
 *
 * Everything the registry does to catch an existing division up — seeding the
 * approval rules for a kind the module has since declared, tightening a category to
 * never-auto, adding an agent, writing the reference data its gates read — was
 * reachable only by running `pnpm seed` by hand. So the guarantees those paths make
 * were true of the code and not of the running system, which is the same shape as
 * every defect in this project worth having: a rule that is stated somewhere other
 * than where it is enforced.
 *
 * Three of them had already bitten. `reply` stayed graduatable on divisions created
 * before it was marked never-auto. Three of four divisions ran an IP gate against an
 * empty blocked-phrase table. The Trend scout's station sat on the floor with no
 * runner behind it. None of those was visible from the screen, because an unenforced
 * rule looks exactly like a rule nothing has violated yet.
 *
 * A SEPARATE FILE from instrumentation.ts, which is the part that matters. Next
 * loads instrumentation.ts into the edge bundle as well, and the bundler resolves
 * imports when it builds — including a dynamic `import()` sitting inside a runtime
 * check it cannot evaluate. So `@acf/jobs` was traced into the edge bundle, which
 * fails on the `node:url` inside the drizzle client, and the node hook never ran at
 * all. Behind its own module, guarded by a condition on the import itself, the edge
 * bundler never reaches this.
 */

import {
  agentStore,
  approvalRuleSeedStore,
  divisionStore,
  eventSink,
  moduleStore,
} from '@acf/jobs'
import { db } from '@acf/db'
import { registerModules, reconcileDivisionAgents } from '@acf/core/modules'

import { MODULES } from '@/lib/modules'

export async function reconcileAtBoot(): Promise<void> {
  const database = db()
  const deps = {
    modules: moduleStore(database),
    divisions: divisionStore(database),
    agents: agentStore(database),
    rules: approvalRuleSeedStore(database),
    events: eventSink(database),
  }

  try {
    await registerModules(MODULES, deps)

    for (const mod of MODULES) {
      for (const division of (await deps.divisions.listByModuleName?.(mod.name)) ?? []) {
        await reconcileDivisionAgents(division, mod, deps)
      }
    }
  } catch (error) {
    /*
     * Loud, and not fatal.
     *
     * A database that is not up yet is the ordinary case in development, and killing
     * the server over it would mean the operator cannot reach the page that tells
     * them the database is down. But a reconcile that silently did not happen is how
     * a division ends up with an empty gate, so this says so in a way nobody can
     * mistake for a warning about something else.
     */
    console.error(
      '[boot] module reconcile FAILED. Divisions may be missing approval rules, agents ' +
        'or reference data their module declares — including the blocked-phrase list ' +
        'the IP gate reads, which reports every design clean when it is empty.',
      error,
    )
  }
}
