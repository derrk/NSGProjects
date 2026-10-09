import type { ModuleAgentSpec } from '@acf/core/modules'

import { STORE_OPS_SYSTEM_PROMPT } from './prompt'

export * from './schema'
export * from './prompt'
export * from './run'

export const storeOpsAgentSpec: ModuleAgentSpec = {
  key: 'store_ops',
  defaultName: 'Listing dock',
  purpose:
    'Turn an approved design into listings: copy, blueprint, price and mockups, then hand them to the operator to publish.',
  description: 'Writes the listing, creates the Printify product, prices it from the pricing table.',
  defaultModel: 'claude-sonnet-5-5',
  defaultSchedule: 'event:design.approved',
  defaultTools: ['entities.upsert', 'ledger.post', 'memory.recall', 'memory.write'],
  systemPrompt: STORE_OPS_SYSTEM_PROMPT,
}
