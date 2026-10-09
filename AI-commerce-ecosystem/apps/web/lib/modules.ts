import type { ModuleDefinition } from '@acf/core/modules'
import type { AgentDefinition } from '@acf/core/runtime'
import { createModelClient, createOfflineModelClient } from '@acf/integrations/anthropic'
import { createFalPipeline, createMockFalPipeline } from '@acf/integrations/fal'
import { createMockStorage, createSupabaseStorage } from '@acf/integrations/storage'
import { db } from '@acf/db'
import { createDesignerAgent, podModule } from '@acf/pod'
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
export const MODULES: ModuleDefinition[] = [podModule, templateModule]

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

  // scout, store_ops and support are declared in module.ts so their stations appear
  // on the floor, but are seeded paused until weeks 2 to 4 implement them.
  return null
}
