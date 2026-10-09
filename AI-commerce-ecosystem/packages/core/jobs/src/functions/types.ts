import type { AgentDefinition } from '@acf/core/runtime'

/**
 * Resolves `agents.module_agent_key` to the function that runs it.
 *
 * Supplied by the composition root. Core cannot do this itself: it would mean
 * importing from `modules/`, which is the one dependency the architecture forbids.
 * Returns null for an agent a module declares but has not implemented.
 */
export type AgentResolver = (
  moduleName: string,
  agentKey: string,
) => AgentDefinition<never, never> | null

/**
 * Resolves a module's named counters against a live database.
 *
 * Supplied by the composition root for the same reason as `AgentResolver`: the
 * queries belong to a module, and core must not import one. A module with no
 * counters returns an empty record.
 */
export type CounterResolver = (moduleName: string) => Record<
  string,
  (ctx: { divisionId: string; since: Date; until: Date }) => Promise<number | null>
>

/** Everything the composition root hands core so its jobs can reach module code. */
export interface JobResolvers {
  agents: AgentResolver
  counters?: CounterResolver
}
