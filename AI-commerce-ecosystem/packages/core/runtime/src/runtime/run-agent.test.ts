import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FakeAgentRunStore,
  FakeClock,
  FakeEventSink,
  FakeSleeper,
  fixedRandom,
} from '../../test/fakes'
import { runAgent } from './run-agent'
import {
  AgentRunFailedError,
  NonRetriableError,
  RunBlockedError,
  type AgentContext,
  type AgentDefinition,
  type AgentRecord,
  type DivisionRecord,
  type MemoryEntry,
  type RecalledMemory,
  type RunLoopDeps,
  type TaskRecord,
} from './types'

let runs: FakeAgentRunStore
let events: FakeEventSink
let clock: FakeClock
let sleeper: FakeSleeper
let requestApproval: ReturnType<typeof vi.fn>
let ledgerPosts: Array<{ divisionId: string; amountCents: number; kind: string }>
let memoryWrites: Array<{ taskId: string | null; entries: MemoryEntry[] }>
let recalled: RecalledMemory[]
let deps: RunLoopDeps

const AGENT: AgentRecord = {
  id: 'agent_1',
  divisionId: 'div_pod',
  name: 'Designer',
  purpose: 'Turn approved concepts into design variants',
  moduleAgentKey: 'designer',
  model: 'claude-sonnet-5-5',
  systemPrompt: 'You are the Designer.',
  tools: ['fal.generate'],
  autonomy: 'propose',
  maxSteps: 12,
}

const DIVISION: DivisionRecord = { id: 'div_pod', name: 'POD Store', type: 'pod' }

const TASK: TaskRecord = {
  id: 'task_1',
  divisionId: 'div_pod',
  agentId: 'agent_1',
  title: 'Design concept 42',
  input: { conceptId: '42' },
  source: 'event',
}

beforeEach(() => {
  runs = new FakeAgentRunStore()
  events = new FakeEventSink()
  clock = new FakeClock()
  sleeper = new FakeSleeper(clock)
  requestApproval = vi.fn(async () => ({ status: 'pending' as const, approval: {} as never }))
  ledgerPosts = []
  memoryWrites = []
  recalled = []

  deps = {
    runs,
    events,
    clock,
    sleeper,
    random: fixedRandom(0.5),
    requestApproval: requestApproval as unknown as RunLoopDeps['requestApproval'],
    ledger: {
      async post(entry) {
        ledgerPosts.push(entry)
      },
    },
    memory: {
      async recall() {
        return recalled
      },
      async write(input) {
        memoryWrites.push({ taskId: input.taskId, entries: input.entries })
      },
    },
  }
})

/** A validator that accepts `{ ok: true }` and nothing else. */
const okSchema = {
  parse(value: unknown) {
    if (typeof value !== 'object' || value === null || (value as { ok?: unknown }).ok !== true) {
      throw new Error('expected { ok: true }')
    }
    return value as { ok: true }
  },
}

type Input = { conceptId: string }

function defineAgent(
  run: AgentDefinition<Input, { ok: true }>['run'],
  over: Partial<AgentDefinition<Input, { ok: true }>> = {},
): AgentDefinition<Input, { ok: true }> {
  return { key: 'designer', outputSchema: okSchema, run, ...over }
}

function request(over: Record<string, unknown> = {}) {
  return { agent: AGENT, division: DIVISION, task: TASK, input: { conceptId: '42' }, ...over }
}

describe('run loop happy path', () => {
  it('returns the validated output', async () => {
    const result = await runAgent(
      defineAgent(async () => ({ ok: true })),
      request(),
      deps,
    )
    expect(result).toEqual({ ok: true })
  })

  it('opens an agent_runs row before calling the agent and closes it as ok', async () => {
    let statusDuringRun: string | undefined
    await runAgent(
      defineAgent(async () => {
        statusDuringRun = runs.only().status
        return { ok: true }
      }),
      request(),
      deps,
    )

    expect(statusDuringRun).toBe('running')
    expect(runs.only()).toMatchObject({
      agentId: 'agent_1',
      taskId: 'task_1',
      divisionId: 'div_pod',
      status: 'ok',
      attempts: 1,
      output: { ok: true },
      error: null,
    })
  })

  it('writes a terminal event attributed to the station', async () => {
    await runAgent(defineAgent(async () => ({ ok: true })), request(), deps)

    expect(events.byKind('agent.run_ok')[0]).toMatchObject({
      divisionId: 'div_pod',
      agentId: 'agent_1',
      station: 'designer',
    })
  })

  it('hands the agent its row, division, task and goals', async () => {
    const goals = [{ id: 'g1', statement: '60 products live', current: 12, target: 60 }]
    let seen: AgentContext<Input> | undefined

    await runAgent(
      defineAgent(async (ctx) => {
        seen = ctx
        return { ok: true }
      }),
      request({ goals }),
      deps,
    )

    expect(seen!.agent.name).toBe('Designer')
    expect(seen!.division.name).toBe('POD Store')
    expect(seen!.task!.title).toBe('Design concept 42')
    expect(seen!.goals).toEqual(goals)
    expect(seen!.attempt).toBe(1)
    expect(seen!.previousError).toBeUndefined()
  })

  it('completes the task with the output', async () => {
    const completed: Array<{ taskId: string; output: unknown }> = []
    await runAgent(defineAgent(async () => ({ ok: true })), request(), {
      ...deps,
      tasks: {
        async complete(taskId, output) {
          completed.push({ taskId, output })
        },
        async fail() {},
      },
    })

    expect(completed).toEqual([{ taskId: 'task_1', output: { ok: true } }])
  })

  it('records tool calls for the run history', async () => {
    await runAgent(
      defineAgent(async (ctx) => {
        ctx.recordToolCall({ name: 'fal.generate', args: { prompt: 'x' }, ok: true })
        return { ok: true }
      }),
      request(),
      deps,
    )

    expect(runs.only().toolCalls).toEqual([
      { name: 'fal.generate', args: { prompt: 'x' }, ok: true },
    ])
  })

  it('passes the approval gate through, scoped to the division and task', async () => {
    await runAgent(
      defineAgent(async (ctx) => {
        await ctx.requestApproval({
          kind: 'design',
          category: 'flat-vector',
          refTable: 'pod.concepts',
          refId: '42',
          summary: '3 variants',
          payload: {},
        })
        return { ok: true }
      }),
      request(),
      deps,
    )

    expect(requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'design',
        divisionId: 'div_pod',
        taskId: 'task_1',
        requestedBy: 'agent:agent_1',
      }),
    )
  })
})

describe('run loop memory', () => {
  it('recalls memories before the run and hands them to the agent', async () => {
    recalled = [
      {
        id: 'm1',
        kind: 'lesson',
        content: 'Ideogram mangles phrases over six words',
        importance: 0.9,
        createdAt: new Date(),
      },
    ]

    let seen: readonly RecalledMemory[] = []
    await runAgent(
      defineAgent(async (ctx) => {
        seen = ctx.memories
        return { ok: true }
      }),
      request(),
      deps,
    )

    expect(seen).toHaveLength(1)
    expect(seen[0]!.content).toMatch(/six words/)
  })

  it('builds the recall query from the task title and input', async () => {
    const queries: string[] = []
    await runAgent(defineAgent(async () => ({ ok: true })), request(), {
      ...deps,
      memory: {
        async recall(input) {
          queries.push(input.query)
          return []
        },
        async write() {},
      },
    })

    expect(queries[0]).toContain('Design concept 42')
    expect(queries[0]).toContain('conceptId')
  })

  it('writes what the agent chose to remember', async () => {
    await runAgent(
      defineAgent(async (ctx) => {
        ctx.remember({ kind: 'lesson', content: 'Short phrases render better', importance: 0.8 })
        return { ok: true }
      }),
      request(),
      deps,
    )

    expect(memoryWrites).toHaveLength(1)
    expect(memoryWrites[0]).toMatchObject({ taskId: 'task_1' })
    expect(memoryWrites[0]!.entries[0]!.content).toBe('Short phrases render better')
  })

  it('keeps only the five most important memories from one run', async () => {
    await runAgent(
      defineAgent(async (ctx) => {
        for (let i = 1; i <= 8; i++) {
          ctx.remember({ kind: 'fact', content: `fact ${i}`, importance: i / 10 })
        }
        return { ok: true }
      }),
      request(),
      deps,
    )

    // An agent that remembers everything floods its own future context.
    const entries = memoryWrites[0]!.entries
    expect(entries).toHaveLength(5)
    expect(entries.map((e) => e.content)).toEqual([
      'fact 8',
      'fact 7',
      'fact 6',
      'fact 5',
      'fact 4',
    ])
  })

  it('still writes memories when the run ultimately fails', async () => {
    await runAgent(
      defineAgent(async (ctx) => {
        ctx.remember({ kind: 'lesson', content: 'This blueprint id is wrong', importance: 0.9 })
        throw new NonRetriableError('bad blueprint')
      }),
      request(),
      deps,
    ).catch(() => {})

    // A failure is exactly when a lesson is worth keeping.
    expect(memoryWrites[0]!.entries[0]!.content).toMatch(/blueprint/)
  })

  it('writes nothing when the agent remembered nothing', async () => {
    await runAgent(defineAgent(async () => ({ ok: true })), request(), deps)
    expect(memoryWrites).toHaveLength(0)
  })

  it('can be told to skip recall', async () => {
    const recall = vi.fn(async () => [])
    await runAgent(defineAgent(async () => ({ ok: true })), request(), {
      ...deps,
      memory: { recall, write: async () => {} },
    }, { skipMemory: true })

    expect(recall).not.toHaveBeenCalled()
  })
})

describe('run loop cost accounting', () => {
  it('records tokens and cost from a single model call', async () => {
    await runAgent(
      defineAgent(async (ctx) => {
        ctx.recordUsage({ model: 'claude-opus-5-5', inputTokens: 10_000, outputTokens: 2_000 })
        return { ok: true }
      }),
      request(),
      deps,
    )

    // opus 5.5 is $4/MTok in, $20/MTok out: 10k in = 4c, 2k out = 4c.
    expect(runs.only()).toMatchObject({ tokensIn: 10_000, tokensOut: 2_000 })
    expect(runs.only().costCents).toBeCloseTo(8, 6)
  })

  it('posts API spend to the ledger as a negative api_cost row', async () => {
    await runAgent(
      defineAgent(async (ctx) => {
        ctx.recordUsage({ model: 'claude-opus-5-5', inputTokens: 10_000, outputTokens: 2_000 })
        return { ok: true }
      }),
      request(),
      deps,
    )

    // Signed by effect, so the dashboard views can SUM without flipping anything.
    expect(ledgerPosts).toHaveLength(1)
    expect(ledgerPosts[0]).toMatchObject({ divisionId: 'div_pod', kind: 'api_cost' })
    expect(ledgerPosts[0]!.amountCents).toBeCloseTo(-8, 6)
  })

  it('does not post a ledger row for a free run', async () => {
    await runAgent(defineAgent(async () => ({ ok: true })), request(), deps)
    expect(ledgerPosts).toHaveLength(0)
  })

  it('sums usage across several calls and several models', async () => {
    await runAgent(
      defineAgent(async (ctx) => {
        ctx.recordUsage({ model: 'claude-opus-5-5', inputTokens: 10_000, outputTokens: 2_000 })
        ctx.recordUsage({ model: 'claude-sonnet-5-5', inputTokens: 10_000, outputTokens: 2_000 })
        return { ok: true }
      }),
      request(),
      deps,
    )

    // sonnet 5.5 is $2/$10: 2c + 2c. Total 8c + 4c = 12c.
    expect(runs.only().costCents).toBeCloseTo(12, 6)
  })

  it('prices cached input separately from fresh input', async () => {
    await runAgent(
      defineAgent(async (ctx) => {
        ctx.recordUsage({
          model: 'claude-opus-5-5',
          inputTokens: 0,
          outputTokens: 0,
          cacheReadInputTokens: 100_000,
          cacheCreationInputTokens: 10_000,
        })
        return { ok: true }
      }),
      request(),
      deps,
    )

    // cache read $0.20/MTok x 100k = 2c; cache write $5.00/MTok x 10k = 5c.
    expect(runs.only().costCents).toBeCloseTo(7, 6)
    expect(runs.only().tokensIn).toBe(110_000)
  })

  it('still bills the tokens a failed run burned', async () => {
    await runAgent(
      defineAgent(async (ctx) => {
        ctx.recordUsage({ model: 'claude-opus-5-5', inputTokens: 10_000, outputTokens: 2_000 })
        throw new NonRetriableError('gave up')
      }),
      request(),
      deps,
    ).catch(() => {})

    expect(runs.only()).toMatchObject({ status: 'error' })
    expect(runs.only().costCents).toBeCloseTo(8, 6)
    // Money spent on a failed run is still money spent.
    expect(ledgerPosts[0]!.amountCents).toBeCloseTo(-8, 6)
  })

  it('accumulates the cost of every attempt, not just the last', async () => {
    await runAgent(
      defineAgent(async (ctx) => {
        ctx.recordUsage({ model: 'claude-opus-5-5', inputTokens: 10_000, outputTokens: 2_000 })
        if (ctx.attempt < 3) throw new Error('flaky')
        return { ok: true } as const
      }),
      request(),
      deps,
    )

    expect(runs.only().costCents).toBeCloseTo(24, 6)
  })

  it('charges nothing for an unknown model but raises the alarm', async () => {
    await runAgent(
      defineAgent(async (ctx) => {
        ctx.recordUsage({ model: 'some-future-model', inputTokens: 1_000, outputTokens: 100 })
        return { ok: true }
      }),
      request(),
      deps,
    )

    expect(runs.only().costCents).toBe(0)
    expect(events.byKind('agent.unknown_model')).toHaveLength(1)
  })
})

describe('run loop validation and retries', () => {
  it('retries when the agent returns output that fails its schema', async () => {
    const run = vi.fn().mockResolvedValueOnce({ ok: 'nope' }).mockResolvedValueOnce({ ok: true })

    expect(await runAgent(defineAgent(run), request(), deps)).toEqual({ ok: true })
    expect(run).toHaveBeenCalledTimes(2)
    expect(runs.only()).toMatchObject({ status: 'ok', attempts: 2 })
  })

  it('tells the agent what was wrong with its previous output', async () => {
    const seen: Array<string | undefined> = []
    const run = vi.fn(async (ctx: AgentContext<Input>) => {
      seen.push(ctx.previousError)
      return (ctx.attempt === 1 ? { ok: 'nope' } : { ok: true }) as { ok: true }
    })

    await runAgent(defineAgent(run), request(), deps)

    expect(seen[0]).toBeUndefined()
    expect(seen[1]).toMatch(/expected \{ ok: true \}/)
  })

  it('fails the run when every attempt returns invalid output', async () => {
    const run = vi.fn(async () => ({ ok: 'nope' }) as unknown as { ok: true })

    await expect(runAgent(defineAgent(run), request(), deps)).rejects.toBeInstanceOf(
      AgentRunFailedError,
    )
    expect(run).toHaveBeenCalledTimes(4)
    expect(runs.only().error).toMatch(/schema validation/i)
    expect(runs.only().output).toBeNull()
  })

  it('fails the task when the run is abandoned', async () => {
    const failed: Array<{ taskId: string; error: string }> = []
    await runAgent(
      defineAgent(async () => {
        throw new NonRetriableError('nope')
      }),
      request(),
      {
        ...deps,
        tasks: {
          async complete() {},
          async fail(taskId, error) {
            failed.push({ taskId, error })
          },
        },
      },
    ).catch(() => {})

    expect(failed).toEqual([{ taskId: 'task_1', error: 'nope' }])
  })

  it('makes four attempts by default — the initial call plus three retries', async () => {
    const run = vi.fn(async () => {
      throw new Error('flaky')
    })
    await runAgent(defineAgent(run), request(), deps).catch(() => {})
    expect(run).toHaveBeenCalledTimes(4)
  })

  it('does not retry a NonRetriableError', async () => {
    const run = vi.fn(async () => {
      throw new NonRetriableError('blueprint 999 does not exist')
    })

    await expect(runAgent(defineAgent(run), request(), deps)).rejects.toBeInstanceOf(
      AgentRunFailedError,
    )
    expect(run).toHaveBeenCalledTimes(1)
    expect(sleeper.slept).toHaveLength(0)
  })

  it('backs off exponentially between attempts and not after the last one', async () => {
    const run = vi.fn(async () => {
      throw new Error('flaky')
    })
    await runAgent(defineAgent(run), request(), deps).catch(() => {})

    // Four attempts means three waits; jitter pinned at 0.5 gives the nominal value.
    expect(sleeper.slept).toEqual([1000, 2000, 4000])
  })

  it('caps the backoff delay', async () => {
    const run = vi.fn(async () => {
      throw new Error('flaky')
    })
    await runAgent(defineAgent(run, { maxAttempts: 6 }), request(), deps, {
      backoff: { baseMs: 1000, maxMs: 3000 },
    }).catch(() => {})

    expect(sleeper.slept).toEqual([1000, 2000, 3000, 3000, 3000])
  })

  it('applies jitter around the nominal delay', async () => {
    const run = vi.fn(async () => {
      throw new Error('flaky')
    })
    await runAgent(defineAgent(run, { maxAttempts: 2 }), request(), {
      ...deps,
      random: fixedRandom(1),
    }).catch(() => {})

    expect(sleeper.slept[0]).toBeGreaterThan(1000)
    expect(sleeper.slept[0]).toBeLessThanOrEqual(1200)
  })

  it('logs a warning for each retry and an error when abandoned', async () => {
    const run = vi.fn(async () => {
      throw new Error('ECONNRESET')
    })
    await runAgent(defineAgent(run), request(), deps).catch(() => {})

    expect(events.byKind('agent.retry')).toHaveLength(3)
    expect(events.byKind('agent.retry')[0]!.message).toMatch(/ECONNRESET/)
    expect(events.byKind('agent.run_error')[0]).toMatchObject({ level: 'error' })
  })
})

describe('run loop spend guard', () => {
  it('refuses to start when the division is over its cap', async () => {
    const run = vi.fn(async () => ({ ok: true }) as const)
    const guarded: RunLoopDeps = {
      ...deps,
      spendGuard: { check: async () => 'daily spend cap of $25 reached' },
    }

    await expect(runAgent(defineAgent(run), request(), guarded)).rejects.toBeInstanceOf(
      RunBlockedError,
    )
    expect(run).not.toHaveBeenCalled()
  })

  it('does not open a run row for a blocked agent, but does raise the alarm', async () => {
    const guarded: RunLoopDeps = { ...deps, spendGuard: { check: async () => 'all agents paused' } }

    await runAgent(defineAgent(async () => ({ ok: true })), request(), guarded).catch(() => {})

    expect(runs.all()).toHaveLength(0)
    expect(events.byKind('agent.blocked')[0]).toMatchObject({ level: 'warn', agentId: 'agent_1' })
  })

  it('checks the cap for the agent’s own division', async () => {
    const seen: string[] = []
    await runAgent(defineAgent(async () => ({ ok: true })), request(), {
      ...deps,
      spendGuard: {
        check: async (divisionId) => {
          seen.push(divisionId)
          return null
        },
      },
    })

    expect(seen).toEqual(['div_pod'])
  })
})
