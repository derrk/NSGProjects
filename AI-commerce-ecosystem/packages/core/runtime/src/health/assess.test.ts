import { describe, expect, it } from 'vitest'

import { assessAgentHealth, needsOperatorAlert } from './assess'
import { intervalMinutes, isEventDriven } from './schedule'
import type { AgentDescriptor, RunSummary } from './types'

const NOW = new Date('2026-10-09T12:00:00.000Z')

const HOURLY: AgentDescriptor = {
  id: 'a_orders',
  name: 'Store ops',
  divisionId: 'div_pod',
  schedule: '0 * * * *',
}

const EVENT_DRIVEN: AgentDescriptor = {
  id: 'a_designer',
  name: 'Designer',
  divisionId: 'div_pod',
  schedule: 'event:concept.approved',
}

const AGENTS = [HOURLY, EVENT_DRIVEN]

function minutesAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 60_000)
}

function run(over: Partial<RunSummary> = {}): RunSummary {
  const startedAt = over.startedAt ?? minutesAgo(5)
  return { agentId: HOURLY.id, status: 'ok', startedAt, finishedAt: startedAt, ...over }
}

function statusOf(runs: RunSummary[], agentId = HOURLY.id, options = {}) {
  return assessAgentHealth(AGENTS, runs, NOW, options).find((h) => h.agentId === agentId)!
}

describe('intervalMinutes', () => {
  it.each([
    ['*/15 * * * *', 15],
    ['*/5 * * * *', 5],
    ['* * * * *', 1],
    ['0 * * * *', 60],
    ['30 * * * *', 60],
    ['0 */6 * * *', 360],
    ['0 6 * * *', 1440],
    ['30 23 * * *', 1440],
    ['0 6,18 * * *', 720],
    ['0 6 * * 1', 10080],
    ['TZ=America/Chicago 0 6 * * *', 1440],
    ['TZ=America/Chicago */15 * * * *', 15],
  ])('reads %s as %i minutes', (expr, expected) => {
    expect(intervalMinutes(expr)).toBe(expected)
  })

  it.each([
    [null],
    [undefined],
    [''],
    ['event:concept.approved'],
    ['not a cron'],
    ['0 6 *'],
  ])('returns null for %s rather than guessing', (expr) => {
    // A wrong interval turns a healthy station amber or hides a dead one, so an
    // expression this cannot read must not produce a confident number.
    expect(intervalMinutes(expr as string | null)).toBeNull()
  })

  it('recognises an event schedule', () => {
    expect(isEventDriven('event:design.approved')).toBe(true)
    expect(isEventDriven('0 6 * * *')).toBe(false)
  })
})

describe('assessAgentHealth', () => {
  it('reports every registered agent, even one with no runs', () => {
    const health = assessAgentHealth(AGENTS, [], NOW)
    expect(health.map((h) => h.agentId)).toEqual([HOURLY.id, EVENT_DRIVEN.id])
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
    it.each([
      [60, 'idle'],
      [120, 'idle'],
      [121, 'stale'],
      [300, 'stale'],
    ])('after %i minutes it is %s', (minutes, expected) => {
      expect(statusOf([run({ startedAt: minutesAgo(minutes) })]).status).toBe(expected)
    })

    it('explains how overdue it is', () => {
      expect(statusOf([run({ startedAt: minutesAgo(300) })]).reason).toMatch(/300 minutes ago/)
    })

    it('treats an agent that has never run as stale rather than healthy', () => {
      expect(statusOf([])).toMatchObject({ status: 'stale', reason: 'has never run' })
    })

    it('never calls an event-driven agent stale', () => {
      // The Designer only runs when a concept is approved; silence is not a fault.
      expect(statusOf([], EVENT_DRIVEN.id)).toMatchObject({ status: 'idle', light: 'green' })
    })

    it('measures staleness from the most recent run, not the oldest', () => {
      const runs = [run({ startedAt: minutesAgo(600) }), run({ startedAt: minutesAgo(10) })]
      expect(statusOf(runs).status).toBe('idle')
    })
  })

  describe('failure streaks', () => {
    const failure = (minutes: number) => run({ status: 'error', startedAt: minutesAgo(minutes) })

    it.each([
      [1, 'idle'],
      [2, 'idle'],
      [3, 'error'],
    ])('%i consecutive failures reads as %s', (count, expected) => {
      const runs = Array.from({ length: count }, (_, i) => failure(i + 1))
      expect(statusOf(runs).status).toBe(expected)
    })

    it('counts the streak from the newest run backwards', () => {
      const runs = [failure(5), failure(10), run({ startedAt: minutesAgo(15) }), failure(20)]
      expect(statusOf(runs)).toMatchObject({ consecutiveFailures: 2, status: 'idle' })
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
      // Green here would hide exactly the condition the operator needs to see.
      expect(statusOf(runs).status).toBe('error')
    })

    it('ignores the in-flight run when counting the streak', () => {
      const runs = [run({ status: 'running', startedAt: minutesAgo(1), finishedAt: null }), failure(5)]
      expect(statusOf(runs).consecutiveFailures).toBe(1)
    })
  })

  describe('blocked agents', () => {
    it('goes amber when a spend cap holds the agent back', () => {
      expect(statusOf([run()], HOURLY.id, { blockedAgents: [HOURLY.id] })).toMatchObject({
        status: 'blocked',
        light: 'amber',
      })
    })

    it('goes amber for every agent in a paused division', () => {
      const health = assessAgentHealth(AGENTS, [run()], NOW, { blockedDivisions: ['div_pod'] })
      expect(health.every((h) => h.status === 'blocked')).toBe(true)
    })

    it('goes amber when the agent row itself is paused', () => {
      const paused = [{ ...HOURLY, status: 'paused' as const }]
      expect(assessAgentHealth(paused, [run()], NOW)[0]).toMatchObject({ status: 'blocked' })
    })

    it('still goes red when a blocked agent is also failing', () => {
      const failing = [1, 2, 3].map((m) => run({ status: 'error', startedAt: minutesAgo(m) }))
      expect(statusOf(failing, HOURLY.id, { blockedAgents: [HOURLY.id] }).status).toBe('error')
    })
  })

  it('does not let one agent’s runs affect another', () => {
    const runs = [
      ...[1, 2, 3].map((m) =>
        run({ agentId: EVENT_DRIVEN.id, status: 'error', startedAt: minutesAgo(m) }),
      ),
      run({ agentId: HOURLY.id, startedAt: minutesAgo(5) }),
    ]
    expect(statusOf(runs, HOURLY.id).status).toBe('idle')
    expect(statusOf(runs, EVENT_DRIVEN.id).status).toBe('error')
  })

  it('keeps agents from different divisions apart', () => {
    const otherDivision: AgentDescriptor = {
      id: 'a_cards',
      name: 'Sourcing scout',
      divisionId: 'div_cards',
      schedule: '0 * * * *',
    }
    const health = assessAgentHealth([HOURLY, otherDivision], [run({ startedAt: minutesAgo(5) })], NOW)

    expect(health.find((h) => h.agentId === 'a_cards')).toMatchObject({
      divisionId: 'div_cards',
      status: 'stale',
    })
  })
})

describe('needsOperatorAlert', () => {
  it('emails only for red stations', () => {
    const health = assessAgentHealth(
      AGENTS,
      [1, 2, 3].map((m) => run({ status: 'error', startedAt: minutesAgo(m) })),
      NOW,
    )
    expect(needsOperatorAlert(health).map((h) => h.agentId)).toEqual([HOURLY.id])
  })

  it('stays quiet when everything is merely stale', () => {
    const health = assessAgentHealth(AGENTS, [run({ startedAt: minutesAgo(999) })], NOW)
    expect(needsOperatorAlert(health)).toEqual([])
  })
})
