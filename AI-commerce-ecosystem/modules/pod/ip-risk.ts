/**
 * Checking a concept against the phrases that get a shop closed.
 *
 * The `blocked_phrases` table has existed since week one, the seed fills it with ten
 * registered marks, and until now nothing read it. The only thing standing between a
 * trademarked phrase and a printed mug was a model setting `ipRisk: 'high'` on its
 * own proposal — which is the same shape of mistake the support grounding checks
 * were: a rule stated in a prompt and enforced nowhere.
 *
 * MATCHING, WITH THE LESSON FROM grounding.ts APPLIED
 * A tight regex written from one spelling catches that spelling and nothing else.
 * Somebody writing merch copy will produce "Just Do It.", "JUST-DO-IT", "justdoit",
 * "Just  Do  It" and "J.u.s.t D.o I.t" without any intent to evade, and a filter that
 * sees only the first is worse than no filter because it reports a clean result.
 *
 * So every comparison happens on text with ALL non-alphanumerics removed, accents
 * folded, and a second pass with common character substitutions undone. A phrase
 * matches if it appears in any of those forms.
 *
 * This is deliberately over-broad. A false positive costs the operator a glance at a
 * concept; a false negative costs a takedown, a suspended shop, and in the worst case
 * a letter from someone's lawyers. The asymmetry is not close.
 *
 * It is NOT legal advice and NOT a complete list. It is a floor.
 */

export interface BlockedPhrase {
  phrase: string
  reason?: string | null
}

export type IpSeverity = 'blocking' | 'warning'

export interface IpFinding {
  rule: string
  severity: IpSeverity
  message: string
  /** The blocked phrase or pattern that matched, for the operator to judge. */
  matched: string
}

/** Short phrases match only on a word boundary; long ones match anywhere. */
const SHORT_PHRASE_CHARS = 8

/**
 * Character substitutions that read as the letter they replace.
 *
 * Undone before the second comparison pass, so "JU5T D0 1T" folds to the same string
 * as "just do it". Applied only in that extra pass, never to the primary comparison,
 * so an ordinary phrase containing digits is not mangled into a false match.
 */
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  $: 's',
  '@': 'a',
}

/** Symbols people write instead of a word. */
const SYMBOL_WORDS: Array<[RegExp, string]> = [
  [/[♥❤\u{1F499}-\u{1F49F}]/gu, 'love'],
  [/<3/g, 'love'],
  [/&/g, 'and'],
  [/\+/g, 'and'],
]

function foldAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Lowercase, accents folded, symbols spelled out, everything else stripped. */
export function normaliseForIp(text: string): string {
  let out = foldAccents(text.toLowerCase())
  for (const [pattern, word] of SYMBOL_WORDS) out = out.replace(pattern, word)
  return out.replace(/[^a-z0-9]/g, '')
}

/** The same, with digit-and-symbol letter substitutions undone. */
export function normaliseLeet(text: string): string {
  const base = normaliseForIp(text)
  return base.replace(/[0134578$@]/g, (c) => LEET[c] ?? c)
}

/**
 * Patterns a list of phrases cannot enumerate.
 *
 * Each one marks a shape of claim rather than a particular mark: a design that says
 * it is official, that names whose style it copies, or that carries a symbol
 * asserting somebody else's registration.
 */
const STRUCTURAL: Array<{ rule: string; severity: IpSeverity; pattern: RegExp; message: string }> = [
  {
    rule: 'ip.registered-symbol',
    severity: 'blocking',
    pattern: /[™®©]/u,
    message:
      'This carries a ™, ® or © symbol, which asserts somebody else’s registration on ' +
      'our own product.',
  },
  {
    rule: 'ip.claims-official',
    severity: 'blocking',
    pattern: /\b(officially[ -]?licen[cs]ed|official(ly)? (merch|merchandise|product)|licen[cs]ed by|authorised reseller|authorized reseller|genuine article)\b/i,
    message: 'This claims to be official or licensed. We license nothing.',
  },
  {
    rule: 'ip.style-of-artist',
    severity: 'warning',
    pattern: /\b(in the style of|inspired by|tribute to|homage to|after the manner of)\s+[A-Z][\w'’-]+/,
    message:
      'This names whose style it copies. Copying a living artist’s style is a dispute ' +
      'waiting to happen even when it is not infringement.',
  },
  {
    rule: 'ip.quoted-line',
    severity: 'warning',
    pattern: /["“][^"”]{15,}["”]/u,
    message:
      'This contains a long quoted line. Song lyrics and film dialogue are the most ' +
      'commonly infringed text on print-on-demand.',
  },
  {
    rule: 'ip.team-and-year',
    severity: 'warning',
    pattern: /\b(19|20)\d{2}\b[^.]{0,40}\b(champion\w*|finals?|playoffs?|world series|super ?bowl|cup winners?)\b/i,
    message:
      'A year beside a championship reads as a specific sporting event, which is ' +
      'licensed territory.',
  },
]

export interface IpCheckInput {
  /** Everything the buyer would see: title, phrase, description, tags. */
  text: string
  blocked: readonly BlockedPhrase[]
}

/**
 * Check a concept.
 *
 * Returns every finding rather than the first, so one pass tells the operator
 * everything that is wrong instead of revealing it one fix at a time.
 */
export function checkIpRisk(input: IpCheckInput): IpFinding[] {
  const findings: IpFinding[] = []
  const text = input.text ?? ''
  if (!text.trim()) return findings

  const normalised = normaliseForIp(text)
  const leetFolded = normaliseLeet(text)

  for (const entry of input.blocked) {
    const phrase = (entry.phrase ?? '').trim()
    if (!phrase) continue

    const needle = normaliseForIp(phrase)
    if (!needle) continue
    const needleLeet = normaliseLeet(phrase)

    const hit = normalised.includes(needle) || leetFolded.includes(needleLeet)
    if (!hit) continue

    /*
     * A short phrase stripped of spaces turns into a common letter run — "olympic"
     * is fine, but a three-letter mark would match inside half the dictionary. For
     * those, require the words to appear as words in the original text too.
     */
    if (needle.length < SHORT_PHRASE_CHARS) {
      const loose = phrase
        .trim()
        .split(/\s+/)
        .map((w) => foldAccents(w.toLowerCase()).replace(/[^a-z0-9]/g, ''))
        .filter(Boolean)
        .join('[^a-z0-9]*')
      if (!new RegExp(`\\b${loose}`, 'i').test(foldAccents(text.toLowerCase()))) continue
    }

    findings.push({
      rule: 'ip.blocked-phrase',
      severity: 'blocking',
      matched: phrase,
      message: entry.reason
        ? `"${phrase}" is blocked: ${entry.reason}.`
        : `"${phrase}" is on the blocked-phrase list.`,
    })
  }

  for (const check of STRUCTURAL) {
    const match = check.pattern.exec(text)
    if (!match) continue
    findings.push({
      rule: check.rule,
      severity: check.severity,
      matched: match[0].slice(0, 80),
      message: check.message,
    })
  }

  return findings
}

/** True when nothing blocking stands in the way of producing this concept. */
export function mayProduce(input: IpCheckInput): boolean {
  return !checkIpRisk(input).some((f) => f.severity === 'blocking')
}

/**
 * The risk level to record on the concept row.
 *
 * Derived from the findings rather than taken from the model, because a model asked
 * to rate its own proposal's IP risk has an obvious incentive and no lawyer.
 */
export function ipRiskLevel(findings: readonly IpFinding[]): 'low' | 'medium' | 'high' {
  if (findings.some((f) => f.severity === 'blocking')) return 'high'
  if (findings.length > 0) return 'medium'
  return 'low'
}
