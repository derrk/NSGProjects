import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FakeAgentRunStore,
  FakeClock,
  FakeEventSink,
  FakeSleeper,
  fixedRandom,
} from '../../test/fakes.js'
import { runAgent } from './run-agent.js'
import {
  AgentRunFailedError,
  NonRetriableError,
  RunBlockedError,
  type AgentContext,
  type AgentDefinition,
  type RunAgentDeps,
} from './types.js'

let runs: FakeAgentRunStore
let events: FakeEventSink
let clock: FakeClock
let sleeper: FakeSleeper
let requestApproval: ReturnType<typeof vi.fn>
let deps: RunAgentDeps

beforeEach(() => {
  runs = new FakeAgentRunStore()
  events = new FakeEventSink()
  clock = new FakeClock()
  sleeper = new FakeSleeper(clock)
  requestApproval = vi.fn(async () => ({ status: 'pending' as const, approval: {} as never }))
  deps = {
    runs,
    events,
    clock,
    sleeper,
    random: fixedRandom(0.5),
    requestApproval: requestApproval as unknown as RunAgentDeps['requestApproval'],
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

function defineAgent(
  run: AgentDefinition<{ seed: number }, { ok: true }>['run'],
  over: Partial<AgentDefinition<{ seed: number }, { ok: true }>> = {},
): AgentDefinition<{ seed: number }, { ok: true }> {
  return { name: 'designer', outputSchema: okSchema, run, ...over }
}

const input = { seed: 1 }

describe('runAgent happy path', () => {
  it('returns the validated output', async () => {
    const result = await runAgent(defineAgent(async () => ({ ok: true })), input, 'cron', deps)
    expect(result).toEqual({ ok: true })
  })

  it('opens an agent_runs row before calling the agent and closes it as ok', async () => {
    let statusDuringRun: string | undefined
    await runAgent(
      defineAgent(async () => {
        statusDuringRun = runs.only().status
        return { ok: true }
      }),
      input,
      'cron',
      deps,
    )

    expect(statusDuringRun).toBe('running')
    expect(runs.only()).toMatchObject({
      agent: 'designer',
      trigger: 'cron',
      status: 'ok',
      attempts: 1,
      input,
      output: { ok: true },
      error: null,
    })
    expect(runs.only().finishedAt).toEqual(clock.now())
  })

  it('writes a terminal event', async () => {
    await runAgent(defineAgent(async () => ({ ok: true })), input, 'cron', deps)
    expect(events.kinds()).toContain('agent.ok')
  })

  it('gives the agent its run id, attempt number and input', async () => {
    const seen: Array<Pick<AgentContext<unknown>, 'runId' | 'agent' | 'attempt' | 'maxAttempts'>> = []
    await runAgent(
      defineAgent(async (ctx) => {
        seen.push({ runId: ctx.runId, agent: ctx.agent, attempt: ctx.attempt, maxAttempts: ctx.maxAttempts })
        expect(ctx.input).toEqual(input)
        expect(ctx.previousError).toBeUndefined()
        return { ok: true }
      }),
      input,
      'cron',
      deps,
    )

    expect(seen).toEqual([{ runId: runs.only().id, agent: 'designer', attempt: 1, maxAttempts: 4 }])
  })

  it('tags events written through ctx.log with the agent and the run', async () => {
    await runAgent(
      defineAgent(async (ctx) => {
        await ctx.log('designer.generated', 'made 3 variants', { refTable: 'designs', refId: 'd1' })
        return { ok: true }
      }),
      input,
      'cron',
      deps,
    )

    expect(events.byKind('designer.generated')[0]).toMatchObject({
      agent: 'designer',
      level: 'info',
      message: 'made 3 variants',
      refTable: 'designs',
      refId: 'd1',
    })
  })

  it('passes the approval gate through to the agent', async () => {
    await runAgent(
      defineAgent(async (ctx) => {
        await ctx.requestApproval({
          kind: 'design',
          category: 'flat-vector',
          refId: 'd1',
          summary: '3 variants',
          payload: {},
        })
        return { ok: true }
      }),
      input,
      'cron',
      deps,
    )

    expect(requestApproval).toHaveBeenCalledWith(expect.objectContaining({ kind: 'design', refId: 'd1' }))
  })
})

describe('runAgent output validation', () => {
  it('retries when the agent returns output that fails its schema', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ ok: 'nope' })
      .mockResolvedValueOnce({ ok: true })

    const result = await runAgent(defineAgent(run), input, 'cron', deps)

    expect(result).toEqual({ ok: true })
    expect(run).toHaveBeenCalledTimes(2)
    expect(runs.only()).toMatchObject({ status: 'ok', attempts: 2 })
  })

  it('tells the agent what was wrong with its previous output', async () => {
    const seen: Array<string | undefined> = []
    const run = vi.fn(async (ctx: AgentContext<{ seed: number }>) => {
      seen.push(ctx.previousError)
      return (ctx.attempt === 1 ? { ok: 'nope' } : { ok: true }) as { ok: true }
    })

    await runAgent(defineAgent(run), input, 'cron', deps)

    expect(seen[0]).toBeUndefined()
    expect(seen[1]).toMatch(/expected \{ ok: true \}/)
  })

  it('fails the run when every attempt returns invalid output', async () => {
    const run = vi.fn(async () => ({ ok: 'nope' }) as unknown as { ok: true })

    await expect(runAgent(defineAgent(run), input, 'cron', deps)).rejects.toBeInstanceOf(
      AgentRunFailedError,
    )
    expect(run).toHaveBeenCalledTimes(4)
    expect(runs.only()).toMatchObject({ status: 'error', attempts: 4 })
    expect(runs.only().error).toMatch(/schema validation/i)
  })

  it('never reports unvalidated output as the run output', async () => {
    const run = vi.fn(async () => ({ ok: 'nope' }) as unknown as { ok: true })
    await runAgent(defineAgent(run), input, 'cron', deps).catch(() => {})
    expect(runs.only().output).toBeNull()
  })
})

describe('runAgent retries', () => {
  it('retries a transient failure and succeeds', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ ok: true })

    await expect(runAgent(defineAgent(run), input, 'cron', deps)).resolves.toEqual({ ok: true })
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('makes four attempts by default — the initial call plus three retries', async () => {
    const run = vi.fn(async () => {
      throw new Error('flaky')
    })

    await runAgent(defineAgent(run), input, 'cron', deps).catch(() => {})

    expect(run).toHaveBeenCalledTimes(4)
  })

  it('honours a per-agent maxAttempts', async () => {
    const run = vi.fn(async () => {
      throw new Error('flaky')
    })

    await runAgent(defineAgent(run, { maxAttempts: 2 }), input, 'cron', deps).catch(() => {})

    expect(run).toHaveBeenCalledTimes(2)
  })

  it('does not retry a NonRetriableError', async () => {
    const run = vi.fn(async () => {
      throw new NonRetriableError('blueprint 999 does not exist')
    })

    await expect(runAgent(defineAgent(run), input, 'cron', deps)).rejects.toBeInstanceOf(
      AgentRunFailedError,
    )
    expect(run).toHaveBeenCalledTimes(1)
    expect(sleeper.slept).toHaveLength(0)
    expect(runs.only()).toMatchObject({ status: 'error', attempts: 1 })
  })

  it('backs off exponentially between attempts and not after the last one', async () => {
    const run = vi.fn(async () => {
      throw new Error('flaky')
    })

    await runAgent(defineAgent(run), input, 'cron', deps).catch(() => {})

    // 4 attempts means 3 waits. Base 1000ms doubling, with jitter pinned at 0.5 the
    // delay is exactly the nominal value.
    expect(sleeper.slept).toEqual([1000, 2000, 4000])
  })

  it('caps the backoff delay', async () => {
    const run = vi.fn(async () => {
      throw new Error('flaky')
    })

    await runAgent(defineAgent(run, { maxAttempts: 6 }), input, 'cron', deps, {
      backoff: { baseMs: 1000, maxMs: 3000 },
    }).catch(() => {})

    expect(sleeper.slept).toEqual([1000, 2000, 3000, 3000, 3000])
  })

  it('applies jitter around the nominal delay', async () => {
    const run = vi.fn(async () => {
      throw new Error('flaky')
    })

    await runAgent(defineAgent(run, { maxAttempts: 2 }), input, 'cron', {
      ...deps,
      random: fixedRandom(1),
    }).catch(() => {})

    // jitter 0.2 and random()=1 pushes the 1000ms delay to its upper bound.
    expect(sleeper.slept[0]).toBeGreaterThan(1000)
    expect(sleeper.slept[0]).toBeLessThanOrEqual(1200)
  })

  it('logs a warning event for each retry', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ ok: true })

    await runAgent(defineAgent(run), input, 'cron', deps)

    const retries = events.byKind('agent.retry')
    expect(retries).toHaveLength(1)
    expect(retries[0]).toMatchObject({ level: 'warn' })
    expect(retries[0]!.message).toMatch(/ECONNRESET/)
  })

  it('writes an error event when the run is finally abandoned', async () => {
    const run = vi.fn(async () => {
      throw new Error('flaky')
    })

    await runAgent(defineAgent(run), input, 'cron', deps).catch(() => {})

    expect(events.byKind('agent.error')[0]).toMatchObject({ level: 'error', agent: 'designer' })
  })
})

describe('runAgent cost accounting', () => {
  it('records tokens and cost from a single model call', async () => {
    await runAgent(
      defineAgent(async (ctx) => {
        ctx.recordUsage({ model: 'claude-opus-5-5', inputTokens: 10_000, outputTokens: 2_000 })
        return { ok: true }
      }),
      input,
      'cron',
      deps,
    )

    // opus 5.5 is $4/MTok in, $20/MTok out: 10k in = 4c, 2k out = 4c.
    expect(runs.only()).toMatchObject({ tokensIn: 10_000, tokensOut: 2_000 })
    expect(runs.only().costCents).toBeCloseTo(8, 6)
  })

  it('sums usage across several calls and several models', async () => {
    await runAgent(
      defineAgent(async (ctx) => {
        ctx.recordUsage({ model: 'claude-opus-5-5', inputTokens: 10_000, outputTokens: 2_000 })
        ctx.recordUsage({ model: 'claude-sonnet-5-5', inputTokens: 10_000, outputTokens: 2_000 })
        return { ok: true }
      }),
      input,
      'cron',
      deps,
    )

    // sonnet 5.5 is $2/$10: 10k in = 2c, 2k out = 2c. 8c + 4c = 12c.
    expect(runs.only()).toMatchObject({ tokensIn: 20_000, tokensOut: 4_000 })
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
      input,
      'cron',
      deps,
    )

    // cache read $0.20/MTok x 100k = 2c; cache write $5.00/MTok x 10k = 5c.
    expect(runs.only().costCents).toBeCloseTo(7, 6)
    // Every input-side token counts toward tokensIn, cached or not.
    expect(runs.only().tokensIn).toBe(110_000)
  })

  it('still bills the tokens a failed run burned', async () => {
    await runAgent(
      defineAgent(async (ctx) => {
        ctx.recordUsage({ model: 'claude-opus-5-5', inputTokens: 10_000, outputTokens: 2_000 })
        throw new NonRetriableError('gave up')
      }),
      input,
      'cron',
      deps,
    ).catch(() => {})

    expect(runs.only()).toMatchObject({ status: 'error', tokensIn: 10_000 })
    expect(runs.only().costCents).toBeCloseTo(8, 6)
  })

  it('accumulates the cost of every attempt, not just the last', async () => {
    const run = vi.fn(async (ctx: AgentContext<{ seed: number }>) => {
      ctx.recordUsage({ model: 'claude-opus-5-5', inputTokens: 10_000, outputTokens: 2_000 })
      if (ctx.attempt < 3) throw new Error('flaky')
      return { ok: true } as const
    })

    await runAgent(defineAgent(run), input, 'cron', deps)

    expect(runs.only().costCents).toBeCloseTo(24, 6)
  })

  it('charges nothing for an unknown model but does not crash', async () => {
    await runAgent(
      defineAgent(async (ctx) => {
        ctx.recordUsage({ model: 'some-future-model', inputTokens: 1_000, outputTokens: 100 })
        return { ok: true }
      }),
      input,
      'cron',
      deps,
    )

    expect(runs.only().costCents).toBe(0)
    expect(runs.only().tokensIn).toBe(1_000)
    expect(events.byKind('agent.unknown_model')).toHaveLength(1)
  })
})

describe('runAgent spend guard', () => {
  it('refuses to start when the guard blocks the agent', async () => {
    const run = vi.fn(async () => ({ ok: true }) as const)
    const guarded: RunAgentDeps = {
      ...deps,
      spendGuard: { check: async () => 'daily fal.ai cap of $15 reached' },
    }

    await expect(runAgent(defineAgent(run), input, 'cron', guarded)).rejects.toBeInstanceOf(
      RunBlockedError,
    )
    expect(run).not.toHaveBeenCalled()
  })

  it('does not open a run row for a blocked agent, but does raise the alarm', async () => {
    const guarded: RunAgentDeps = {
      ...deps,
      spendGuard: { check: async () => 'all agents paused' },
    }

    await runAgent(defineAgent(async () => ({ ok: true })), input, 'cron', guarded).catch(() => {})

    expect(runs.all()).toHaveLength(0)
    expect(events.byKind('agent.blocked')[0]).toMatchObject({ level: 'warn', agent: 'designer' })
  })

  it('runs normally when the guard allows it', async () => {
    const guarded: RunAgentDeps = { ...deps, spendGuard: { check: async () => null } }

    await expect(
      runAgent(defineAgent(async () => ({ ok: true })), input, 'cron', guarded),
    ).resolves.toEqual({ ok: true })
  })
})
