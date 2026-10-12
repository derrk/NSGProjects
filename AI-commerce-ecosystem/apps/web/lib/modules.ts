import type { CounterResolvers, ModuleDefinition } from '@acf/core/modules'
import type { AgentDefinition } from '@acf/core/runtime'
import { createModelClient, createOfflineModelClient } from '@acf/integrations/anthropic'
import { createFalPipeline, createMockFalPipeline } from '@acf/integrations/fal'
import { createMockStorage, createSupabaseStorage } from '@acf/integrations/storage'
import { db } from '@acf/db'
import { createPrintifyClient, createMockPrintifyClient } from '@acf/integrations/printify'
import {
  createDesignerAgent,
  createFinanceAgent,
  createConceptBenchAgent,
  createPodCounters,
  createScoutAgent,
  createStoreOpsAgent,
  createSupplierScoutAgent,
  createSupportAgent,
  podModule,
} from '@acf/pod'
import { createPodReferenceSeeder } from '@acf/pod/seed-reference'
import { createIntakeAgent, templateModule } from '@acf/template'

/**
 * The composition root.
 *
 * Deliberately NOT marked `server-only`: the seed script and other CLI tooling import
 * this outside React, where that guard throws. It is server code regardless — it
 * imports the database client, which no browser bundle can resolve.
 *
 * Core never imports from `modules/` — that is what keeps a division removable — so
 * the app is where the two meet. Adding a division means adding one import here and
 * one entry to the array.
 */
export const MODULES: ModuleDefinition[] = [
  {
    ...podModule,
    /*
     * Attached here rather than declared in module.ts, because this one needs a
     * database and module.ts must stay readable at boot without one.
     *
     * It runs on every reconcile. The reason is in registry.ts, and it is not
     * theoretical: the blocked-phrase list had been written by a one-off script for
     * one division, so three divisions were running an IP gate against zero phrases
     * — which reports every design clean, exactly as it does when a design is clean.
     *
     * `db()` is called inside the closure, not beside it. MODULES is a top-level
     * const, so resolving the handle here would open a connection the moment anything
     * imported this file — including a test that only wanted the approval kinds.
     */
    seedReferenceData: (ctx) => createPodReferenceSeeder(db() as never)(ctx),
  },
  templateModule,
]

/**
 * Run agents against mocks instead of paid APIs.
 *
 * Covers the model as well as image generation and storage, so a local prototype
 * works end to end with no keys and no spend.
 */
const useMocks = process.env['ACF_MOCK_INTEGRATIONS'] === '1'

/**
 * Resolve `agents.module_agent_key` to the function that runs it.
 *
 * The live clients live here rather than in the module declaration, so `module.ts`
 * can be read at boot without credentials or a network.
 */
export function resolveAgentDefinition(
  moduleName: string,
  agentKey: string,
): AgentDefinition<never, never> | null {
  if (moduleName === 'generic') {
    if (agentKey === 'intake') {
      return createIntakeAgent({ db: db() }) as unknown as AgentDefinition<never, never>
    }
    return null
  }

  if (moduleName !== 'pod') return null

  if (agentKey === 'designer') {
    return createDesignerAgent({
      db: db() as never,
      model: useMocks ? createOfflineModelClient() : createModelClient(),
      images: useMocks ? createMockFalPipeline() : createFalPipeline(),
      storage: useMocks ? createMockStorage() : createSupabaseStorage(),
    }) as unknown as AgentDefinition<never, never>
  }

  if (agentKey === 'store_ops') {
    /*
     * Store ops has had a runner since the Printify client landed, and was not wired
     * here. The agent seeds ACTIVE — its spec carries no `defaultStatus` — so every
     * scheduled run failed with "module pod has no runner for agent key store_ops".
     * execute-task fails loudly rather than dropping the work, which is why this was
     * recoverable rather than silent, but it still meant a station that could never
     * produce anything.
     */
    return createStoreOpsAgent({
      db: db() as never,
      model: useMocks ? createOfflineModelClient() : createModelClient(),
      printify: useMocks ? createMockPrintifyClient() : createPrintifyClient(),
    }) as unknown as AgentDefinition<never, never>
  }

  /*
   * The three below reason through the model but make no decision with it. Each one's
   * judgement — what may be said to a customer, what a supplier is worth, what a
   * number can be trusted to mean — lives in a tested file beside its runner, because
   * a prompt is a request and these are the places where a convincing wrong answer
   * costs real money.
   */
  if (agentKey === 'support') {
    return createSupportAgent({
      db: db() as never,
      model: useMocks ? createOfflineModelClient() : createModelClient(),
    }) as unknown as AgentDefinition<never, never>
  }

  if (agentKey === 'supplier_scout') {
    return createSupplierScoutAgent({
      db: db() as never,
      model: useMocks ? createOfflineModelClient() : createModelClient(),
    }) as unknown as AgentDefinition<never, never>
  }

  if (agentKey === 'finance') {
    return createFinanceAgent({
      db: db() as never,
      model: useMocks ? createOfflineModelClient() : createModelClient(),
    }) as unknown as AgentDefinition<never, never>
  }

  if (agentKey === 'concept_bench') {
    /*
     * The link between research and design. Triggers on `niche.approved`, reads the
     * niche row and the evidence the scout stored on it, and files concepts the
     * Designer can actually render.
     *
     * No image client and no search: it writes words, and the two things it is not
     * allowed to get wrong — the design style enum and the IP check — are decided in
     * code either side of the model call.
     */
    return createConceptBenchAgent({
      db: db() as never,
      model: useMocks ? createOfflineModelClient() : createModelClient(),
    }) as unknown as AgentDefinition<never, never>
  }

  if (agentKey === 'scout') {
    /*
     * The front of the pipeline. Takes an idea the operator typed, or nothing at all,
     * and turns it into sourced niches with an approval behind them.
     *
     * Its judgement is in niche-score.ts and in the vet in its runner, not in the
     * prompt. A niche is thrown out for having an uncheckable quote by code that was
     * written to be evaded, because the prompt asking for verbatim quotes is a
     * request and this is where it becomes a rule.
     */
    return createScoutAgent({
      db: db() as never,
      model: useMocks ? createOfflineModelClient() : createModelClient(),
    }) as unknown as AgentDefinition<never, never>
  }

  return null
}

/**
 * Resolve a module's station counters against the live database.
 *
 * Same split as `resolveAgentDefinition`, for the same reason: `module.ts` declares
 * the counter NAMES so they can be validated at boot, and the queries live here where
 * a database handle is allowed to exist.
 *
 * A module with no counters returns an empty record, and the floor renders its
 * stations without figures rather than with zeros.
 */
export function resolveCounters(moduleName: string): CounterResolvers {
  if (moduleName === 'pod') return createPodCounters(db() as never)
  return {}
}
