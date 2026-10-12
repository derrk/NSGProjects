import { describe, expect, it } from 'vitest'

import { describeIdeaOutcome } from './idea-outcome'

describe('describeIdeaOutcome', () => {
  it('says it is waiting only when something is waiting', () => {
    const { message, filed } = describeIdeaOutcome('Trend scout', {
      approvalId: '11111111-1111-1111-1111-111111111111',
    })
    expect(filed).toBe(true)
    expect(message).toMatch(/waiting in Quarantine/)
  })

  it('does not send the operator to an empty inbox', () => {
    /*
     * The bug. The desk printed "It is waiting in Quarantine" on every successful
     * run, so a scout that correctly refused to invent a market because no search
     * provider was configured reported its findings as waiting. The operator opens
     * Quarantine, finds nothing, and cannot tell a refusal from a broken agent.
     */
    const { message, filed } = describeIdeaOutcome('Trend scout', {
      status: 'no_candidates',
      approvalId: null,
      rejected: [{ name: '(none)', reason: 'web search is not configured; every result was simulated' }],
    })
    expect(filed).toBe(false)
    expect(message).not.toMatch(/waiting/)
    expect(message).toMatch(/web search is not configured/)
  })

  it('leads with the reason, because the reason is the finding', () => {
    const { message } = describeIdeaOutcome('Trend scout', {
      rejected: [
        { name: 'Pokemon collectors', reason: 'ip-blocked: matches a registered mark' },
        { name: 'Other', reason: 'stale-evidence' },
      ],
    })
    expect(message).toContain('ip-blocked')
  })

  it('skips a rejection entry with no usable reason rather than printing a blank', () => {
    const { message } = describeIdeaOutcome('Trend scout', {
      rejected: [{ name: 'x', reason: '   ' }, { name: 'y', reason: 'every retrieval failed' }],
    })
    expect(message).toContain('every retrieval failed')
  })

  it('never prints [object Object] at the operator', () => {
    // The output arrives through a jsonb column; an agent returning a different
    // shape is a bug to survive, not a reason to interpolate an object.
    for (const output of [
      { rejected: ['just a string'] },
      { rejected: [{ name: 'x' }] },
      { rejected: 'not an array' },
      { approvalId: 42 },
      {},
      null,
      undefined,
      'a string',
    ]) {
      const { message, filed } = describeIdeaOutcome('Trend scout', output)
      expect(message).not.toMatch(/object Object|undefined|null/)
      expect(filed).toBe(false)
    }
  })

  it('treats an empty approvalId as nothing filed', () => {
    expect(describeIdeaOutcome('Trend scout', { approvalId: '  ' }).filed).toBe(false)
  })
})
