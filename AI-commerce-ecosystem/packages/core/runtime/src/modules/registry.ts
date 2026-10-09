/**
 * Module registration and division creation (SPEC.md §Module interface).
 *
 * Two operations:
 *   `registerModules` — on boot, upsert each module's row so the floor and inbox can
 *   render from data rather than code.
 *   `createDivision`  — seed a division's agents, approval rules and first tasks from
 *   its module's declared defaults.
 *
 * Both are written against ports so the whole flow is testable without a database.
 */

import {
  ModuleValidationError,
  UnknownModuleError,
  validateModule,
  type DivisionCreateContext,
  type ModuleDefinition,
} from './types'
import type { Autonomy } from '../runtime/types'
import type { EventSink } from '../approvals/types'

export interface ModuleRow {
  id: string
  name: string
  version: string
  description: string | null
  stations: unknown
  approvalKinds: unknown
  toolNames: string[]
  enabled: boolean
}

export interface DivisionRow {
  id: string
  name: string
  slug: string
  moduleId: string | null
  type: string
  status: 'planning' | 'active' | 'paused' | 'closed'
  config: Record<string, unknown>
}

export interface SeededAgent {
  id: string
  divisionId: string
  name: string
  purpose: string
  moduleAgentKey: string
  model: string
  systemPrompt: string
  tools: string[]
  schedule: string | null
  autonomy: Autonomy
  status: 'active' | 'paused'
}

export interface ModuleStore {
  upsertByName(row: Omit<ModuleRow, 'id'>): Promise<ModuleRow>
  findByName(name: string): Promise<ModuleRow | null>
}

export interface DivisionStore {
  insert(row: Omit<DivisionRow, 'id'>): Promise<DivisionRow>
  findBySlug(slug: string): Promise<DivisionRow | null>
}

export interface AgentStore {
  insertMany(rows: Array<Omit<SeededAgent, 'id'>>): Promise<SeededAgent[]>
}

export interface ApprovalRuleSeedStore {
  seed(
    rows: Array<{
      divisionId: string
      kind: string
      category: string
      neverAuto: boolean
      thresholdCount: number
    }>,
  ): Promise<void>
}

export interface RegistryDeps {
  modules: ModuleStore
  divisions: DivisionStore
  agents: AgentStore
  rules: ApprovalRuleSeedStore
  events: EventSink
}

/**
 * Register every module the app has composed.
 *
 * A module that fails validation is rejected loudly rather than registered half-
 * working: a station pointing at a missing agent renders blank forever, and an agent
 * granted a tool that does not exist fails in production after it has already spent
 * money getting there.
 */
export async function registerModules(
  mods: readonly ModuleDefinition[],
  deps: RegistryDeps,
): Promise<ModuleRow[]> {
  const seen = new Set<string>()
  const rows: ModuleRow[] = []

  for (const mod of mods) {
    if (seen.has(mod.name)) {
      throw new ModuleValidationError(mod.name, ['registered twice'])
    }
    seen.add(mod.name)

    const problems = validateModule(mod)
    if (problems.length > 0) throw new ModuleValidationError(mod.name, problems)

    const row = await deps.modules.upsertByName({
      name: mod.name,
      version: mod.version,
      description: mod.description,
      stations: mod.stations,
      approvalKinds: mod.approvalKinds,
      toolNames: (mod.tools ?? []).map((t) => t.name),
      enabled: true,
    })
    rows.push(row)

    await deps.events.emit({
      kind: 'module.registered',
      level: 'info',
      message: `${mod.name} v${mod.version} registered with ${mod.agents.length} agent(s)`,
      refTable: 'modules',
      refId: row.id,
    })
  }

  return rows
}

export interface CreateDivisionInput {
  name: string
  slug: string
  moduleName: string
  type?: string
  config?: Record<string, unknown>
  /** Start the division active, or leave it in planning. */
  activate?: boolean
}

export interface CreateDivisionResult {
  division: DivisionRow
  agents: SeededAgent[]
}

export class DivisionSlugTakenError extends Error {
  constructor(readonly slug: string) {
    super(`a division with slug "${slug}" already exists`)
    this.name = 'DivisionSlugTakenError'
  }
}

/**
 * Create a division from a module.
 *
 * This is the "New division" button: pick a module, name it, fill its config. The
 * core seeds the agents the module declares, pre-seeds the approval rules for every
 * kind the module can propose, and then lets the module do its own setup.
 */
export async function createDivision(
  input: CreateDivisionInput,
  mods: readonly ModuleDefinition[],
  deps: RegistryDeps,
): Promise<CreateDivisionResult> {
  const mod = mods.find((m) => m.name === input.moduleName)
  if (!mod) throw new UnknownModuleError(input.moduleName)

  const existing = await deps.divisions.findBySlug(input.slug)
  if (existing) throw new DivisionSlugTakenError(input.slug)

  const moduleRow = await deps.modules.findByName(mod.name)

  const division = await deps.divisions.insert({
    name: input.name,
    slug: input.slug,
    moduleId: moduleRow?.id ?? null,
    type: input.type ?? mod.name,
    status: input.activate ? 'active' : 'planning',
    config: input.config ?? {},
  })

  const agents = await deps.agents.insertMany(
    mod.agents.map((spec) => ({
      divisionId: division.id,
      name: spec.defaultName,
      purpose: spec.purpose,
      moduleAgentKey: spec.key,
      model: spec.defaultModel,
      systemPrompt: spec.systemPrompt,
      tools: spec.defaultTools,
      schedule: spec.defaultSchedule,
      // Every new agent starts at `propose` unless the module argues otherwise.
      // Autonomy is earned per category, never granted wholesale.
      autonomy: spec.defaultAutonomy ?? 'propose',
      // A declared-but-unimplemented agent is seeded paused, so it shows on the floor
      // without the scheduler queueing work nothing can run.
      status: spec.defaultStatus ?? (spec.definition ? 'active' : 'paused'),
    })),
  )

  // Pre-seed one rule row per approval kind so a module's neverAuto flag and custom
  // threshold are in force from the first proposal, not from the first decision.
  await deps.rules.seed(
    mod.approvalKinds.map((kind) => ({
      divisionId: division.id,
      kind: kind.kind,
      // The catch-all bucket; real categories get their own rows as they appear.
      category: '*',
      neverAuto: kind.neverAuto ?? false,
      thresholdCount: kind.thresholdCount ?? (kind.kind === 'design' ? 50 : 20),
    })),
  )

  await deps.events.emit({
    divisionId: division.id,
    kind: 'division.created',
    level: 'info',
    message: `${division.name} created from module ${mod.name} with ${agents.length} agent(s)`,
    refTable: 'divisions',
    refId: division.id,
  })

  if (mod.onDivisionCreate) {
    const ctx: DivisionCreateContext = {
      divisionId: division.id,
      config: input.config ?? {},
      log: (message, level = 'info') =>
        deps.events.emit({
          divisionId: division.id,
          kind: 'division.setup',
          level,
          message,
          refTable: 'divisions',
          refId: division.id,
        }),
    }
    await mod.onDivisionCreate(ctx)
  }

  return { division, agents }
}
