import { describe, expect, it } from 'vitest'

import { scoreNiches, type NicheCandidate } from './niche-score'

const NOW = new Date('2026-10-09T12:00:00Z')

const BLOCKED = [{ phrase: 'super bowl', reason: 'NFL registered mark' }]

function evidence(over: Partial<{ claim: string; url: string; retrievedAt: string }> = {}) {
  return {
    claim: 'Custom pet portrait sees steady year-round demand',
    url: 'https://example.test/report',
    retrievedAt: '2026-10-01',
    ...over,
  }
}

function candidate(over: Partial<NicheCandidate> = {}): NicheCandidate {
  return {
    name: 'Pet owners who treat the pet as family',
    keywords: ['custom pet portrait', 'dog mom gift'],
    audience: 'Gift buyers for pet owners',
    whyNow: 'November gift window',
    evidence: [evidence(), evidence({ claim: 'Second sourced claim' })],
    demandSignal: 80,
    competition: 40,
    giftability: 90,
    ...over,
  }
}

const run = (c: NicheCandidate[], blocked = BLOCKED) =>
  scoreNiches({ candidates: c, blocked, now: NOW })

describe('scoreNiches — the gates', () => {
  it('accepts a well-evidenced candidate', () => {
    const { accepted, rejected } = run([candidate()])
    expect(rejected).toEqual([])
    expect(accepted).toHaveLength(1)
    expect(accepted[0]!.score).toBeGreaterThan(70)
  })

  it('rejects a candidate with too little evidence', () => {
    const { accepted, rejected } = run([candidate({ evidence: [evidence()] })])
    expect(accepted).toEqual([])
    expect(rejected[0]).toMatchObject({ reason: 'no-evidence' })
  })

  it('rejects a candidate with no evidence at all', () => {
    expect(run([candidate({ evidence: [] })]).rejected[0]!.reason).toBe('no-evidence')
  })

  const badUrls = [
    // What a model produces when asked for a citation it does not have.
    'industry reports',
    '',
    '   ',
    'example.test/report',
    'not a url',
    'https://',
    'http://nodot',
  ]

  for (const url of badUrls) {
    it(`rejects a claim sourced as: ${JSON.stringify(url)}`, () => {
      const { rejected } = run([
        candidate({ evidence: [evidence(), evidence({ url })] }),
      ])
      expect(rejected[0]).toMatchObject({ reason: 'unsourced-evidence' })
    })
  }

  it('rejects evidence older than the window', () => {
    const { rejected } = run([
      candidate({ evidence: [evidence(), evidence({ retrievedAt: '2025-01-01' })] }),
    ])
    expect(rejected[0]).toMatchObject({ reason: 'stale-evidence' })
  })

  it('treats an unparseable date as stale rather than as fresh', () => {
    // The safe direction. A date nobody can read is not evidence that it is recent.
    const { rejected } = run([
      candidate({ evidence: [evidence(), evidence({ retrievedAt: 'last spring' })] }),
    ])
    expect(rejected[0]).toMatchObject({ reason: 'stale-evidence' })
  })

  it('rejects an out-of-range score rather than clamping it', () => {
    expect(run([candidate({ demandSignal: 140 })]).rejected[0]!.reason).toBe('out-of-range')
    expect(run([candidate({ giftability: -5 })]).rejected[0]!.reason).toBe('out-of-range')
    expect(run([candidate({ competition: Number.NaN })]).rejected[0]!.reason).toBe('out-of-range')
  })

  it('blocks an infringing niche outright, however strong its demand', () => {
    /*
     * IP is a gate, not a factor. Weighting it would let a demand signal of 100 buy
     * its way past a registered mark, which is the trade nobody should be able to
     * make.
     */
    const { accepted, rejected } = run([
      candidate({
        name: 'Super Bowl party hosts',
        demandSignal: 100,
        giftability: 100,
        competition: 0,
      }),
    ])

    expect(accepted).toEqual([])
    expect(rejected[0]).toMatchObject({ reason: 'ip-blocked' })
    expect(rejected[0]!.ipFindings![0]!.matched).toBe('super bowl')
  })

  it('checks keywords for blocked phrases, not just the name', () => {
    const { rejected } = run([
      candidate({ name: 'Game day snacks', keywords: ['super bowl party', 'dip'] }),
    ])
    expect(rejected[0]!.reason).toBe('ip-blocked')
  })

  it('carries a non-blocking IP concern through instead of dropping it', () => {
    const { accepted } = run([
      candidate({ whyNow: 'A poster in the style of Banksy is trending' }),
    ])
    expect(accepted[0]!.ipRisk).toBe('medium')
    expect(accepted[0]!.ipWarnings.some((w) => w.rule === 'ip.style-of-artist')).toBe(true)
  })

  it('reports what it threw away, not only what survived', () => {
    // An operator who sees only survivors cannot tell a careful run from one that
    // found nothing and said so quietly.
    const { accepted, rejected } = run([
      candidate(),
      candidate({ name: 'Unsourced idea', evidence: [] }),
    ])

    expect(accepted).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]!.detail.length).toBeGreaterThan(10)
  })
})

describe('scoreNiches — the weighting', () => {
  it('ranks giftability above raw demand', () => {
    // This is a gift shop; the buyer is usually not the person it is for.
    const giftable = candidate({ name: 'giftable', giftability: 100, demandSignal: 40 })
    const popular = candidate({ name: 'popular', giftability: 40, demandSignal: 100 })

    const { accepted } = run([popular, giftable])
    expect(accepted[0]!.name).toBe('giftable')
  })

  it('turns competition into headroom, so a crowded niche scores low visibly', () => {
    const { accepted } = run([
      candidate({ name: 'crowded', competition: 95 }),
      candidate({ name: 'open', competition: 5 }),
    ])

    const crowded = accepted.find((a) => a.name === 'crowded')!
    const headroom = crowded.breakdown.find((b) => b.factor === 'Headroom')!
    expect(headroom.points).toBeLessThan(3)
    expect(headroom.note).toMatch(/95\/100 competition/)
    expect(accepted[0]!.name).toBe('open')
  })

  it('gives no timing points when no timing argument is offered', () => {
    const { accepted } = run([candidate({ whyNow: null })])
    const timing = accepted[0]!.breakdown.find((b) => b.factor === 'Timing')!
    expect(timing.points).toBe(0)
    expect(timing.note).toMatch(/no timing argument/)
  })

  it('names what it is least sure about, always', () => {
    const { accepted } = run([candidate({ whyNow: null })])
    expect(accepted[0]!.weakestLink).toMatch(/Timing/)
  })

  it('sorts accepted candidates strongest first', () => {
    const { accepted } = run([
      candidate({ name: 'weak', giftability: 10, demandSignal: 10, competition: 90 }),
      candidate({ name: 'strong' }),
    ])
    expect(accepted.map((a) => a.name)).toEqual(['strong', 'weak'])
  })

  it('reports the breakdown strongest factor first', () => {
    const { accepted } = run([candidate()])
    const points = accepted[0]!.breakdown.map((b) => b.points)
    expect([...points].sort((a, b) => b - a)).toEqual(points)
  })

  it('dedupes keywords and source urls', () => {
    const { accepted } = run([
      candidate({
        keywords: ['dog gift', 'dog gift', ' dog gift ', 'cat gift'],
        evidence: [evidence(), evidence({ claim: 'same source' })],
      }),
    ])

    expect(accepted[0]!.keywords).toEqual(['dog gift', 'cat gift'])
    expect(accepted[0]!.sourceUrls).toEqual(['https://example.test/report'])
  })

  it('returns nothing for no candidates', () => {
    expect(run([])).toEqual({ accepted: [], rejected: [] })
  })

  it('skips a nameless candidate without crashing', () => {
    expect(run([candidate({ name: '  ' })])).toEqual({ accepted: [], rejected: [] })
  })
})
