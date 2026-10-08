import { Inngest } from 'inngest'

/**
 * The one Inngest client. Import it everywhere — instantiating a second one registers
 * a second app in the dashboard and silently splits your function list.
 *
 * Dev mode is driven by INNGEST_DEV in .env.local rather than hardcoded here. The v4
 * SDK defaults to CLOUD mode, and without that variable local sync fails with a
 * signing-key error that reads like a networking problem.
 */
export const inngest = new Inngest({
  id: 'ai-commerce-factory',
  // Checkpointing runs several steps per HTTP request by default. On Vercel this must
  // stay under the route's maxDuration or long runs get truncated in production while
  // working fine locally.
  checkpointing: { maxRuntime: '50s' },
})
