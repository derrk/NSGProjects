import { describe, expect, it } from 'vitest'

import { dueAgents, type ScheduledAgent } from './due'

const NOW = new Date('2026-10-09T12:00:00.000Z')

function minutesAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 60_000)
}

function agent(over: Partial<ScheduledAgent> = {}): ScheduledAgent {
  return {
    id: 'a1',
    divisionId: 'div_pod',
    name: 'Store ops',
    schedule: '0 * * * *',
    lastRunAt: minutesAgo(10),
    ...over,
  }
}

function dueIds(agents: ScheduledAgent[], options = {}) {
  return dueAgents(agents, NOW, options).map((d) => d.agent.id)
}

describe('dueAgents', () => {
  it('fires an hourly agent that last ran over an hour ago', () => {
    expect(dueIds([agent({ lastRunAt: minutesAgo(61) })])).toEqual(['a1'])
  })

  it('does not fire one that ran ten minutes ago', () => {
    expect(dueIds([agent({ lastRunAt: minutesAgo(10) })])).toEqual([])
  })

  it('fires an agent that has never run', () => {
    const [due] = dueAgents([agent({ lastRunAt: null })], NOW)
    expect(due!.reason).toBe('has never run')
  })

  it('allows a small tolerance so a 5-minute tick does not drift', () => {
    // Exactly on the hour minus a little: without tolerance an hourly agent slips
    // later every tick and fires 23 times a day instead of 24.
    expect(dueIds([agent({ lastRunAt: minutesAgo(59.5) })])).toEqual(['a1'])
  })

  it('does not fire well before the interval even with tolerance', () => {
    expect(dueIds([agent({ lastRunAt: minutesAgo(45) })])).toEqual([])
  })

  it('respects a per-call tolerance', () => {
    expect(dueIds([agent({ lastRunAt: minutesAgo(55) })], { toleranceMinutes: 10 })).toEqual(['a1'])
  })

  describe('schedules it will not act on', () => {
    it('never fires an event-driven agent', () => {
      // The Designer runs when a concept is approved, not on a clock.
      expect(dueIds([agent({ schedule: 'event:concept.approved', lastRunAt: null })])).toEqual([])
    })

    it('never fires an agent with no schedule', () => {
      expect(dueIds([agent({ schedule: null, lastRunAt: null })])).toEqual([])
    })

    it('skips a schedule it cannot read rather than guessing a cadence', () => {
      // Firing on a made-up cadence spends real money on a guess.
      expect(dueIds([agent({ schedule: 'every so often', lastRunAt: null })])).toEqual([])
    })
  })

  describe('things that hold an agent back', () => {
    it('skips an agent whose division is paused', () => {
      expect(
        dueIds([agent({ lastRunAt: null })], { pausedDivisionIds: ['div_pod'] }),
      ).toEqual([])
    })

    it('skips an agent that is already working', () => {
      // Queueing another would stack runs on an agent that is already behind.
      expect(dueIds([agent({ lastRunAt: minutesAgo(999) })], { busyAgentIds: ['a1'] })).toEqual([])
    })

    it('still fires other agents in a paused division’s company', () => {
      const other = agent({ id: 'a2', divisionId: 'div_cards', lastRunAt: null })
      expect(dueIds([agent({ lastRunAt: null }), other], { pausedDivisionIds: ['div_pod'] })).toEqual(
        ['a2'],
      )
    })
  })

  it('handles a mixed roster in one pass', () => {
    const agents = [
      agent({ id: 'hourly', schedule: '0 * * * *', lastRunAt: minutesAgo(90) }),
      agent({ id: 'daily', schedule: 'TZ=America/Chicago 0 6 * * *', lastRunAt: minutesAgo(60) }),
      agent({ id: 'every15', schedule: '*/15 * * * *', lastRunAt: minutesAgo(20) }),
      agent({ id: 'event', schedule: 'event:design.approved', lastRunAt: null }),
    ]

    expect(dueIds(agents).sort()).toEqual(['every15', 'hourly'])
  })

  it('explains why each agent fired', () => {
    const [due] = dueAgents([agent({ lastRunAt: minutesAgo(75) })], NOW)
    expect(due!.reason).toMatch(/75 minutes since the last run/)
  })
})
