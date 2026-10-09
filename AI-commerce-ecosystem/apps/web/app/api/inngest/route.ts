import { createCoreFunctions } from '@acf/jobs/functions'
import { inngest } from '@acf/jobs'
import { serve } from 'inngest/next'

import { resolveAgentDefinition } from '@/lib/modules'

/**
 * All three verbs are required:
 *   GET  — dev-server discovery
 *   POST — function invocation
 *   PUT  — app registration / sync
 * Omitting PUT means the app never registers and nothing ever runs.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  // The composition root supplies the agent resolver; core never imports modules/.
  functions: createCoreFunctions(resolveAgentDefinition),
})

// Checkpointing runs several steps per request; give the route room. This must stay
// above the client's checkpointing.maxRuntime.
export const maxDuration = 60
