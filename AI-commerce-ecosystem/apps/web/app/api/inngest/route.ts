import { createCoreFunctions } from '@acf/jobs/functions'
import { inngest } from '@acf/jobs'
import { serve } from 'inngest/next'

import { resolveAgentDefinition, resolveCounters } from '@/lib/modules'

/**
 * All three verbs are required:
 *   GET  — dev-server discovery
 *   POST — function invocation
 *   PUT  — app registration / sync
 * Omitting PUT means the app never registers and nothing ever runs.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  /*
   * The composition root supplies both resolvers; core never imports modules/.
   * `counters` is what lets goals.refresh turn a goal's metric — `pod.products_live`
   * — into a number, without core learning what a product is.
   */
  functions: createCoreFunctions({
    agents: resolveAgentDefinition,
    counters: resolveCounters,
  }),
})

// Checkpointing runs several steps per request; give the route room. This must stay
// above the client's checkpointing.maxRuntime.
export const maxDuration = 60
