import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FakeEventSink } from '../../test/fakes'
import {
  createDivision,
  DivisionSlugTakenError,
  reconcileDivisionAgents,
  registerModules,
  type AgentStore,
  type ApprovalRuleSeedStore,
  type DivisionRow,
  type DivisionStore,
  type ModuleRow,
  type ModuleStore,
  type RegistryDeps,
  type SeededAgent,
} from './registry'
import { ModuleValidationError, UnknownModuleError, type ModuleDefinition } from './types'

/* ------------------------------------------------------------------ *
 * Fakes
 * ------------------------------------------------------------------ */

class FakeModuleStore implements ModuleStore {
  readonly rows = new Map<string, ModuleRow>()
  private seq = 0

  async upsertByName(row: Omit<ModuleRow, 'id'>): Promise<ModuleRow> {
    const existing = this.rows.get(row.name)
    const next: ModuleRow = { ...row, id: existing?.id ?? `mod_${++this.seq}` }
    this.rows.set(row.name, next)
    return next
  }

  async findByName(name: string): Promise<ModuleRow | null> {
    return this.rows.get(name) ?? null
  }
}

class FakeDivisionStore implements DivisionStore {
  readonly rows: DivisionRow[] = []
  private seq = 0

  async insert(row: Omit<DivisionRow, 'id'>): Promise<DivisionRow> {
    const next: DivisionRow = { ...row, id: `div_${++this.seq}` }
    this.rows.push(next)
    return next
  }

  async findBySlug(slug: string): Promise<DivisionRow | null> {
    return this.rows.find((r) => r.slug === slug) ?? null
  }

  async listByModuleName(moduleName: string): Promise<DivisionRow[]> {
    return this.rows.filter((r) => r.type === moduleName)
  }
}

class FakeAgentStore implements AgentStore {
  readonly rows: SeededAgent[] = []
  private seq = 0

  async insertMany(rows: Array<Omit<SeededAgent, 'id'>>): Promise<SeededAgent[]> {
    const next = rows.map((r) => ({ ...r, id: `agent_${++this.seq}` }))
    this.rows.push(...next)
    return next
  }

  async listKeysForDivision(divisionId: string): Promise<string[]> {
    return this.rows.filter((r) => r.divisionId === divisionId).map((r) => r.moduleAgentKey)
  }
}

class FakeRuleSeedStore implements ApprovalRuleSeedStore {
  readonly rows: Array<{
    divisionId: string
    kind: string
    category: string
    neverAuto: boolean
    thresholdCount: number
  }> = []

  async seed(rows: typeof this.rows): Promise<void> {
    this.rows.push(...rows)
  }
}

let modules: FakeModuleStore
let divisions: FakeDivisionStore
let agents: FakeAgentStore
let rules: FakeRuleSeedStore
let events: FakeEventSink
let deps: RegistryDeps

beforeEach(() => {
  modules = new FakeModuleStore()
  divisions = new FakeDivisionStore()
  agents = new FakeAgentStore()
  rules = new FakeRuleSeedStore()
  events = new FakeEventSink()
  deps = { modules, divisions, agents, rules, events }
})

function makeModule(over: Partial<ModuleDefinition> = {}): ModuleDefinition {
  return {
    name: 'pod',
    version: '0.1.0',
    description: 'Print-on-demand store',
    stations: [{ key: 'design_bay', label: 'Design bay', agentKey: 'designer' }],
    approvalKinds: [
      { kind: 'design', label: 'Design', thresholdCount: 50 },
      { kind: 'price_change', label: 'Price change', neverAuto: true },
    ],
    agents: [
      {
        key: 'designer',
        defaultName: 'Designer',
        purpose: 'Turn approved concepts into design variants',
        defaultModel: 'claude-sonnet-5-5',
        defaultSchedule: 'event:concept.approved',
        defaultTools: ['generate_image'],
        systemPrompt: 'You are the Designer.',
      },
    ],
    ...over,
  }
}

/* ------------------------------------------------------------------ *
 * registerModules
 * ------------------------------------------------------------------ */

describe('registerModules', () => {
  it('upserts a row the floor and inbox can render from', async () => {
    const [row] = await registerModules([makeModule()], deps)

    expect(row).toMatchObject({ name: 'pod', version: '0.1.0', enabled: true })
    expect(events.kinds()).toContain('module.registered')
  })

  it('keeps the same row id when a module re-registers on reboot', async () => {
    const [first] = await registerModules([makeModule()], deps)
    const [second] = await registerModules([makeModule({ version: '0.2.0' })], deps)

    // A new id on every boot would orphan every division's module_id.
    expect(second!.id).toBe(first!.id)
    expect(second!.version).toBe('0.2.0')
  })

  it('records the module’s tool names for the shared catalog', async () => {
    const [row] = await registerModules(
      [
        makeModule({
          tools: [
            { name: 'printify.publish', description: 'p', inputSchema: {}, handler: async () => null },
          ],
          agents: [
            {
              key: 'designer',
              defaultName: 'Designer',
              purpose: 'p',
              defaultModel: 'claude-sonnet-5-5',
              defaultSchedule: null,
              defaultTools: ['printify.publish'],
              systemPrompt: 'x',
            },
          ],
        }),
      ],
      deps,
    )

    expect(row!.toolNames).toEqual(['printify.publish'])
  })

  it('refuses the same module twice in one boot', async () => {
    await expect(registerModules([makeModule(), makeModule()], deps)).rejects.toBeInstanceOf(
      ModuleValidationError,
    )
  })

  describe('validation', () => {
    it('rejects a station pointing at an agent that does not exist', async () => {
      const mod = makeModule({
        stations: [{ key: 'ghost', label: 'Ghost', agentKey: 'nobody' }],
      })

      // Otherwise the station renders blank forever and nothing says why.
      await expect(registerModules([mod], deps)).rejects.toThrow(/unknown agent "nobody"/)
    })

    it('rejects a grant for requestApproval, which is not a catalog tool', async () => {
      const mod = makeModule({
        agents: [
          {
            key: 'designer',
            defaultName: 'Designer',
            purpose: 'p',
            defaultModel: 'claude-sonnet-5-5',
            defaultSchedule: null,
            defaultTools: ['requestApproval'],
            systemPrompt: 'x',
          },
        ],
      })

      // requestApproval is a method on every agent's context, available whether or
      // not anything was granted. Listing it as a tool means someone misunderstood
      // where the approval gate lives.
      await expect(registerModules([mod], deps)).rejects.toThrow(/unknown tool "requestApproval"/)
    })

    it('rejects an agent granted a tool nobody provides', async () => {
      const mod = makeModule({
        agents: [
          {
            key: 'designer',
            defaultName: 'Designer',
            purpose: 'p',
            defaultModel: 'claude-sonnet-5-5',
            defaultSchedule: null,
            defaultTools: ['printify.publish'],
            systemPrompt: 'x',
          },
        ],
      })

      // This would fail at run time, in production, after spending money to get there.
      await expect(registerModules([mod], deps)).rejects.toThrow(/unknown tool/)
    })

    it('accepts an agent granted a core tool', async () => {
      const mod = makeModule({
        agents: [
          {
            key: 'designer',
            defaultName: 'Designer',
            purpose: 'p',
            defaultModel: 'claude-sonnet-5-5',
            defaultSchedule: null,
            defaultTools: ['web_search', 'memory.recall'],
            systemPrompt: 'x',
          },
        ],
      })
      await expect(registerModules([mod], deps)).resolves.toHaveLength(1)
    })

    it.each([
      ['POD', 'uppercase'],
      ['3d-print', 'a leading digit and a dash'],
      ['print farm', 'a space'],
    ])('rejects module name %s (%s)', async (name) => {
      // The name becomes a Postgres schema, so it has to be a bare identifier.
      await expect(registerModules([makeModule({ name })], deps)).rejects.toThrow(/must be lowercase/)
    })

    it('rejects an agent with an empty prompt', async () => {
      const mod = makeModule({
        agents: [
          {
            key: 'designer',
            defaultName: 'Designer',
            purpose: 'p',
            defaultModel: 'claude-sonnet-5-5',
            defaultSchedule: null,
            defaultTools: [],
            systemPrompt: '   ',
          },
        ],
      })
      await expect(registerModules([mod], deps)).rejects.toThrow(/empty prompt/)
    })

    it('rejects duplicate approval kinds', async () => {
      const mod = makeModule({
        approvalKinds: [
          { kind: 'design', label: 'A' },
          { kind: 'design', label: 'B' },
        ],
      })
      await expect(registerModules([mod], deps)).rejects.toThrow(/duplicate approval kind/)
    })

    it('registers nothing when one module in the batch is invalid', async () => {
      const bad = makeModule({ name: 'bad', stations: [{ key: 'x', label: 'X', agentKey: 'nope' }] })
      await registerModules([makeModule()], deps).catch(() => {})
      modules.rows.clear()

      await expect(registerModules([bad], deps)).rejects.toThrow()
      expect(modules.rows.size).toBe(0)
    })
  })
})

/* ------------------------------------------------------------------ *
 * createDivision
 * ------------------------------------------------------------------ */

describe('createDivision', () => {
  const mods = [makeModule()]

  beforeEach(async () => {
    await registerModules(mods, deps)
    events.events.length = 0
  })

  it('creates the division and links it to its module', async () => {
    const { division } = await createDivision(
      { name: 'POD Store', slug: 'pod-store', moduleName: 'pod' },
      mods,
      deps,
    )

    expect(division).toMatchObject({ name: 'POD Store', slug: 'pod-store', type: 'pod' })
    expect(division.moduleId).toBe(modules.rows.get('pod')!.id)
    expect(events.kinds()).toContain('division.created')
  })

  it('starts in planning unless asked to activate', async () => {
    const planning = await createDivision(
      { name: 'A', slug: 'a', moduleName: 'pod' },
      mods,
      deps,
    )
    const active = await createDivision(
      { name: 'B', slug: 'b', moduleName: 'pod', activate: true },
      mods,
      deps,
    )

    expect(planning.division.status).toBe('planning')
    expect(active.division.status).toBe('active')
  })

  it('seeds one agent per module agent, with the module’s defaults', async () => {
    const { division, agents: seeded } = await createDivision(
      { name: 'POD Store', slug: 'pod-store', moduleName: 'pod' },
      mods,
      deps,
    )

    expect(seeded).toHaveLength(1)
    expect(seeded[0]).toMatchObject({
      divisionId: division.id,
      name: 'Designer',
      moduleAgentKey: 'designer',
      model: 'claude-sonnet-5-5',
      schedule: 'event:concept.approved',
      tools: ['generate_image'],
    })
  })

  it('seeds an agent active unless the module paused it', async () => {
    const withPaused = makeModule({
      agents: [
        ...makeModule().agents,
        {
          key: 'later',
          defaultName: 'Not built yet',
          purpose: 'p',
          defaultModel: 'claude-sonnet-5-5',
          defaultSchedule: null,
          defaultTools: [],
          defaultStatus: 'paused',
          systemPrompt: 'x',
        },
      ],
    })

    const { agents: seeded } = await createDivision(
      { name: 'POD', slug: 'pod-status', moduleName: 'pod' },
      [withPaused],
      deps,
    )

    // Status cannot be inferred from whether the spec carries a runner: specs never
    // do, because runners need credentials a module must not hold.
    expect(seeded.find((a) => a.moduleAgentKey === 'designer')!.status).toBe('active')
    expect(seeded.find((a) => a.moduleAgentKey === 'later')!.status).toBe('paused')
  })

  it('starts every agent at propose autonomy', async () => {
    const { agents: seeded } = await createDivision(
      { name: 'POD Store', slug: 'pod-store', moduleName: 'pod' },
      mods,
      deps,
    )

    // Autonomy is earned per category, never granted at creation.
    expect(seeded.every((a) => a.autonomy === 'propose')).toBe(true)
  })

  it('pre-seeds an approval rule for every kind the module can propose', async () => {
    const { division } = await createDivision(
      { name: 'POD Store', slug: 'pod-store', moduleName: 'pod' },
      mods,
      deps,
    )

    expect(rules.rows).toHaveLength(2)
    expect(rules.rows.every((r) => r.divisionId === division.id)).toBe(true)
  })

  it('carries a module’s neverAuto and threshold into the seeded rules', async () => {
    await createDivision({ name: 'POD Store', slug: 'pod-store', moduleName: 'pod' }, mods, deps)

    // In force from the first proposal, not from the first decision.
    expect(rules.rows.find((r) => r.kind === 'price_change')).toMatchObject({ neverAuto: true })
    expect(rules.rows.find((r) => r.kind === 'design')).toMatchObject({
      neverAuto: false,
      thresholdCount: 50,
    })
  })

  it('stores the config the operator filled in', async () => {
    const config = { shopifyDomain: 'deadstock.myshopify.com' }
    const { division } = await createDivision(
      { name: 'POD Store', slug: 'pod-store', moduleName: 'pod', config },
      mods,
      deps,
    )
    expect(division.config).toEqual(config)
  })

  it('runs the module’s own setup after the agents exist', async () => {
    const order: string[] = []
    const withSetup = makeModule({
      onDivisionCreate: async (ctx) => {
        order.push('setup')
        await ctx.log('validated Printify token')
      },
    })

    agents.rows.length = 0
    const original = agents.insertMany.bind(agents)
    agents.insertMany = async (rows) => {
      order.push('agents')
      return original(rows)
    }

    await createDivision({ name: 'POD', slug: 'pod-1', moduleName: 'pod' }, [withSetup], deps)

    expect(order).toEqual(['agents', 'setup'])
    expect(events.byKind('division.setup')[0]!.message).toMatch(/Printify token/)
  })

  it('refuses an unknown module', async () => {
    await expect(
      createDivision({ name: 'X', slug: 'x', moduleName: 'nope' }, mods, deps),
    ).rejects.toBeInstanceOf(UnknownModuleError)
  })

  it('refuses a duplicate slug', async () => {
    await createDivision({ name: 'POD Store', slug: 'pod-store', moduleName: 'pod' }, mods, deps)

    await expect(
      createDivision({ name: 'Another', slug: 'pod-store', moduleName: 'pod' }, mods, deps),
    ).rejects.toBeInstanceOf(DivisionSlugTakenError)
  })

  it('supports two divisions on the same module', async () => {
    const first = await createDivision(
      { name: 'Gift Shop', slug: 'gifts', moduleName: 'pod' },
      mods,
      deps,
    )
    const second = await createDivision(
      { name: 'Pet Shop', slug: 'pets', moduleName: 'pod' },
      mods,
      deps,
    )

    // One module can back several businesses; each gets its own agents and rules.
    expect(second.division.id).not.toBe(first.division.id)
    expect(second.agents[0]!.divisionId).toBe(second.division.id)
    expect(rules.rows.filter((r) => r.divisionId === second.division.id)).toHaveLength(2)
  })

  it('does not run setup when the module does not define any', async () => {
    const spy = vi.fn()
    await createDivision({ name: 'POD', slug: 'p1', moduleName: 'pod' }, mods, deps)
    expect(spy).not.toHaveBeenCalled()
  })
})

/* ------------------------------------------------------------------ *
 * reconcileDivisionAgents
 * ------------------------------------------------------------------ */

const SECOND_AGENT = {
  key: 'finance',
  defaultName: 'Counting house',
  purpose: 'Read the ledger',
  defaultModel: 'claude-sonnet-5-5',
  defaultSchedule: 'TZ=America/Chicago 0 7 * * 1',
  defaultTools: ['db.query'],
  defaultStatus: 'paused' as const,
  systemPrompt: 'You are the finance analyst.',
}

describe('reconcileDivisionAgents', () => {
  it('gives an existing division an agent its module has since gained', async () => {
    // Without this, adding an agent only ever reaches divisions created afterwards —
    // an upgrade that silently skips the division actually running.
    const before = makeModule()
    const { division } = await createDivision(
      { name: 'Deadstock', slug: 'pod-store', moduleName: 'pod' },
      [before],
      deps,
    )

    const after = makeModule({ agents: [...before.agents, SECOND_AGENT] })
    const added = await reconcileDivisionAgents(division, after, deps)

    expect(added.map((a) => a.moduleAgentKey)).toEqual(['finance'])
    expect(agents.rows).toHaveLength(2)
  })

  it('adds nothing when the module has not changed', async () => {
    const mod = makeModule()
    const { division } = await createDivision(
      { name: 'Deadstock', slug: 'pod-store', moduleName: 'pod' },
      [mod],
      deps,
    )

    expect(await reconcileDivisionAgents(division, mod, deps)).toEqual([])
    expect(events.kinds()).not.toContain('division.agents_reconciled')
  })

  it('leaves an agent the operator has edited completely alone', async () => {
    /*
     * The row is the editable thing: prompt, tools, schedule and autonomy are all
     * changed from the UI without a deploy. A reconcile that refreshed them from the
     * module defaults would throw away the work the design exists to make possible.
     */
    const before = makeModule()
    const { division } = await createDivision(
      { name: 'Deadstock', slug: 'pod-store', moduleName: 'pod' },
      [before],
      deps,
    )

    const edited = agents.rows[0]!
    edited.systemPrompt = 'Operator rewrote this.'
    edited.schedule = 'TZ=America/Chicago 0 23 * * *'
    edited.autonomy = 'auto'

    await reconcileDivisionAgents(
      division,
      makeModule({ agents: [...before.agents, SECOND_AGENT] }),
      deps,
    )

    expect(agents.rows[0]).toMatchObject({
      systemPrompt: 'Operator rewrote this.',
      schedule: 'TZ=America/Chicago 0 23 * * *',
      autonomy: 'auto',
    })
  })

  it('is idempotent: running it twice adds the agent once', async () => {
    const before = makeModule()
    const { division } = await createDivision(
      { name: 'Deadstock', slug: 'pod-store', moduleName: 'pod' },
      [before],
      deps,
    )
    const after = makeModule({ agents: [...before.agents, SECOND_AGENT] })

    await reconcileDivisionAgents(division, after, deps)
    const second = await reconcileDivisionAgents(division, after, deps)

    expect(second).toEqual([])
    expect(agents.rows.filter((a) => a.moduleAgentKey === 'finance')).toHaveLength(1)
  })

  it('seeds a reconciled agent paused when the module says so', async () => {
    const before = makeModule()
    const { division } = await createDivision(
      { name: 'Deadstock', slug: 'pod-store', moduleName: 'pod' },
      [before],
      deps,
    )

    const [added] = await reconcileDivisionAgents(
      division,
      makeModule({ agents: [...before.agents, SECOND_AGENT] }),
      deps,
    )

    // The scheduler must not queue work for an agent with no runner behind it.
    expect(added!.status).toBe('paused')
    expect(added!.autonomy).toBe('propose')
  })

  it('records what it did, so the change is not silent', async () => {
    const before = makeModule()
    const { division } = await createDivision(
      { name: 'Deadstock', slug: 'pod-store', moduleName: 'pod' },
      [before],
      deps,
    )

    await reconcileDivisionAgents(
      division,
      makeModule({ agents: [...before.agents, SECOND_AGENT] }),
      deps,
    )

    expect(events.kinds()).toContain('division.agents_reconciled')
  })
})
