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

/** `touched` stands in for `updated_at > created_at`: somebody edited this row. */
type FakeAgentRow = SeededAgent & { lastRunAt?: Date | null; touched?: boolean }

class FakeAgentStore implements AgentStore {
  readonly rows: FakeAgentRow[] = []
  private seq = 0

  async insertMany(rows: Array<Omit<SeededAgent, 'id'>>): Promise<SeededAgent[]> {
    const next = rows.map((r) => ({ ...r, id: `agent_${++this.seq}` }))
    this.rows.push(...next)
    return next
  }

  async listKeysForDivision(divisionId: string): Promise<string[]> {
    return this.rows.filter((r) => r.divisionId === divisionId).map((r) => r.moduleAgentKey)
  }

  /**
   * Models the real adapter's three conditions, including the two that exist to tell
   * a module default from an operator's decision. A fake that only checked `status`
   * would pass the tests below while the real query undid a deliberate pause.
   */
  async activateUntouched(divisionId: string, keys: readonly string[]): Promise<string[]> {
    const woken: string[] = []
    for (const row of this.rows) {
      if (row.divisionId !== divisionId) continue
      if (!keys.includes(row.moduleAgentKey)) continue
      if (row.status !== 'paused') continue
      if (row.lastRunAt != null) continue
      if (row.touched) continue
      row.status = 'active'
      woken.push(row.moduleAgentKey)
    }
    return woken
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

  /**
   * Models the real store's `onConflictDoNothing` on (division, kind, category).
   *
   * The fake originally pushed unconditionally, so it could not tell a reconcile
   * that re-seeds safely from one that resets a bucket's earned counters — the whole
   * reason the real adapter has that clause.
   */
  async tightenNeverAuto(divisionId: string, kinds: readonly string[]): Promise<number> {
    let n = 0
    for (const row of this.rows) {
      if (row.divisionId !== divisionId) continue
      if (!kinds.includes(row.kind)) continue
      if (row.neverAuto) continue
      row.neverAuto = true
      n += 1
    }
    return n
  }

  async seed(rows: typeof this.rows): Promise<void> {
    for (const row of rows) {
      const clash = this.rows.some(
        (r) =>
          r.divisionId === row.divisionId && r.kind === row.kind && r.category === row.category,
      )
      if (!clash) this.rows.push(row)
    }
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

    it('rejects a station naming a counter the module cannot resolve', async () => {
      const mod = makeModule({
        stations: [
          { key: 'design_bay', label: 'Design bay', agentKey: 'designer', counter: 'pod.ghost' },
        ],
      })

      // A counter nothing resolves renders as a permanent blank, and a blank where a
      // number should be reads as zero. Zero is a claim.
      await expect(registerModules([mod], deps)).rejects.toThrow(/pod\.ghost/)
    })

    it('accepts a station whose counter the module declares', async () => {
      const mod = makeModule({
        stations: [
          { key: 'design_bay', label: 'Design bay', agentKey: 'designer', counter: 'pod.designs' },
        ],
        counterNames: ['pod.designs'],
      })

      await expect(registerModules([mod], deps)).resolves.toHaveLength(1)
    })

    it('accepts a station with no counter at all', async () => {
      // Not every station has a number worth showing.
      await expect(registerModules([makeModule()], deps)).resolves.toHaveLength(1)
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

  it('creates the division cleanly when the module defines no setup hook', async () => {
    /*
     * This used to create a `vi.fn()` and assert it had not been called, without ever
     * handing it to anything — so it was green no matter what the code did. Deleting
     * the `if (mod.onDivisionCreate)` guard entirely left it passing.
     *
     * What it should check is that the absence is handled rather than crashed on, and
     * that nothing logs a setup step that never ran.
     */
    const withoutHook = makeModule()
    expect(withoutHook.onDivisionCreate).toBeUndefined()

    const { division } = await createDivision(
      { name: 'POD', slug: 'p1', moduleName: 'pod' },
      [withoutHook],
      deps,
    )

    expect(division.slug).toBe('p1')
    expect(events.kinds()).toContain('division.created')
    expect(events.kinds()).not.toContain('division.setup')
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

  it('seeds reference data on every reconcile, not only at creation', async () => {
    /*
     * The failure this protects against is the one the pod module actually shipped.
     * Its IP gate reads a `blocked_phrases` table that nothing but a one-off script
     * had ever written, for one division — so three divisions ran that gate against
     * an empty list. `checkIpRisk` with zero phrases returns zero findings, which is
     * exactly what it returns for a clean design. The operator could not tell, from
     * anything on the screen, a check that passed from a check that never ran.
     *
     * So this runs on every reconcile, like the approval rules above it, rather than
     * once at creation where a division older than the data never gets it.
     */
    const seeded: string[] = []
    const mod = makeModule()
    const { division } = await createDivision(
      { name: 'Deadstock', slug: 'pod-store', moduleName: 'pod' },
      [mod],
      deps,
    )

    const withData = makeModule({
      seedReferenceData: async (ctx) => {
        seeded.push(ctx.divisionId)
      },
    })

    await reconcileDivisionAgents(division, withData, deps)
    expect(seeded).toEqual([division.id])

    // And again, because it is declared idempotent and runs on every boot.
    await reconcileDivisionAgents(division, withData, deps)
    expect(seeded).toHaveLength(2)
  })

  it('seeds reference data even when no agent is missing', async () => {
    // The early return on `missing.length === 0` is below this call, deliberately.
    let called = false
    const mod = makeModule({ seedReferenceData: async () => { called = true } })
    const { division } = await createDivision(
      { name: 'Deadstock', slug: 'pod-store', moduleName: 'pod' },
      [mod],
      deps,
    )
    called = false

    expect(await reconcileDivisionAgents(division, mod, deps)).toEqual([])
    expect(called).toBe(true)
  })

  describe('waking an agent its module stopped shipping paused', () => {
    /*
     * The failure: a module seeds an agent PAUSED while it has no runner, because the
     * scheduler must not queue work nothing can take. The runner lands, the tests go
     * green, the station renders — and every division that already existed keeps the
     * paused row, so the feature runs nowhere. That is what happened to the Trend
     * scout, on all three pod divisions.
     */
    async function pausedScout() {
      const mod = makeModule({
        agents: [{ ...makeModule().agents[0]!, key: 'scout', defaultStatus: 'paused' }],
      })
      const { division } = await createDivision(
        { name: 'Deadstock', slug: 'pod-store', moduleName: 'pod' },
        [mod],
        deps,
      )
      const withRunner = makeModule({
        agents: [{ ...makeModule().agents[0]!, key: 'scout', defaultStatus: 'active' }],
      })
      return { division, withRunner }
    }

    it('activates a row nobody has touched', async () => {
      const { division, withRunner } = await pausedScout()
      expect(agents.rows[0]!.status).toBe('paused')

      await reconcileDivisionAgents(division, withRunner, deps)

      expect(agents.rows[0]!.status).toBe('active')
      expect(events.kinds()).toContain('division.agents_activated')
    })

    it('leaves a pause the operator chose exactly as they chose it', async () => {
      // The one thing this must never do. A pause is a decision, and undoing it on
      // the next boot would mean the stop button does not hold.
      const { division, withRunner } = await pausedScout()
      agents.rows[0]!.touched = true

      await reconcileDivisionAgents(division, withRunner, deps)

      expect(agents.rows[0]!.status).toBe('paused')
      expect(events.kinds()).not.toContain('division.agents_activated')
    })

    it('leaves an agent that has run and since been paused alone', async () => {
      /*
       * `stampAgentRun` writes updated_at on every run, so "never edited" alone is
       * not enough to tell a default from a decision — an agent that ran once and was
       * then stood down has a bumped timestamp for a reason that is not an edit.
       */
      const { division, withRunner } = await pausedScout()
      agents.rows[0]!.lastRunAt = new Date('2026-10-01T00:00:00Z')

      await reconcileDivisionAgents(division, withRunner, deps)

      expect(agents.rows[0]!.status).toBe('paused')
    })

    it('does not wake an agent its module still ships paused', async () => {
      const mod = makeModule({
        agents: [{ ...makeModule().agents[0]!, key: 'scout', defaultStatus: 'paused' }],
      })
      const { division } = await createDivision(
        { name: 'Deadstock', slug: 'pod-store', moduleName: 'pod' },
        [mod],
        deps,
      )

      await reconcileDivisionAgents(division, mod, deps)

      expect(agents.rows[0]!.status).toBe('paused')
    })
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

  it('seeds a rule for an approval kind the module has since declared', async () => {
    /*
     * The guardrail this protects. A division created before its module declared
     * `{ kind: 'refund', neverAuto: true }` has no rule row for it, so the gate reads
     * `rule?.neverAuto` as undefined, nothing blocks, and the category graduates to
     * automatic on its own counters. A never-auto list that applies only to divisions
     * created after it was written is not a guardrail.
     */
    const before = makeModule()
    const { division } = await createDivision(
      { name: 'Deadstock', slug: 'pod-store', moduleName: 'pod' },
      [before],
      deps,
    )
    expect(rules.rows.some((r) => r.kind === 'refund')).toBe(false)

    await reconcileDivisionAgents(
      division,
      makeModule({
        approvalKinds: [...before.approvalKinds, { kind: 'refund', label: 'Refund', neverAuto: true }],
      }),
      deps,
    )

    const seeded = rules.rows.find((r) => r.kind === 'refund' && r.divisionId === division.id)
    expect(seeded).toMatchObject({ neverAuto: true, category: '*' })
  })

  it('seeds the missing rule even when no agent is missing', async () => {
    // The rule pass must not sit behind the agent early-return, or a module that
    // gains only an approval kind reconciles nothing at all.
    const before = makeModule()
    const { division } = await createDivision(
      { name: 'Deadstock', slug: 'pod-store', moduleName: 'pod' },
      [before],
      deps,
    )

    const added = await reconcileDivisionAgents(
      division,
      makeModule({
        approvalKinds: [...before.approvalKinds, { kind: 'refund', label: 'Refund', neverAuto: true }],
      }),
      deps,
    )

    expect(added).toEqual([])
    expect(rules.rows.some((r) => r.kind === 'refund')).toBe(true)
  })

  it('turns never_auto ON for a kind the module has since marked that way', async () => {
    /*
     * seed() is onConflictDoNothing, which protects earned counters and is right for
     * everything except this. A module TIGHTENING a guardrail on an existing kind —
     * marking `reply` neverAuto because there is no send path — reached divisions
     * created afterwards and no others. Same hole reconcile exists to close, one
     * level down, and it bit a real change: the flag was set in module.ts and the
     * running divisions never saw it.
     */
    const before = makeModule({ approvalKinds: [{ kind: 'reply', label: 'Reply' }] })
    const { division } = await createDivision(
      { name: 'Deadstock', slug: 'pod-store', moduleName: 'pod' },
      [before],
      deps,
    )
    expect(rules.rows.find((r) => r.kind === 'reply')!.neverAuto).toBe(false)

    await reconcileDivisionAgents(
      division,
      makeModule({ approvalKinds: [{ kind: 'reply', label: 'Reply', neverAuto: true }] }),
      deps,
    )

    expect(rules.rows.find((r) => r.kind === 'reply')!.neverAuto).toBe(true)
    expect(events.kinds()).toContain('division.never_auto_tightened')
  })

  it('does not turn never_auto OFF again when a module relaxes it', async () => {
    // One direction only. A module relaxing a safety flag must not silently
    // un-protect a division that has been running under it.
    const strict = makeModule({
      approvalKinds: [{ kind: 'reply', label: 'Reply', neverAuto: true }],
    })
    const { division } = await createDivision(
      { name: 'Deadstock', slug: 'pod-store', moduleName: 'pod' },
      [strict],
      deps,
    )

    await reconcileDivisionAgents(
      division,
      makeModule({ approvalKinds: [{ kind: 'reply', label: 'Reply' }] }),
      deps,
    )

    expect(rules.rows.find((r) => r.kind === 'reply')!.neverAuto).toBe(true)
  })

  it('does not reset a rule the operator has already earned autonomy on', async () => {
    const mod = makeModule()
    const { division } = await createDivision(
      { name: 'Deadstock', slug: 'pod-store', moduleName: 'pod' },
      [mod],
      deps,
    )
    const before = rules.rows.length

    await reconcileDivisionAgents(division, mod, deps)

    // seed() is onConflictDoNothing: re-running must not duplicate or overwrite.
    expect(rules.rows).toHaveLength(before)
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
