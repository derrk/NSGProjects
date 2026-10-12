/**
 * Trend scout (SPEC.md §Module 1 → research).
 *
 * An idea in — or nothing at all — and a scored, sourced set of niches in the
 * operator's inbox as a `niche` approval, with a `niches` row per candidate at
 * status `proposed`.
 *
 * This is the agent that answers "is this niche worth selling into, and what would
 * sell best inside it". It answers it the same way the Supply scout answers its
 * question: by reading pages and refusing to say anything the pages do not.
 *
 * Three things here are load-bearing and easy to lose in a refactor:
 *
 *   The research is BOUNDED, by the shared budget in ../../retrieval. An agent that
 *   decides for itself when it has read enough becomes the most expensive thing in
 *   the system, and it does it quietly, one extra page at a time.
 *
 *   Retrieved pages are UNTRUSTED. They reach the model inside a fence, labelled as
 *   data. A page that tries to direct the scout is logged and carried into the
 *   approval payload rather than acted on.
 *
 *   A run with NO SEED still researches something specific. The angle comes from a
 *   fixed rotation in code, not from asking the model what it feels like looking
 *   into — which produces the same answer every day, confidently.
 */

import type { AgentContext, AgentDefinition } from '@acf/core/runtime'
import { MODELS, type ModelClient } from '@acf/integrations/anthropic'
import { eq } from 'drizzle-orm'

import {
  containsQuote,
  fenceUntrusted,
  isFetchableUrl,
  MAX_DOCUMENTS,
  MAX_PAGE_CHARS,
  MIN_QUOTE_CHARS,
  retrievalDay,
  UNTRUSTED_CONTENT_NOTICE,
  budgetForAttempt,
  type RetrievedDoc,
} from '../../retrieval'
import { blockedPhrases, niches } from '../../schema/index'
import { scoreNiches, type Evidence, type NicheCandidate, type ScoredNiche } from './niche-score'
import {
  fetchToolOutputSchema,
  MAX_AUDIENCE_CHARS,
  MAX_EVIDENCE_PER_NICHE,
  MAX_KEYWORD_CHARS,
  MAX_KEYWORDS,
  MAX_NICHE_CANDIDATES,
  MAX_NICHE_NAME_CHARS,
  MAX_PRODUCT_IDEAS,
  nicheExtractionSchema,
  scoutInputSchema,
  scoutOutputSchema,
  searchToolOutputSchema,
  seedFrom,
  type ExtractedNiche,
  type ScoutInput,
  type ScoutOutput,
} from './schema'

/** Minimal structural view of the drizzle client, so this file does not import @acf/db. */
type Db = Record<string, unknown>

export interface ScoutDeps {
  db: Db
  model: ModelClient
  /** Injected so retrieval dates and row timestamps are deterministic under test. */
  now?: () => Date
}

/* ------------------------------------------------------------------ *
 * Choosing what to look at when nobody said
 * ------------------------------------------------------------------ */

/**
 * The rotation a self-directed run picks from.
 *
 * Fixed, in code, and deliberately not a model decision. "Research whatever seems
 * promising" is answered from whatever is most available to a model, which is the
 * same handful of subjects every single day — so a scheduler pointed at it produces
 * one idea and then re-finds it forever.
 *
 * Each of these is an ANGLE rather than a niche: it tells the search where to look
 * without deciding what it will find. Rotated by day so a daily schedule walks the
 * whole list instead of standing on one entry.
 */
export const SELF_DIRECTED_ANGLES: readonly string[] = [
  'gift niches for pet owners that are growing on Etsy right now',
  'occupations and hobbies whose in-jokes sell well on printed mugs',
  'upcoming seasonal events in the next ninety days that drive personalised gift buying',
  'underserved pet breeds and species with devoted owner communities',
  'milestone and life-event gifts people buy for someone else',
  'niche hobbies whose communities have their own vocabulary',
  'pet memorial and senior-pet gifts, and what sells in that space',
  'workplace and team gifts bought by one person for a group',
]

/**
 * Which angle today gets.
 *
 * Keyed off the calendar day rather than a counter, so two runs on the same day
 * research the same thing — a retried task should not quietly spend a second budget
 * on an unrelated subject, and a reader comparing two runs should be able to tell
 * which was the retry.
 */
export function angleForDay(now: Date): string {
  const day = Math.floor(now.getTime() / 86_400_000)
  return SELF_DIRECTED_ANGLES[day % SELF_DIRECTED_ANGLES.length]!
}

/**
 * The queries, derived from the seed rather than chosen by the model.
 *
 * Three, because the three things that decide a niche are whether anyone is buying,
 * who is already selling, and whether now is the moment. A model-chosen query list is
 * a research loop with no ceiling: every answer suggests the next question.
 */
export function searchQueries(seed: string, avoid: readonly string[] = []): string[] {
  const subject = seed.trim().slice(0, 120)
  const queries = [
    `${subject} best selling gift ideas Etsy`,
    `${subject} how many listings competition market size`,
    `${subject} trend 2026 seasonal demand`,
  ]
  // What is already on the board goes into ONE query as a negative, not into all
  // three: a long exclusion list on every query narrows the search to nothing and the
  // run comes back empty looking like the niche was barren.
  if (avoid.length > 0) {
    queries[0] = `${queries[0]} -"${avoid.slice(0, 3).join('" -"')}"`
  }
  return queries
}

/* ------------------------------------------------------------------ *
 * The vet
 * ------------------------------------------------------------------ */

/** One claim, the document it came from, and when that document was read. */
export interface NicheCitation {
  claim: string
  url: string
  retrievedAt: string
  /** The sentence the claim was read from, verified to be in that document. */
  quote: string
  /** `snippet` means we only had the search blurb, not the page. */
  depth: 'page' | 'snippet'
}

export interface VetNichesOptions {
  /** Every url we actually retrieved, mapped to the UTC days we retrieved it on. */
  retrieved: ReadonlyMap<string, ReadonlySet<string>>
  /** What each retrieved url actually said. */
  documents: ReadonlyMap<string, string>
  /** Which urls we only reached as a search blurb. */
  snippetOnly?: ReadonlySet<string>
}

export interface VetNichesResult {
  /** Shaped for `scoreNiches`, which does the IP gate and the weighting. */
  usable: NicheCandidate[]
  rejected: Array<{ name: string; reason: string }>
  /** Per niche name: which document said what. The papertrail, kept. */
  citations: Record<string, NicheCitation[]>
  /** Product rankings, carried through to the approval card. */
  productIdeas: Record<string, ExtractedNiche['productIdeas']>
  /** Per niche name: what the scout said it is least sure about. */
  weakestLink: Record<string, string>
  /** Seasons, which `scoreNiches` has no field for but the `niches` row does. */
  season: Record<string, string | null>
}

/**
 * Words a timing argument can actually be checked on.
 *
 * A `whyNow` containing none of these and no number is a sentence, not an argument —
 * there is nothing in it a document could confirm.
 */
const TIMING_WORDS = [
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'spring', 'summer', 'autumn', 'fall', 'winter',
  'christmas', 'halloween', 'thanksgiving', 'easter', 'hanukkah', 'diwali',
  'valentine', 'mother', 'father', 'graduation', 'back-to-school', 'black friday',
  'holiday', 'season', 'quarter', 'anniversary',
] as const

/**
 * Whether a timing claim rests on anything the documents said.
 *
 * `scoreNiches` awards a flat ten points for any non-empty `whyNow`, which means a
 * model that always writes one always collects them — the timing factor becomes a
 * participation award, and it is ten percent of the score the operator reads.
 *
 * So the check happens here, where the documents are still in hand: a timing
 * argument has to name something checkable (a number or a season), and that thing has
 * to appear in a quote that survived the citation check. Anything else is nulled out
 * and scores zero, which is the honest answer rather than a free ten.
 */
export function whyNowIsGrounded(whyNow: string, quotes: readonly string[]): boolean {
  const flat = whyNow.toLowerCase()
  const haystack = quotes.join(' \n ').toLowerCase()
  if (!haystack.trim()) return false

  const numbers = flat.match(/\d+/g) ?? []
  const words = TIMING_WORDS.filter((w) => flat.includes(w))
  if (numbers.length === 0 && words.length === 0) return false

  return (
    numbers.some((n) => new RegExp(`(?<![\\d.])${n}(?![\\d])`).test(haystack)) ||
    words.some((w) => haystack.includes(w))
  )
}

function trimTo(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/**
 * Check what structured outputs could not enforce.
 *
 * The model is only HINTED at "cite every claim", "at least two", "copy the quote
 * verbatim", because the SDK drops nothing-but-types from the schema. Everything that
 * decides whether a niche is real is decided here.
 *
 * A candidate is discarded rather than patched, for the same reason the Supply scout
 * discards one: patching is how an unsourced demand signal becomes a sourced-looking
 * one, and the score that comes out is identical either way.
 */
export function vetNiches(
  extracted: readonly ExtractedNiche[],
  opts: VetNichesOptions,
): VetNichesResult {
  const usable: NicheCandidate[] = []
  const rejected: Array<{ name: string; reason: string }> = []
  const citations: Record<string, NicheCitation[]> = {}
  const productIdeas: Record<string, ExtractedNiche['productIdeas']> = {}
  const weakestLink: Record<string, string> = {}
  const season: Record<string, string | null> = {}
  const seen = new Set<string>()

  for (const raw of extracted.slice(0, MAX_NICHE_CANDIDATES)) {
    const name = trimTo(raw?.name, MAX_NICHE_NAME_CHARS)
    const label = name || '(unnamed)'

    const reject = (reason: string) => rejected.push({ name: label, reason })

    if (!name) {
      reject('no name')
      continue
    }
    if (isFetchableUrl(name)) {
      // A url as a name means the model copied a page header instead of describing a
      // market. It also collides with nothing and so would survive dedup forever.
      reject('the name is a url, not a niche')
      continue
    }
    const key = name.toLowerCase()
    if (seen.has(key)) {
      reject('duplicate of an earlier candidate in the same run')
      continue
    }

    const audience = trimTo(raw?.audience, MAX_AUDIENCE_CHARS)
    if (!audience) {
      // Not cosmetic: the Designer reads `audience` to decide who the joke is for,
      // and an empty one produces a design aimed at nobody.
      reject('no audience; a niche without a buyer is a subject, not a market')
      continue
    }

    /* ---------------- the citation check ---------------- */

    const kept: NicheCitation[] = []
    let citationProblem: string | null = null

    for (const entry of (raw?.evidence ?? []).slice(0, MAX_EVIDENCE_PER_NICHE)) {
      const url = typeof entry?.url === 'string' ? entry.url.trim() : ''
      const claim = trimTo(entry?.claim, 200)
      const quote = typeof entry?.quote === 'string' ? entry.quote.trim() : ''
      const at = typeof entry?.retrievedAt === 'string' ? entry.retrievedAt.trim() : ''

      if (!claim) {
        citationProblem = 'an evidence entry has no claim'
        break
      }

      const days = opts.retrieved.get(url)
      if (!days) {
        // A url we were never at. Either the model invented it or it read it off the
        // body of a page, and neither is a document this run retrieved.
        citationProblem = `cites ${url || '(no url)'}, which this run never retrieved`
        break
      }

      const day = retrievalDay(at)
      if (day === null || !days.has(day)) {
        // A real url carrying an invented date is a papertrail that looks complete and
        // leads nowhere: follow it a year later and the page says something else.
        citationProblem = `cites ${url} on ${at || '(no date)'}, which is not a day this run read it`
        break
      }

      if (quote.length < MIN_QUOTE_CHARS) {
        citationProblem = `the quote for "${claim.slice(0, 40)}" is too short to be evidence`
        break
      }

      const document = opts.documents.get(url) ?? ''
      if (!containsQuote(document, quote)) {
        /*
         * The check the Supply scout was missing for a week.
         *
         * Without it the citation establishes only that the cited page was fetched on
         * the cited day — never that the page says the thing. A model that has
         * retrieved one real page can then attach it to every claim it wants to make,
         * and every mechanical check passes.
         */
        citationProblem = `the quote for "${claim.slice(0, 40)}" is not in ${url}`
        break
      }

      kept.push({
        claim,
        url,
        retrievedAt: at,
        quote: quote.slice(0, 200),
        depth: opts.snippetOnly?.has(url) ? 'snippet' : 'page',
      })
    }

    if (citationProblem) {
      reject(citationProblem)
      continue
    }

    /* ---------------- timing, grounded or dropped ---------------- */

    const claimedWhyNow = trimTo(raw?.whyNow, 200)
    const grounded =
      claimedWhyNow !== '' && whyNowIsGrounded(claimedWhyNow, kept.map((c) => c.quote))
    if (claimedWhyNow !== '' && !grounded) {
      // Not a rejection. The niche may still be good; its timing argument is just not
      // evidence, so it scores zero on timing and the operator is told why.
      rejected.push({
        name: label,
        reason:
          `timing argument dropped (scored 0): "${claimedWhyNow.slice(0, 60)}" names nothing ` +
          'any quoted source confirms',
      })
    }

    seen.add(key)
    citations[name] = kept
    productIdeas[name] = (raw?.productIdeas ?? []).slice(0, MAX_PRODUCT_IDEAS)
    weakestLink[name] = trimTo(raw?.weakestLink, 200) || 'the scout did not say'
    season[name] = trimTo(raw?.season, 60) || null

    const evidence: Evidence[] = kept.map((c) => ({
      claim: c.claim,
      url: c.url,
      retrievedAt: c.retrievedAt,
    }))

    usable.push({
      name,
      keywords: [
        ...new Set(
          (raw?.keywords ?? [])
            .map((k) => trimTo(k, MAX_KEYWORD_CHARS))
            .filter(Boolean)
            .slice(0, MAX_KEYWORDS),
        ),
      ],
      audience,
      whyNow: grounded ? claimedWhyNow : null,
      evidence,
      demandSignal: raw?.demandSignal as number,
      competition: raw?.competition as number,
      giftability: raw?.giftability as number,
    })
  }

  return { usable, rejected, citations, productIdeas, weakestLink, season }
}

/* ------------------------------------------------------------------ *
 * The prompt for the extraction pass
 * ------------------------------------------------------------------ */

function extractionInstructions(seed: string, avoid: readonly string[], feedback: string[]): string {
  return [
    `What to assess: ${seed}`,
    '',
    'Read the fenced documents below and propose niches they actually support. Every ' +
      'claim needs an entry in `evidence` naming the url, that document’s retrieval ' +
      'date, and a VERBATIM quote from it containing the fact. The quote is checked ' +
      'against the document text, so a paraphrase discards the claim.',
    'A niche the documents do not support is not a niche. Returning zero candidates is ' +
      'a correct answer and a much better one than a plausible list.',
    avoid.length > 0
      ? `Already on the board, do not propose again: ${avoid.slice(0, 20).join('; ')}.`
      : '',
    feedback.length > 0
      ? `Your previous answer was rejected: ${feedback.join(' | ')}. Fix exactly those and keep everything that was fine.`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/* ------------------------------------------------------------------ *
 * The agent
 * ------------------------------------------------------------------ */

export function createScoutAgent(deps: ScoutDeps): AgentDefinition<ScoutInput, ScoutOutput> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural db type
  const db = deps.db as any
  const now = deps.now ?? (() => new Date())

  return {
    key: 'scout',
    outputSchema: scoutOutputSchema,

    async run(ctx: AgentContext<ScoutInput>): Promise<ScoutOutput> {
      const divisionId = ctx.division.id
      const at = now()

      /* ---------------- what are we looking at ---------------- */

      /*
       * Parsed rather than read field by field.
       *
       * `ctx.input` is a jsonb column, so a task written by anything other than the
       * Idea Box can put a number where a string goes, and `(5).trim()` throws inside
       * the seed builder — a run that dies before it has logged why. A shape this
       * agent cannot read becomes a self-directed run with a warning, which is the
       * same thing an empty input means.
       */
      const parsedInput = scoutInputSchema.safeParse(ctx.input)
      if (!parsedInput.success) {
        await ctx.log(
          'pod.scout_input_unreadable',
          'the task input is not a shape this agent can read; treating it as an unprompted run',
          { level: 'warn' },
        )
      }
      const input: ScoutInput = parsedInput.success ? parsedInput.data : {}

      const given = seedFrom(input)
      const selfDirected = given === ''
      const seed = selfDirected ? input.angle?.trim() || angleForDay(at) : given

      /*
       * What is already on the board.
       *
       * Read for every run, not only self-directed ones. An operator who types an idea
       * the shop already has a niche for should be told that, rather than getting a
       * second row for the same market and a second approval card to clear.
       */
      const existingRows: Array<Record<string, unknown>> = await db
        .select()
        .from(niches)
        .where(eq(niches.divisionId, divisionId))
      const existingByName = new Map(
        existingRows.map((r) => [String(r['name']).trim().toLowerCase(), r]),
      )
      const avoid = [
        ...new Set([
          ...(input.avoid ?? []).map((a) => a.trim()).filter(Boolean),
          ...existingRows.map((r) => String(r['name']).trim()).filter(Boolean),
        ]),
      ]

      if (selfDirected) {
        await ctx.log(
          'pod.scout_self_directed',
          `nobody set a subject, so this run took the rotation's angle for today: "${seed}"`,
        )
      }

      /* ---------------- bounded search ---------------- */

      const budget = budgetForAttempt(ctx.attempt)
      if (ctx.attempt > 1) {
        await ctx.log(
          'pod.scout_retry_budget',
          `attempt ${ctx.attempt}: narrowed to ${budget.searches} search(es) and ${budget.pages} ` +
            'page(s), because the retrieval from the previous attempt was already paid for ' +
            'and cannot be reused',
          { level: 'warn' },
        )
      }

      const queries = searchQueries(seed, avoid).slice(0, budget.searches)
      const hits = new Map<string, { title: string; snippet: string }>()
      let searchesUsed = 0
      let liveResults = 0
      let simulatedResults = 0
      let pagesFetched = 0
      let pagesAttempted = 0

      for (const query of queries) {
        const outcome = await ctx.callTool('web_search', { query, maxResults: 5 })
        searchesUsed++

        if (!outcome.ok) {
          await ctx.log('pod.scout_search_failed', `"${query}": ${outcome.error}`, { level: 'warn' })
          continue
        }

        const parsed = searchToolOutputSchema.safeParse(outcome.output)
        if (!parsed.success) {
          await ctx.log(
            'pod.scout_search_unreadable',
            `web_search returned a shape this agent cannot read for "${query}"`,
            { level: 'warn' },
          )
          continue
        }

        for (const result of parsed.data.results ?? []) {
          if (result.provenance === 'simulated') {
            /*
             * A simulated result is not evidence, and a mixed set is the dangerous
             * shape: one live hit flips `evidence` to 'retrieved', and from there an
             * invented url and its invented snippet are citable like anything else.
             * Counted for the verdict below, never carried into what the model reads.
             */
            simulatedResults++
            continue
          }
          liveResults++
          const url = (result.url ?? '').trim()
          if (!isFetchableUrl(url)) continue
          if (hits.size >= MAX_DOCUMENTS) continue
          if (!hits.has(url)) {
            hits.set(url, { title: result.title ?? '', snippet: result.snippet ?? '' })
          }
        }
      }

      const evidence: ScoutOutput['evidence'] =
        liveResults > 0 ? 'retrieved' : simulatedResults > 0 ? 'simulated' : 'none'

      const nothingFound = (
        reason: string,
        rejected: Array<{ name: string; reason: string }> = [],
        injectionAttempts = 0,
      ): ScoutOutput => ({
        seed,
        selfDirected,
        status: 'no_candidates',
        approvalId: null,
        nicheIds: [],
        accepted: [],
        rejected: rejected.length > 0 ? rejected : [{ name: '(none)', reason }],
        searchesUsed,
        pagesFetched,
        pagesAttempted,
        evidence,
        injectionAttempts,
      })

      if (evidence === 'none') {
        await ctx.log('pod.scout_no_results', `no search result for "${seed}"`, { level: 'error' })
        return nothingFound('search returned nothing for this subject')
      }

      if (evidence === 'simulated') {
        /*
         * The offline search adapter returns results that say so in their own payload.
         * Extracting them into niche rows would produce invented markets holding real
         * row ids and real scores, and from that point nothing downstream — not the
         * Designer, not the operator, not this agent on its next run — can tell the
         * difference between a market and a sentence.
         */
        await ctx.log(
          'pod.scout_search_simulated',
          'no search provider is configured, so nothing retrieved in this run is evidence; no niche was recorded',
          { level: 'error' },
        )
        return nothingFound('web search is not configured; every result was simulated')
      }

      if (simulatedResults > 0) {
        await ctx.log(
          'pod.scout_simulated_results_dropped',
          `${simulatedResults} search result(s) were simulated and were not read; only live results were retrieved`,
          { level: 'warn' },
        )
      }

      /* ---------------- bounded retrieval ---------------- */

      const retrievedAtDefault = at.toISOString()
      const docs: RetrievedDoc[] = []

      for (const [url, hit] of hits) {
        if (pagesAttempted >= budget.pages) {
          // Past the budget the search snippet still counts as something we retrieved,
          // so it can be cited — it just does not cost a page fetch.
          docs.push({
            url,
            retrievedAt: retrievedAtDefault,
            depth: 'snippet',
            content: `${hit.title}\n${hit.snippet}`,
          })
          continue
        }

        pagesAttempted++
        const outcome = await ctx.callTool('fetch_page', { url, maxChars: MAX_PAGE_CHARS })
        if (!outcome.ok) {
          await ctx.log('pod.scout_fetch_failed', `${url}: ${outcome.error}`, { level: 'warn' })
          docs.push({
            url,
            retrievedAt: retrievedAtDefault,
            depth: 'snippet',
            content: `${hit.title}\n${hit.snippet}`,
          })
          continue
        }

        const parsed = fetchToolOutputSchema.safeParse(outcome.output)
        if (!parsed.success) {
          await ctx.log(
            'pod.scout_fetch_unreadable',
            `fetch_page returned a shape this agent cannot read for ${url}`,
            { level: 'warn' },
          )
          continue
        }

        pagesFetched++
        docs.push({
          url: parsed.data.url,
          // A date the tool gave that nothing can parse is worse than no date: it goes
          // into the fence, the model copies it faithfully, and the citation check then
          // throws out a candidate for the tool's spelling. Fall back to when we asked.
          retrievedAt:
            parsed.data.retrievedAt !== undefined && retrievalDay(parsed.data.retrievedAt) !== null
              ? parsed.data.retrievedAt
              : retrievedAtDefault,
          depth: 'page',
          content: parsed.data.content,
        })
      }

      const retrieved = new Map<string, Set<string>>()
      const documents = new Map<string, string>()
      const snippetOnly = new Set<string>()
      const fetchedPages = new Set<string>()
      for (const doc of docs) {
        const day = retrievalDay(doc.retrievedAt)
        if (day === null) continue
        const days = retrieved.get(doc.url) ?? new Set<string>()
        days.add(day)
        retrieved.set(doc.url, days)
        // Several docs can share a url (a snippet and then the page); keep both, so a
        // quote from either is checkable.
        documents.set(doc.url, `${documents.get(doc.url) ?? ''}\n${doc.content}`)
        if (doc.depth === 'page') fetchedPages.add(doc.url)
      }
      // Computed after the loop rather than inside it: a url can appear as a snippet
      // and then as a page, and a flag set mid-loop depends on which order they arrived.
      for (const url of retrieved.keys()) {
        if (!fetchedPages.has(url)) snippetOnly.add(url)
      }

      if (retrieved.size === 0) {
        await ctx.log('pod.scout_no_documents', `nothing could be retrieved for "${seed}"`, {
          level: 'error',
        })
        return nothingFound('every retrieval failed')
      }

      /* ---------------- one extraction pass, plus one correction ---------------- */

      const system =
        ctx.agent.systemPrompt ||
        'You are a trend scout. You report what the documents establish, and nothing else.'

      let usable: NicheCandidate[] = []
      let citations: Record<string, NicheCitation[]> = {}
      let productIdeas: Record<string, ExtractedNiche['productIdeas']> = {}
      let weakestLink: Record<string, string> = {}
      let seasons: Record<string, string | null> = {}
      let feedback: string[] = []
      const askedQuestions = new Set<string>()
      /*
       * Gaps accumulate across both passes instead of the second overwriting the first.
       * The ordinary way a model answers "this candidate had an uncheckable quote" is
       * to drop the candidate, and a straight replace then reports no gaps at all —
       * the operator reads a tidy list and never learns something was thrown away,
       * which is the one thing a gap exists to tell them.
       */
      const gapsByName = new Map<string, string>()
      /*
       * Keyed by url, not counted. The correction pass re-reads the same documents and
       * paraphrases the same planted text slightly differently, and a plain counter
       * turns one hostile page into "2 pages tried to instruct it" on the approval
       * card — a number nobody can act on because it is not true.
       */
      const injections = new Set<string>()

      for (let pass = 1; pass <= 2; pass++) {
        const result = await deps.model.structured({
          model: MODELS.routine,
          system,
          parts: [
            { kind: 'text', text: extractionInstructions(seed, avoid, feedback) },
            { kind: 'text', text: UNTRUSTED_CONTENT_NOTICE },
            { kind: 'text', text: docs.map(fenceUntrusted).join('\n\n') },
          ],
          schema: nicheExtractionSchema,
        })
        ctx.recordUsage(result.usage)

        for (const attempt of result.output.promptInjectionAttempts ?? []) {
          const url = String(attempt.url ?? '')
          if (injections.has(url)) continue
          injections.add(url)
          await ctx.log(
            'pod.scout_page_tried_to_instruct',
            `${url} contained text addressed to the reader: ${String(attempt.quote ?? '').slice(0, 300)}`,
            { level: 'warn' },
          )
        }

        const vet = vetNiches(result.output.candidates ?? [], {
          retrieved,
          documents,
          snippetOnly,
        })
        for (const gap of vet.rejected) gapsByName.set(gap.name, gap.reason)
        for (const question of result.output.openQuestions ?? []) askedQuestions.add(question)

        /*
         * MERGED, not replaced — the same lesson the Supply scout learned the hard way.
         * The correction prompt says "fix exactly those", so a model reading it
         * correctly returns only the candidate it was asked about, and a non-empty
         * replace throws away every candidate the first pass had already evidenced.
         */
        if (pass === 1) {
          usable = vet.usable
          citations = vet.citations
          productIdeas = vet.productIdeas
          weakestLink = vet.weakestLink
          seasons = vet.season
        } else if (vet.usable.length > 0) {
          const corrected = new Map(vet.usable.map((c) => [c.name.toLowerCase(), c]))
          const kept = usable.filter((c) => !corrected.has(c.name.toLowerCase()))
          usable = [...kept, ...vet.usable]
          citations = { ...citations, ...vet.citations }
          productIdeas = { ...productIdeas, ...vet.productIdeas }
          weakestLink = { ...weakestLink, ...vet.weakestLink }
          seasons = { ...seasons, ...vet.season }
        }

        if (vet.rejected.length === 0) break
        feedback = vet.rejected.map((r) => `${r.name}: ${r.reason}`)
      }

      const injectionAttempts = injections.size

      /* ---------------- the IP gate and the weighting ---------------- */

      const blocked: Array<{ phrase: string; reason: string | null }> = await db
        .select({ phrase: blockedPhrases.phrase, reason: blockedPhrases.reason })
        .from(blockedPhrases)
        .where(eq(blockedPhrases.divisionId, divisionId))

      const scored = scoreNiches({ candidates: usable, blocked, now: at })

      for (const r of scored.rejected) {
        gapsByName.set(r.name, `${r.reason}: ${r.detail}`)
        if (r.reason === 'ip-blocked') {
          await ctx.log(
            'pod.scout_ip_blocked',
            `"${r.name}" was thrown out before it reached anyone: ${r.detail}`,
            { level: 'warn' },
          )
        }
      }

      /*
       * Niches the shop already has are dropped here rather than earlier.
       *
       * Earlier would mean the prompt's "do not propose these again" was the only
       * thing holding the line, which is a request rather than a rule. Dropped after
       * scoring so the operator still sees it was re-found — a niche the scout keeps
       * independently arriving at is a signal about the niche, not noise.
       */
      const fresh: ScoredNiche[] = []
      for (const niche of scored.accepted) {
        if (existingByName.has(niche.name.trim().toLowerCase())) {
          gapsByName.set(
            niche.name,
            `already on the board (scored ${niche.score}/100 again this run, so the row was left alone)`,
          )
          continue
        }
        fresh.push(niche)
      }

      const acceptedNames = new Set(fresh.map((n) => n.name))
      const rejected = [...gapsByName]
        .filter(([name]) => !acceptedNames.has(name))
        .map(([name, reason]) => ({ name, reason }))

      if (fresh.length === 0) {
        await ctx.log(
          'pod.scout_no_niches',
          `nothing survived the vet for "${seed}": ${rejected.map((r) => r.reason).join('; ')}`,
          { level: rejected.length > 0 ? 'warn' : 'error' },
        )
        return nothingFound('no candidate survived the vet', rejected, injectionAttempts)
      }

      /* ---------------- write, then hand it to a person ---------------- */

      const nicheIds: string[] = []
      const idByName = new Map<string, string>()

      for (const niche of fresh) {
        const values = {
          name: niche.name,
          keywords: niche.keywords,
          audience: niche.audience,
          season: seasons[niche.name] ?? null,
          score: niche.score,
          scoreBreakdown: {
            breakdown: niche.breakdown,
            ipRisk: niche.ipRisk,
            ipWarnings: niche.ipWarnings,
            weakestLink: niche.weakestLink,
            citations: citations[niche.name] ?? [],
            productIdeas: productIdeas[niche.name] ?? [],
          },
          rationale: [
            // The leading sentence, every time. `proposed` and a score read as "the
            // shop looked into this"; what they actually mean is "a model read some
            // pages and estimated three numbers from them".
            'ESTIMATED: the three scores behind this are the scout’s own read of the sources below, not measured figures.',
            `Weakest link: ${weakestLink[niche.name] ?? 'the scout did not say'}`,
            niche.whyNow ? `Why now: ${niche.whyNow}` : 'No timing argument survived checking.',
          ].join(' '),
          status: 'proposed' as const,
          sourceUrls: niche.sourceUrls,
          actor: `agent:${ctx.agent.id}`,
          updatedAt: at,
        }

        /*
         * Insert through the unique index rather than trusting the read above. Two
         * workers handed the same redelivered task both see no row and both insert;
         * one loses. Without this the loser raises a constraint violation and the
         * whole run retries, and with it the two inserts converge on one row.
         *
         * `setWhere` keeps the conflict path honest: a niche an operator has already
         * ACTED on — approved it, or killed it — is a decision, and overwriting it
         * with a fresh `proposed` would resurrect something that was deliberately
         * buried, or quietly restate a score a person has already signed off.
         */
        const [row] = await db
          .insert(niches)
          .values({ divisionId, ...values })
          .onConflictDoUpdate({
            target: [niches.divisionId, niches.name],
            set: values,
            setWhere: eq(niches.status, 'proposed'),
          })
          .returning()

        if (!row) {
          gapsByName.set(
            niche.name,
            'a row for this niche already exists and has been decided on; this run left it alone',
          )
          continue
        }
        nicheIds.push(String(row['id']))
        idByName.set(niche.name, String(row['id']))
      }

      if (nicheIds.length === 0) {
        return nothingFound(
          'every candidate was a niche somebody has already decided on',
          [...gapsByName].map(([name, reason]) => ({ name, reason })),
          injectionAttempts,
        )
      }

      const best = fresh.reduce((a, b) => (b.score > a.score ? b : a))

      ctx.remember({
        kind: 'result',
        content: `Scouted "${seed}": ${fresh.length} niche(s) proposed, ${best.name} leads on ${best.score}/100.`,
        importance: 0.4,
      })

      const outcome = await ctx.requestApproval({
        kind: 'niche',
        category: selfDirected ? 'self_directed' : 'operator_idea',
        refTable: 'pod.niches',
        refId: idByName.get(best.name) ?? nicheIds[0]!,
        summary:
          `${fresh.length} niche(s) from "${seed}" — ${best.name} leads on ${best.score}/100` +
          (selfDirected ? ' (nobody asked; the scout picked the angle)' : ''),
        payload: {
          seed,
          selfDirected,
          /** Carried through so a reader of the payload knows what this rests on. */
          evidence,
          /**
           * The three scores are a model's read of the pages, not measurements. Said
           * in the payload as well as on the row, because the card renders the payload.
           */
          scoresAreEstimates: true,
          simulatedResultsDropped: simulatedResults,
          searchesUsed,
          pagesFetched,
          pagesAttempted,
          injectionAttempts,
          niches: fresh.map((n) => ({
            nicheId: idByName.get(n.name) ?? null,
            name: n.name,
            score: n.score,
            breakdown: n.breakdown,
            audience: n.audience,
            keywords: n.keywords,
            season: seasons[n.name] ?? null,
            whyNow: n.whyNow,
            ipRisk: n.ipRisk,
            ipWarnings: n.ipWarnings,
            weakestLink: weakestLink[n.name] ?? 'the scout did not say',
            /** Ranked best-first: this is the "which products would perform best" answer. */
            productIdeas: productIdeas[n.name] ?? [],
            /** Claim to document to date. Follow it back or do not believe it. */
            citations: citations[n.name] ?? [],
            sourceUrls: n.sourceUrls,
          })),
          rejected,
          openQuestions: [...askedQuestions].slice(0, 6),
        },
      })

      return {
        seed,
        selfDirected,
        status: 'approval_requested',
        approvalId: outcome.approval.id,
        nicheIds,
        accepted: fresh.map((n) => ({ name: n.name, score: n.score, ipRisk: n.ipRisk })),
        rejected,
        searchesUsed,
        pagesFetched,
        pagesAttempted,
        evidence,
        injectionAttempts,
      }
    },
  }
}
