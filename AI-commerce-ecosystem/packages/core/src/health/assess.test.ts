import { describe, expect, it } from 'vitest'

import { assessAgentHealth, needsOperatorAlert } from './assess'
import type { AgentDescriptor, RunSummary } from './types'

const NOW = new Date('2026-10-09T12:00:00.000Z')

/** One hourly agent and one event-driven agent is enough to cover both branches. */
const AGENTS: AgentDescriptor[] = [{ name: 'orders', intervalMinutes: 60 }, { name: 'designer' }]

function minutesAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 60_000)
}

function run(over: Partial<RunSummary> = {}): RunSummary {
  const startedAt = over.startedAt ?? minutesAgo(5)
  return {
    agent: 'orders',
    status: 'ok',
    startedAt,
    finishedAt: startedAt,
    ...over,
  }
}

function statusOf(runs: RunSummary[], agent = 'orders', options = {}) {
  const health = assessAgentHealth(runs, NOW, { agents: AGENTS, ...options })
  return health.find((h) => h.agent === agent)!
}

describe('assessAgentHealth', () => {
  it('reports every agent on the roster, even one with no runs', () => {
    const health = assessAgentHealth([], NOW, { agents: AGENTS })
    expect(health.map((h) => h.agent)).toEqual(['orders', 'designer'])
  })

  it('is idle and green after a recent successful run', () => {
    expect(statusOf([run({ startedAt: minutesAgo(5) })])).toMatchObject({
      status: 'idle',
      light: 'green',
      consecutiveFailures: 0,
    })
  })

  it('is running while a run is in flight', () => {
    expect(statusOf([run({ status: 'running', finishedAt: null })])).toMatchObject({
      status: 'running',
      light: 'green',
    })
  })

  describe('staleness', () => {
    it('is not stale at exactly its interval', () => {
      expect(statusOf([run({ startedAt: minutesAgo(60) })]).status).toBe('idle')
    })

    it('is not stale at twice its interval', () => {
      expect(statusOf([run({ startedAt: minutesAgo(120) })]).status).toBe('idle')
    })

    it('goes amber past twice its interval', () => {
      expect(statusOf([run({ startedAt: minutesAgo(121) })])).toMatchObject({
        status: 'stale',
        light: 'amber',
      })
    })

    it('explains how overdue it is', () => {
      expect(statusOf([run({ startedAt: minutesAgo(300) })]).reason).toMatch(/300 minutes ago/)
    })

    it('treats an agent that has never run as stale rather than healthy', () => {
      expect(statusOf([])).toMatchObject({ status: 'stale', reason: 'has never run' })
    })

    it('never calls an event-driven agent stale', () => {
      // The Designer only runs when a concept is approved; silence is not a fault.
      expect(statusOf([], 'designer')).toMatchObject({ status: 'idle', light: 'green' })
    })

    it('measures staleness from the most recent run, not the oldest', () => {
      const runs = [run({ startedAt: minutesAgo(600) }), run({ startedAt: minutesAgo(10) })]
      expect(statusOf(runs).status).toBe('idle')
    })
  })

  describe('failure streaks', () => {
    const failure = (minutes: number) => run({ status: 'error', startedAt: minutesAgo(minutes) })

    it('stays green after a single failure', () => {
      expect(statusOf([failure(5)]).status).toBe('idle')
      expect(statusOf([failure(5)]).consecutiveFailures).toBe(1)
    })

    it('stays green after two consecutive failures', () => {
      expect(statusOf([failure(5), failure(10)]).status).toBe('idle')
    })

    it('goes red at three consecutive failures', () => {
      expect(statusOf([failure(5), failure(10), failure(15)])).toMatchObject({
        status: 'error',
        light: 'red',
        consecutiveFailures: 3,
      })
    })

    it('counts the streak from the newest run backwards', () => {
      const runs = [failure(5), failure(10), run({ startedAt: minutesAgo(15) }), failure(20)]
      expect(statusOf(runs).consecutiveFailures).toBe(2)
      expect(statusOf(runs).status).toBe('idle')
    })

    it('resets the streak once a run succeeds', () => {
      const runs = [run({ startedAt: minutesAgo(1) }), failure(5), failure(10), failure(15)]
      expect(statusOf(runs)).toMatchObject({ consecutiveFailures: 0, status: 'idle' })
    })

    it('stays red while retrying, rather than showing green for the in-flight run', () => {
      const runs = [
        run({ status: 'running', startedAt: minutesAgo(1), finishedAt: null }),
        failure(5),
        failure(10),
        failure(15),
      ]
      // A green light here would hide exactly the condition the operator needs to see.
      expect(statusOf(runs).status).toBe('error')
    })

    it('ignores the in-flight run when counting the streak', () => {
      const runs = [
        run({ status: 'running', startedAt: minutesAgo(1), finishedAt: null }),
        failure(5),
      ]
      expect(statusOf(runs).consecutiveFailures).toBe(1)
    })
  })

  describe('blocked agents', () => {
    it('goes amber when a spend cap holds it back', () => {
      expect(statusOf([run()], 'orders', { blocked: ['orders'] })).toMatchObject({
        status: 'blocked',
        light: 'amber',
      })
    })

    it('still goes red when a blocked agent is also failing', () => {
      const failing = [1, 2, 3].map((m) => run({ status: 'error', startedAt: minutesAgo(m) }))
      expect(statusOf(failing, 'orders', { blocked: ['orders'] }).status).toBe('error')
    })

    it('leaves other agents alone', () => {
      expect(statusOf([run()], 'designer', { blocked: ['orders'] }).status).toBe('idle')
    })
  })

  it('does not let one agent’s runs affect another', () => {
    const runs = [
      run({ agent: 'designer', status: 'error', startedAt: minutesAgo(1) }),
      run({ agent: 'designer', status: 'error', startedAt: minutesAgo(2) }),
      run({ agent: 'designer', status: 'error', startedAt: minutesAgo(3) }),
      run({ agent: 'orders', startedAt: minutesAgo(5) }),
    ]
    expect(statusOf(runs, 'orders').status).toBe('idle')
    expect(statusOf(runs, 'designer').status).toBe('error')
  })
})

describe('needsOperatorAlert', () => {
  it('emails only for red stations', () => {
    const health = assessAgentHealth(
      [
        ...[1, 2, 3].map((m) => run({ agent: 'orders', status: 'error', startedAt: minutesAgo(m) })),
      ],
      NOW,
      { agents: AGENTS },
    )

    expect(needsOperatorAlert(health).map((h) => h.agent)).toEqual(['orders'])
  })

  it('stays quiet when everything is merely stale', () => {
    const health = assessAgentHealth([run({ startedAt: minutesAgo(999) })], NOW, { agents: AGENTS })
    expect(needsOperatorAlert(health)).toEqual([])
  })
})
