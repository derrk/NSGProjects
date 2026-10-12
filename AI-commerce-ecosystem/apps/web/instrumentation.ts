/**
 * The boot hook. Next calls this once per server process, before the first request.
 *
 * It does one thing: load the node-only module when the runtime is node. The work
 * is in instrumentation-node.ts, and it has to be a separate file — see the comment
 * there. Nothing node-specific may be imported at this level, statically or
 * dynamically, or the edge bundle traces it and fails to compile.
 */

export async function register(): Promise<void> {
  if (process.env['NEXT_RUNTIME'] !== 'nodejs') return

  const { reconcileAtBoot } = await import('./instrumentation-node')
  await reconcileAtBoot()
}
