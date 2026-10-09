import 'server-only'

import type { ModuleDefinition } from '@acf/core/modules'
import type { AgentDefinition } from '@acf/core/runtime'
import { createModelClient } from '@acf/integrations/anthropic'
import { createFalPipeline, createMockFalPipeline } from '@acf/integrations/fal'
import { createMockStorage, createSupabaseStorage } from '@acf/integrations/storage'
import { db } from '@acf/db'
import { createDesignerAgent, podModule } from '@acf/pod'

/**
 * The composition root.
 *
 * Core never imports from `modules/` — that is what keeps a division removable — so
 * the app is where the two meet. Adding a division means adding one import here and
 * one entry to the array.
 */
export const MODULES: ModuleDefinition[] = [podModule]

/** Run agents against mocks instead of paid APIs. */
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
  if (moduleName !== 'pod') return null

  if (agentKey === 'designer') {
    return createDesignerAgent({
      db: db() as never,
      model: createModelClient(),
      images: useMocks ? createMockFalPipeline() : createFalPipeline(),
      storage: useMocks ? createMockStorage() : createSupabaseStorage(),
    }) as unknown as AgentDefinition<never, never>
  }

  // scout, store_ops and support are declared in module.ts so their stations appear
  // on the floor, but are seeded paused until weeks 2 to 4 implement them.
  return null
}
