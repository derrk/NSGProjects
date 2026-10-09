import { describe, expect, it } from 'vitest'

import { checkIpRisk, ipRiskLevel, mayProduce, normaliseForIp, normaliseLeet } from './ip-risk'

/**
 * Written evasion-first, on purpose.
 *
 * The support grounding checks shipped broken because every test used the literal
 * phrasing its own regex had been written from. The question for a filter like this
 * is never "does it catch the canonical spelling" — it is "what does somebody write
 * without trying to evade anything, and does it still catch that".
 */

const BLOCKED = [
  { phrase: 'just do it', reason: 'Nike registered mark' },
  { phrase: 'i love new york', reason: 'New York State registered mark' },
  { phrase: 'super bowl', reason: 'NFL registered mark' },
  { phrase: 'olympic', reason: 'USOPC/IOC protected under the Ted Stevens Act' },
]

const check = (text: string) => checkIpRisk({ text, blocked: BLOCKED })
const rules = (text: string) => check(text).map((f) => f.rule)

describe('checkIpRisk — blocked phrases', () => {
  it('catches the canonical spelling', () => {
    expect(rules('Just do it, nurse edition')).toContain('ip.blocked-phrase')
  })

  const spellings = [
    'JUST DO IT',
    'Just Do It.',
    'just-do-it',
    'justdoit',
    'Just  Do  It',
    'J.u.s.t D.o I.t',
    'Just_Do_It',
    'ju5t d0 1t',
    'JU5T D0 17',
  ]

  for (const text of spellings) {
    it(`catches it written as: ${text}`, () => {
      expect(rules(`${text} — a mug`)).toContain('ip.blocked-phrase')
    })
  }

  it('catches a symbol standing in for a word', () => {
    // Nobody writing "I ♥ New York" is trying to evade a filter, and a filter that
    // misses it reports a clean result on the most famous mark in the list.
    expect(rules('I ♥ New York')).toContain('ip.blocked-phrase')
    expect(rules('I <3 New York')).toContain('ip.blocked-phrase')
  })

  it('catches an accented spelling', () => {
    expect(rules('Ólympic dreams')).toContain('ip.blocked-phrase')
  })

  it('catches a plural or suffixed form', () => {
    expect(rules('Olympics 2028 training')).toContain('ip.blocked-phrase')
    expect(rules('Super Bowls are long')).toContain('ip.blocked-phrase')
  })

  it('says which phrase matched and why', () => {
    const finding = check('Just do it').find((f) => f.rule === 'ip.blocked-phrase')!
    expect(finding.matched).toBe('just do it')
    expect(finding.message).toMatch(/Nike registered mark/)
  })

  it('reports every blocked phrase present, not just the first', () => {
    const found = check('Just do it at the Super Bowl').filter(
      (f) => f.rule === 'ip.blocked-phrase',
    )
    expect(found).toHaveLength(2)
  })

  it('blocks production outright', () => {
    expect(mayProduce({ text: 'Just do it', blocked: BLOCKED })).toBe(false)
    expect(mayProduce({ text: 'Powered by caffeine and chaos', blocked: BLOCKED })).toBe(true)
  })

  it('does not fire on ordinary text', () => {
    const innocent = [
      'Powered by caffeine and chaos',
      'My rescue rescued me',
      'Professional dog tired',
      'Home is where the fur sticks',
      'Walked. Fed. Still judged.',
    ]
    for (const text of innocent) expect(check(text)).toEqual([])
  })

  it('does not match a short phrase inside an unrelated word', () => {
    /*
     * Stripping spaces turns a short mark into a letter run that appears inside
     * ordinary words. A filter that cannot tell "olympic" from a substring is a
     * filter the operator learns to ignore.
     */
    const shortBlocked = [{ phrase: 'ace', reason: 'test mark' }]
    expect(checkIpRisk({ text: 'A peaceful place', blocked: shortBlocked })).toEqual([])
    expect(
      checkIpRisk({ text: 'Ace of spades', blocked: shortBlocked }).map((f) => f.rule),
    ).toContain('ip.blocked-phrase')
  })

  it('ignores an empty phrase in the list', () => {
    expect(checkIpRisk({ text: 'anything', blocked: [{ phrase: '   ' }] })).toEqual([])
  })

  it('returns nothing for empty text', () => {
    expect(checkIpRisk({ text: '', blocked: BLOCKED })).toEqual([])
    expect(checkIpRisk({ text: '   ', blocked: BLOCKED })).toEqual([])
  })
})

describe('checkIpRisk — the patterns a list cannot enumerate', () => {
  it('blocks a registered-trademark symbol', () => {
    expect(rules('Dog Mom™ mug')).toContain('ip.registered-symbol')
    expect(rules('Dog Mom® mug')).toContain('ip.registered-symbol')
  })

  it('blocks a claim of being official or licensed', () => {
    expect(rules('Officially licensed dog art')).toContain('ip.claims-official')
    expect(rules('Official merchandise for cat people')).toContain('ip.claims-official')
  })

  it('warns when a design names whose style it copies', () => {
    const found = check('A poster in the style of Banksy')
    expect(found.find((f) => f.rule === 'ip.style-of-artist')!.severity).toBe('warning')
  })

  it('warns on a long quoted line', () => {
    expect(rules('A mug reading "all the lonely people, where do they all belong"')).toContain(
      'ip.quoted-line',
    )
  })

  it('does not warn on a short quoted word', () => {
    expect(rules('A mug reading "woof"')).not.toContain('ip.quoted-line')
  })

  it('warns on a year beside a championship', () => {
    expect(rules('2026 Champions commemorative tee')).toContain('ip.team-and-year')
  })

  it('lets a warning through while a blocker does not', () => {
    // Warnings inform; only blockers stop production.
    expect(mayProduce({ text: 'in the style of Banksy', blocked: BLOCKED })).toBe(true)
    expect(mayProduce({ text: 'Dog Mom™', blocked: BLOCKED })).toBe(false)
  })
})

describe('ipRiskLevel', () => {
  it('derives the level from findings rather than from a model’s self-assessment', () => {
    expect(ipRiskLevel(check('Just do it'))).toBe('high')
    expect(ipRiskLevel(check('in the style of Banksy'))).toBe('medium')
    expect(ipRiskLevel(check('Professional dog tired'))).toBe('low')
  })
})

describe('normalisation', () => {
  it('strips everything that is not a letter or digit', () => {
    expect(normaliseForIp('J.U.S.T  Do—It!')).toBe('justdoit')
  })

  it('folds accents', () => {
    expect(normaliseForIp('Ólympïc')).toBe('olympic')
  })

  it('spells out symbols people use as words', () => {
    expect(normaliseForIp('I ♥ NY')).toBe('iloveny')
    expect(normaliseForIp('Cats & Dogs')).toBe('catsanddogs')
  })

  it('undoes letter substitutions only in the leet pass', () => {
    // The primary pass must leave digits alone, or an ordinary "5 dogs" becomes
    // "s dogs" and starts matching things it should not.
    expect(normaliseForIp('5 dogs')).toBe('5dogs')
    expect(normaliseLeet('ju5t d0 1t')).toBe('justdoit')
  })
})
