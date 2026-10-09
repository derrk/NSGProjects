/**
 * The module interface (SPEC.md §Module interface).
 *
 * A division is added by dropping a folder in `modules/` that exports one
 * `ModuleDefinition`. The core upserts its row in `modules`, and the floor, the inbox,
 * the tool catalog and the schedules all update without touching core code.
 *
 * Note how the dependency runs: core defines this interface and never imports from
 * `modules/`. The app composes the list and hands it to the registry. Filesystem
 * discovery would mean core reaching into modules, and would not survive bundling.
 */

import type { AgentDefinition, Autonomy } from '../runtime/types'

/** One station on the factory floor. */
export interface StationSpec {
  key: string
  label: string
  /** Which of this module's agents mans the station. */
  agentKey: string
  /**
   * A named counter the floor shows, e.g. `pod.designs_today`. Resolved by the
   * module's own counter resolver rather than by core running arbitrary SQL.
   */
  counter?: string
}

/** An approval kind this module may propose. */
export interface ApprovalKindSpec {
  kind: string
  label: string
  /**
   * Which card the inbox renders. Resolved by name, not imported, so the core inbox
   * has no compile-time dependency on a module. An unknown name falls back to the
   * generic JSON card.
   */
  cardComponent?: string
  /** Seeds `approval_rules.never_auto` for every category of this kind. */
  neverAuto?: boolean
  /** Overrides the default graduation threshold for this kind. */
  thresholdCount?: number
}

/** An agent this module provides, and the defaults a new division starts it with. */
export interface ModuleAgentSpec {
  key: string
  defaultName: string
  purpose: string
  description?: string
  defaultModel: string
  /** Cron, or `event:<name>`, or null for manual-only. */
  defaultSchedule: string | null
  defaultTools: string[]
  /** Starting autonomy. Anything other than `propose` needs a reason. */
  defaultAutonomy?: Autonomy
  /**
   * Seed the agent paused.
   *
   * For an agent a module declares but has not implemented yet: the station appears
   * on the floor, but the scheduler will not create tasks nothing can run.
   */
  defaultStatus?: 'active' | 'paused'
  systemPrompt: string
  /**
   * The run function the runtime calls. Omit for a prompt-only agent that uses only
   * core tools, or for one that is declared but not yet implemented.
   */
  definition?: AgentDefinition<never, never>
}

/** A tool registered into the shared catalog, callable by any agent granted it. */
export interface ToolSpec {
  name: string
  description: string
  /** JSON Schema or a Zod schema; the runtime builds the tool definition from it. */
  inputSchema: unknown
  handler: (args: unknown, ctx: ToolContext) => Promise<unknown>
  /** Rough cost per call in cents, for the run's estimate. */
  costCents?: number
}

export interface ToolContext {
  divisionId: string
  agentId: string
  taskId: string | null
  /** Resolve a credential NAME to its value. Agents never see keys themselves. */
  credential(name: string): Promise<string>
}

export interface ScreenSpec {
  /** Mounted at /divisions/:id/<path>. */
  path: string
  label: string
}

export interface DivisionCreateContext {
  divisionId: string
  config: Record<string, unknown>
  /** Writes an event so the operator can watch a division come up. */
  log(message: string, level?: 'info' | 'warn' | 'error'): Promise<void>
}

export interface ModuleDefinition {
  name: string
  version: string
  description: string
  stations: StationSpec[]
  approvalKinds: ApprovalKindSpec[]
  agents: ModuleAgentSpec[]
  tools?: ToolSpec[]
  screens?: ScreenSpec[]
  /**
   * Validate tokens, register webhooks, seed reference data, write the first tasks.
   * Runs after the division row and its agents exist.
   */
  onDivisionCreate?: (ctx: DivisionCreateContext) => Promise<void>
}

export class UnknownModuleError extends Error {
  constructor(readonly moduleName: string) {
    super(`no module named "${moduleName}" is registered`)
    this.name = 'UnknownModuleError'
  }
}

export class ModuleValidationError extends Error {
  constructor(
    readonly module: string,
    readonly problems: string[],
  ) {
    super(`module "${module}" is invalid: ${problems.join('; ')}`)
    this.name = 'ModuleValidationError'
  }
}

/**
 * Check a module before it is allowed to register.
 *
 * These are the invariants the rest of the core assumes. Catching them at boot beats
 * discovering them when a station renders blank or an approval lands in a queue no
 * card can draw.
 */
export function validateModule(mod: ModuleDefinition): string[] {
  const problems: string[] = []

  if (!mod.name.trim()) problems.push('name is empty')
  if (!/^[a-z][a-z0-9_]*$/.test(mod.name)) {
    // The name becomes a Postgres schema, so it has to be a bare identifier.
    problems.push(`name "${mod.name}" must be lowercase letters, digits and underscores`)
  }
  if (!mod.version.trim()) problems.push('version is empty')

  const agentKeys = new Set<string>()
  for (const agent of mod.agents) {
    if (agentKeys.has(agent.key)) problems.push(`duplicate agent key "${agent.key}"`)
    agentKeys.add(agent.key)
    if (!agent.systemPrompt.trim()) problems.push(`agent "${agent.key}" has an empty prompt`)
  }

  for (const station of mod.stations) {
    if (!agentKeys.has(station.agentKey)) {
      problems.push(`station "${station.key}" points at unknown agent "${station.agentKey}"`)
    }
  }

  const kinds = new Set<string>()
  for (const kind of mod.approvalKinds) {
    if (kinds.has(kind.kind)) problems.push(`duplicate approval kind "${kind.kind}"`)
    kinds.add(kind.kind)
  }

  const toolNames = new Set<string>()
  for (const tool of mod.tools ?? []) {
    if (toolNames.has(tool.name)) problems.push(`duplicate tool "${tool.name}"`)
    toolNames.add(tool.name)
  }

  // An agent granted a tool that does not exist will fail at run time, in production,
  // after it has already spent money getting there.
  const available = new Set([...toolNames, ...CORE_TOOL_NAMES])
  for (const agent of mod.agents) {
    for (const tool of agent.defaultTools) {
      if (!available.has(tool)) {
        problems.push(`agent "${agent.key}" wants unknown tool "${tool}"`)
      }
    }
  }

  return problems
}

/** Tools every module gets for free (SPEC.md §Module interface). */
export const CORE_TOOL_NAMES = [
  'web_search',
  'fetch_page',
  'db.query',
  'entities.upsert',
  'entities.search',
  'opportunities.create',
  'tasks.create',
  'memory.recall',
  'memory.write',
  'ledger.post',
  'requestApproval',
  'notify_operator',
  'send_email',
  'generate_image',
  'embed_text',
] as const
