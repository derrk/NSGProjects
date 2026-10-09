import type { ModuleAgentSpec } from '@acf/core/modules'

import { DESIGNER_SYSTEM_PROMPT } from './prompt'

export * from './schema'
export * from './prompt'
export * from './run'

/**
 * What a new POD division starts its Designer with.
 *
 * The `definition` is supplied by the app, which owns the fal, Anthropic and storage
 * clients — a module declaration must stay free of live credentials so it can be read
 * at boot without a network.
 */
export const designerAgentSpec: ModuleAgentSpec = {
  key: 'designer',
  defaultName: 'Design bay',
  purpose:
    'Turn one approved concept into three distinct design variants, proofread the lettering, and hand them to the operator to pick from.',
  description: 'Writes three generation prompts, renders them, verifies text, stores PNGs.',
  defaultModel: 'claude-sonnet-5-5',
  defaultSchedule: 'event:concept.approved',
  defaultTools: ['generate_image', 'requestApproval', 'memory.recall', 'memory.write'],
  systemPrompt: DESIGNER_SYSTEM_PROMPT,
}
