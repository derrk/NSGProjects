import { functions } from '@acf/jobs/functions'
import { inngest } from '@acf/jobs'
import { serve } from 'inngest/next'

/**
 * All three verbs are required:
 *   GET  — dev-server discovery
 *   POST — function invocation
 *   PUT  — app registration / sync
 * Omitting PUT means the app never registers and nothing ever runs.
 */
export const { GET, POST, PUT } = serve({ client: inngest, functions })

// Checkpointing runs several steps per request; give the route room for them. This
// must stay above the client's checkpointing.maxRuntime.
export const maxDuration = 60
