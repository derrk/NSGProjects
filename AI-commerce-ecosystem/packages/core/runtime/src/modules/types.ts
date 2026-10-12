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
  /**
   * What the number means, under it. "designs today", "suppliers on file".
   *
   * Lives on the station rather than in a lookup table in the UI, so adding a
   * division never means editing the floor. The floor must not know what any
   * particular module counts.
   */
  counterLabel?: string
  /**
   * True when the figure is a running total rather than today's.
   *
   * A weekly agent counted daily reads zero on six days in seven, which says nothing.
   * The floor labels these so a total is never mistaken for a day's work.
   */
  counterIsRunningTotal?: boolean
}

/**
 * What a module's counters are given to compute from.
 *
 * Deliberately narrow. Core hands over a division id and a window, and nothing else —
 * the module brings its own database handle through its composition, so core never
 * runs a module's SQL and never learns what a `design` is.
 */
export interface CounterContext {
  divisionId: string
  /** Counters are "today" figures, so both ends are supplied rather than assumed. */
  since: Date
  until: Date
}

/**
 * One named counter, resolved by the module that declared it.
 *
 * Returning null means "this cannot be counted yet" and the floor shows a dash. That
 * is a different thing from zero, and conflating them is how a station that has never
 * worked looks like a station that had a quiet day.
 */
export type CounterResolver = (ctx: CounterContext) => Promise<number | null>

/**
 * A module's counter resolvers, built against a live database.
 *
 * Note the shape: a factory, wired at the composition root, exactly as agent runners
 * are. The alternative — resolvers sitting on the static `ModuleDefinition` — would
 * put a database handle in `module.ts`, and that file has to be readable at boot with
 * no credentials and no network. So the NAMES are declared there and validated, and
 * the implementations are resolved beside `resolveAgentDefinition`.
 */
export type CounterResolvers = Record<string, CounterResolver>

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

/**
 * One editable setting on a division.
 *
 * Declared by the module so core never learns what a Printify shop is, and so the
 * screen that edits them is generated rather than written per module.
 *
 * NOT FOR SECRETS. Division config is an ordinary jsonb column: it is read back to
 * the browser on the settings screen, it goes into the archive export, and it is not
 * encrypted at rest. Tokens and keys belong in environment variables, which is where
 * every integration already looks for them. A module that declares a field for an
 * API token is declaring a leak.
 */
export interface ConfigFieldSpec {
  key: string
  label: string
  /** What it is for, in the operator's terms. Rendered under the input. */
  help: string
  kind: 'text' | 'list'
  /** Shown in the empty input. Never used as a value. */
  placeholder?: string
  /**
   * What breaks while this is unset, in one line.
   *
   * Rendered on the field when it is empty. The alternative is an operator finding
   * out from a failed agent run, which is how `printifyShopId` was discovered.
   */
  requiredFor?: string
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
   * Every counter name this module can resolve.
   *
   * Declared here, implemented at the composition root. A station naming a counter
   * absent from this list is a validation error rather than a blank, because a number
   * that silently never appears reads as zero — and zero is a claim.
   */
  counterNames?: string[]
  /**
   * Division settings this module reads, so the app can render a form for them.
   *
   * Without this they are set by editing a jsonb column by hand — which is how
   * `printifyShopId` worked until the Loading bay started failing on it, with the
   * error message serving as the only documentation that the field existed.
   */
  configFields?: ConfigFieldSpec[]
  /**
   * Validate tokens, register webhooks, write the first tasks.
   * Runs ONCE, after the division row and its agents exist.
   *
   * Reference data does not belong here — see `seedReferenceData`.
   */
  onDivisionCreate?: (ctx: DivisionCreateContext) => Promise<void>
  /**
   * Rows the module's own code reads and the operator never has to create.
   *
   * Separate from `onDivisionCreate`, and called on every reconcile rather than once,
   * for the same reason approval rules are seeded on every reconcile: a division
   * created before the module declared the data has none of it, and the code that
   * reads it cannot tell an empty table from a permissive one.
   *
   * That failure already happened. The pod module's IP gate reads `blocked_phrases`,
   * which was seeded by a one-off script for the first division only — so three of
   * four divisions had an empty blocklist, and `checkIpRisk` against zero phrases
   * returns zero findings, which is indistinguishable from a clean design. A gate
   * that is open reads exactly like a gate that passed you.
   *
   * MUST be idempotent: it runs on boot, on every division, every time.
   */
  seedReferenceData?: (ctx: DivisionCreateContext) => Promise<void>
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
    // A counter nothing resolves renders as a permanent blank, which reads as "zero
    // today" rather than "this was never wired".
    if (station.counter && !(mod.counterNames ?? []).includes(station.counter)) {
      problems.push(
        `station "${station.key}" names counter "${station.counter}", which is not in the module's counterNames`,
      )
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

/**
 * Tools every module gets for free (SPEC.md §Module interface).
 *
 * This list is what module validation checks agent grants against, so it must match
 * what `createCoreToolCatalog` actually builds. A name here with no implementation
 * behind it means an agent passes validation at boot and then asks for a tool that
 * does not exist, mid-run, in production.
 *
 * `requestApproval` is deliberately absent: it is not a catalog tool but a method on
 * every agent's context, available whether or not anything was granted.
 */
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
  'notify_operator',
  'send_email',
  'generate_image',
  'embed_text',
] as const
