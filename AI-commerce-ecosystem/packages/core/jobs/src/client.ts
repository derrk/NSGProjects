import { Inngest } from 'inngest'

/**
 * The one Inngest client. Import it everywhere — a second instance registers a second
 * app in the dashboard and silently splits the function list.
 *
 * Dev mode comes from INNGEST_DEV in .env.local rather than being hardcoded. The v4
 * SDK defaults to CLOUD mode, and without that variable local sync fails with a
 * signing-key error that reads like a networking problem.
 */
export const inngest = new Inngest({
  id: 'ai-holding-company-os',
  // Checkpointing runs several steps per HTTP request by default. On Vercel this must
  // stay under the route's maxDuration or long runs truncate in production while
  // working fine locally.
  checkpointing: { maxRuntime: '50s' },
})
