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
