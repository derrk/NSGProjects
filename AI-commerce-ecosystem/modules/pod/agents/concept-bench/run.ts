/**
 * Concept bench (SPEC.md §Module 1 → the gap between research and design).
 *
 * An approved niche in; concept rows and ONE `concept` approval out, which is what
 * the Designer has been waiting on since it was built.
 *
 * This agent exists because the pipeline had a hole in the middle of it. The Trend
 * scout writes a niche. The Designer turns a concept into image variants and
 * triggers on `concept.approved`. Nothing in production wrote a concept — only the
 * seed script and the tests — so approving a niche did nothing at all, and the chain
 * drawn on the floor was two halves that never touched. It looked connected because
 * every piece of it existed.
 *
 * Three things here are load-bearing:
 *
 *   It reads the NICHE ROW, not the model's memory of it. The scout's citations and
 *   product rankings were written to `score_breakdown`, and they are the whole
 *   reason to trust the niche; a concept argued from a model's paraphrase of a niche
 *   it cannot see is a concept argued from nothing.
 *
 *   Every concept goes through `checkIpRisk` BEFORE it is written, not after. The
 *   designer checks too, but a high-risk concept that reaches the operator's inbox
 *   has already cost them a decision, and a concept row is what the Designer will
 *   spend image credits on.
 *
 *   `style` is checked against the enum in code. The model is told the five values
 *   and structured outputs drop that constraint, so a sixth value is not a worse
 *   concept — it is a failed insert halfway through a batch, leaving two concepts
 *   written, two lost, and an approval card describing four.
 */

import type { AgentContext, AgentDefinition } from '@acf/core/runtime'
import { NonRetriableError } from '@acf/core/runtime'
import { MODELS, type ModelClient } from '@acf/integrations/anthropic'
import { and, eq } from 'drizzle-orm'

import { checkIpRisk, ipRiskLevel, type IpFinding } from '../../ip-risk'
import { blockedPhrases, concepts, niches } from '../../schema/index'
import {
  conceptBenchExtractionSchema,
  conceptBenchInputSchema,
  conceptBenchOutputSchema,
  DEFAULT_PRODUCT_TYPES,
  DESIGN_STYLES,
  MAX_BRIEF_CHARS,
  MAX_CONCEPTS,
  MAX_PRODUCTS_PER_CONCEPT,
  MAX_TITLE_CHARS,
  MIN_BRIEF_CHARS,
  nicheIdFrom,
  type ConceptBenchInput,
  type ConceptBenchOutput,
  type ConceptProposal,
  type DesignStyle,
} from './schema'

/** Minimal structural view of the drizzle client, so this file does not import @acf/db. */
type Db = Record<string, unknown>

export interface ConceptBenchDeps {
  db: Db
  model: ModelClient
  now?: () => Date
}

/* ------------------------------------------------------------------ *
 * The vet
 * ------------------------------------------------------------------ */

export interface VettedConcept {
  title: string
  promptBrief: string
  style: DesignStyle
  products: string[]
  whyThisOne: string
  ipRisk: 'low' | 'medium' | 'high'
  ipFindings: IpFinding[]
}

export interface VetConceptsResult {
  usable: VettedConcept[]
  rejected: Array<{ title: string; reason: string }>
}

export interface VetConceptsOptions {
  /** Product types this division actually sells. Anything else is not orderable. */
  allowedProducts: readonly string[]
  blocked: ReadonlyArray<{ phrase: string; reason?: string | null }>
}

function trimTo(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/**
 * Check what structured outputs could not enforce.
 *
 * A concept is discarded rather than patched. Patching a bad style to 'flat-vector'
 * would make the insert succeed and hand the operator a design direction nobody
 * chose — and they would approve it, because it looks like an answer.
 */
export function vetConcepts(
  proposals: readonly ConceptProposal[],
  opts: VetConceptsOptions,
): VetConceptsResult {
  const usable: VettedConcept[] = []
  const rejected: Array<{ title: string; reason: string }> = []
  const seen = new Set<string>()

  for (const raw of proposals.slice(0, MAX_CONCEPTS)) {
    const title = trimTo(raw?.title, MAX_TITLE_CHARS)
    const label = title || '(untitled)'
    const reject = (reason: string) => rejected.push({ title: label, reason })

    if (!title) {
      reject('no title')
      continue
    }
    const key = title.toLowerCase()
    if (seen.has(key)) {
      reject('duplicate of an earlier concept in the same run')
      continue
    }

    const promptBrief = trimTo(raw?.promptBrief, MAX_BRIEF_CHARS)
    if (promptBrief.length < MIN_BRIEF_CHARS) {
      // The Designer writes three generation prompts from this field and nothing
      // else, so a thin brief is three renders of whatever the image model felt like
      // and an operator picking between three accidents.
      reject(
        `the prompt brief is ${promptBrief.length} characters; the Designer renders from ` +
          `this field alone and needs at least ${MIN_BRIEF_CHARS}`,
      )
      continue
    }

    const style = trimTo(raw?.style, 40).toLowerCase() as DesignStyle
    if (!DESIGN_STYLES.includes(style)) {
      /*
       * A Postgres enum, not a preference. Without this check the insert fails
       * partway through the batch: some concepts written, some lost, and an approval
       * card describing a set that does not exist.
       */
      reject(`"${raw?.style}" is not one of the five design styles`)
      continue
    }

    const products = [
      ...new Set(
        (raw?.products ?? [])
          .map((p) => trimTo(p, 60))
          .filter((p) => opts.allowedProducts.includes(p)),
      ),
    ].slice(0, MAX_PRODUCTS_PER_CONCEPT)

    if (products.length === 0) {
      // Not cosmetic. Store ops prices and lists per product type, so a concept
      // naming none is a design with nothing to print it on — and a product type
      // this division does not sell is not orderable however good the design is.
      reject('names no product type this division actually sells')
      continue
    }

    /*
     * The IP gate, before the row exists.
     *
     * The Designer checks too, and that check is the one that stops an image being
     * generated. This one stops the operator being asked. A high-risk concept in the
     * inbox has already spent the scarcest thing in the system, which is a decision.
     */
    const ipFindings = checkIpRisk({
      text: [title, promptBrief, trimTo(raw?.whyThisOne, 200)].filter(Boolean).join('\n'),
      blocked: opts.blocked,
    })
    const blocking = ipFindings.filter((f) => f.severity === 'blocking')
    if (blocking.length > 0) {
      reject(`ip-blocked: ${blocking.map((f) => f.message).join(' ')}`)
      continue
    }

    seen.add(key)
    usable.push({
      title,
      promptBrief,
      style,
      products,
      whyThisOne: trimTo(raw?.whyThisOne, 200) || 'the bench did not say',
      ipRisk: ipRiskLevel(ipFindings),
      ipFindings,
    })
  }

  return { usable, rejected }
}

/* ------------------------------------------------------------------ *
 * The prompt
 * ------------------------------------------------------------------ */

export interface NicheBrief {
  name: string
  audience: string
  keywords: readonly string[]
  season: string | null
  whyNow: string | null
  /** The scout's ranked suggestions. The operator asked for these specifically. */
  productIdeas: ReadonlyArray<{ product?: unknown; angle?: unknown; why?: unknown }>
  /** Claim, url and quote. The evidence, so the bench argues from it rather than around it. */
  citations: ReadonlyArray<{ claim?: unknown; url?: unknown; quote?: unknown }>
}

export function benchInstructions(
  niche: NicheBrief,
  allowedProducts: readonly string[],
  limit: number,
  feedback: string[],
): string {
  const ideas = niche.productIdeas
    .map((i) => `- ${String(i.product ?? '?')}: ${String(i.angle ?? '')} (${String(i.why ?? '')})`)
    .filter((l) => l.length > 6)

  /*
   * The evidence is quoted, not summarised.
   *
   * It is the only thing in this prompt that is not somebody's opinion, and a
   * summary of it is one more layer between a design and the reason to make it. The
   * quotes are already verified — the scout's vet checked each one against the
   * document it came from — so what is in here is what the pages actually said.
   */
  const evidence = niche.citations
    .map((c) => `- ${String(c.claim ?? '')} — "${String(c.quote ?? '')}" (${String(c.url ?? '')})`)
    .filter((l) => l.length > 10)

  return [
    `The niche, already approved by the operator: ${niche.name}`,
    `Who buys: ${niche.audience}`,
    niche.season ? `Peaks around: ${niche.season}` : 'Sells all year.',
    niche.whyNow ? `Timing: ${niche.whyNow}` : 'No timing argument survived checking.',
    niche.keywords.length > 0 ? `What they search for: ${niche.keywords.join(', ')}` : '',
    '',
    evidence.length > 0
      ? `What the sources actually said:\n${evidence.join('\n')}`
      : 'No quoted evidence survived on this niche.',
    '',
    ideas.length > 0 ? `The scout ranked these product angles:\n${ideas.join('\n')}` : '',
    '',
    `Propose at most ${limit} concepts. Products must come from: ${allowedProducts.join(', ')}.`,
    'A concept is a design somebody would buy, not a theme. "Dog mug" is a theme.',
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

export function createConceptBenchAgent(
  deps: ConceptBenchDeps,
): AgentDefinition<ConceptBenchInput, ConceptBenchOutput> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural db type
  const db = deps.db as any
  const now = deps.now ?? (() => new Date())

  return {
    key: 'concept_bench',
    outputSchema: conceptBenchOutputSchema,

    async run(ctx: AgentContext<ConceptBenchInput>): Promise<ConceptBenchOutput> {
      const divisionId = ctx.division.id
      const at = now()

      const parsed = conceptBenchInputSchema.safeParse(ctx.input)
      if (!parsed.success) {
        throw new NonRetriableError(
          'the task input is not a shape this agent can read; it needs a niche to work from',
        )
      }
      const nicheId = nicheIdFrom(parsed.data)
      if (!nicheId) {
        throw new NonRetriableError(
          'no niche to work from; this agent turns an approved niche into concepts and cannot invent one',
        )
      }

      /* ---------------- the niche, read from the row ---------------- */

      const [niche] = await db
        .select()
        .from(niches)
        .where(and(eq(niches.id, nicheId), eq(niches.divisionId, divisionId)))
        .limit(1)

      if (!niche) {
        throw new NonRetriableError(`niche ${nicheId} does not exist in this division`)
      }

      /*
       * Only an APPROVED niche.
       *
       * The dispatcher fires this on `niche.approved`, so in the ordinary path the
       * row is approved by the time we read it. But this agent is also runnable by
       * hand from the agents page with any niche id, and turning a `proposed` niche
       * into concepts would route round the gate the scout files its findings at —
       * the operator would be deciding on designs for a market they never agreed to.
       */
      if (niche.status !== 'approved') {
        throw new NonRetriableError(
          `niche "${niche.name}" is ${niche.status}, not approved; concepts are only ` +
            'built from a market the operator has agreed to',
        )
      }

      const breakdown = (niche.scoreBreakdown ?? {}) as Record<string, unknown>
      const brief: NicheBrief = {
        name: String(niche.name),
        audience: String(niche.audience ?? 'not recorded'),
        keywords: (niche.keywords ?? []) as string[],
        season: niche.season ?? null,
        whyNow: typeof breakdown['whyNow'] === 'string' ? breakdown['whyNow'] : null,
        productIdeas: Array.isArray(breakdown['productIdeas'])
          ? (breakdown['productIdeas'] as NicheBrief['productIdeas'])
          : [],
        citations: Array.isArray(breakdown['citations'])
          ? (breakdown['citations'] as NicheBrief['citations'])
          : [],
      }

      /*
       * One batch per niche, not one per run.
       *
       * The approval event can be redelivered, and the agents page has a Run now
       * button. Without this a niche approved once ends up with three sets of
       * concepts and three cards in the inbox, all slightly different, and the
       * operator has to work out which one they are supposed to be deciding.
       */
      const existing: Array<Record<string, unknown>> = await db
        .select()
        .from(concepts)
        .where(and(eq(concepts.divisionId, divisionId), eq(concepts.nicheId, nicheId)))

      if (existing.length > 0) {
        await ctx.log(
          'pod.bench_already_done',
          `"${niche.name}" already has ${existing.length} concept(s); this run left them alone`,
          { refTable: 'pod.niches', refId: nicheId },
        )
        return {
          nicheId,
          nicheName: brief.name,
          status: 'already_benched',
          approvalId: null,
          conceptIds: existing.map((c) => String(c['id'])),
          accepted: [],
          rejected: [],
          skipped: [],
        }
      }

      /* ---------------- what this division can actually print on ---------------- */

      const config = (ctx.division.config ?? {}) as Record<string, unknown>
      const configured = Array.isArray(config['productTypes'])
        ? (config['productTypes'] as unknown[]).map(String).filter(Boolean)
        : []
      const allowedProducts = configured.length > 0 ? configured : [...DEFAULT_PRODUCT_TYPES]

      const blocked: Array<{ phrase: string; reason: string | null }> = await db
        .select({ phrase: blockedPhrases.phrase, reason: blockedPhrases.reason })
        .from(blockedPhrases)
        .where(eq(blockedPhrases.divisionId, divisionId))

      if (blocked.length === 0) {
        /*
         * Said out loud rather than passed over.
         *
         * `checkIpRisk` against an empty list returns no findings, which is exactly
         * what it returns for a clean concept. Three divisions ran that way for weeks
         * and nothing on any screen distinguished a gate that passed you from a gate
         * that was not there. The structural patterns in ip-risk.ts still apply, so
         * this is degraded rather than off — but the operator should know which.
         */
        await ctx.log(
          'pod.bench_no_blocklist',
          'this division has no blocked phrases, so the IP check is running on its ' +
            'structural patterns alone; a registered mark will not be caught by name',
          { level: 'warn' },
        )
      }

      const limit = Math.max(1, Math.min(MAX_CONCEPTS, parsed.data.limit ?? MAX_CONCEPTS))

      /* ---------------- one pass, plus one correction ---------------- */

      const system =
        ctx.agent.systemPrompt ||
        'You turn an approved market into specific design ideas somebody would buy.'

      let usable: VettedConcept[] = []
      let feedback: string[] = []
      const skipped = new Set<string>()
      const gapsByTitle = new Map<string, string>()

      for (let pass = 1; pass <= 2; pass++) {
        const result = await deps.model.structured({
          model: MODELS.routine,
          system,
          parts: [{ kind: 'text', text: benchInstructions(brief, allowedProducts, limit, feedback) }],
          schema: conceptBenchExtractionSchema,
        })
        ctx.recordUsage(result.usage)

        for (const s of result.output.skipped ?? []) skipped.add(String(s).slice(0, 200))

        const vet = vetConcepts(result.output.concepts ?? [], { allowedProducts, blocked })
        for (const r of vet.rejected) gapsByTitle.set(r.title, r.reason)

        // Merged rather than replaced, for the reason both scouts learned: the
        // correction prompt says "fix exactly those", so a model reading it correctly
        // returns only what it was asked about, and a replace discards the rest.
        if (pass === 1) {
          usable = vet.usable
        } else if (vet.usable.length > 0) {
          const corrected = new Map(vet.usable.map((c) => [c.title.toLowerCase(), c]))
          usable = [...usable.filter((c) => !corrected.has(c.title.toLowerCase())), ...vet.usable]
        }

        if (vet.rejected.length === 0) break
        feedback = vet.rejected.map((r) => `${r.title}: ${r.reason}`)
      }

      usable = usable.slice(0, limit)
      const acceptedTitles = new Set(usable.map((c) => c.title))
      const rejected = [...gapsByTitle]
        .filter(([title]) => !acceptedTitles.has(title))
        .map(([title, reason]) => ({ title, reason }))

      for (const r of rejected) {
        if (r.reason.startsWith('ip-blocked')) {
          await ctx.log(
            'pod.bench_ip_blocked',
            `"${r.title}" was thrown out before it reached anyone: ${r.reason}`,
            { level: 'warn' },
          )
        }
      }

      if (usable.length === 0) {
        await ctx.log(
          'pod.bench_no_concepts',
          `nothing survived for "${brief.name}": ${rejected.map((r) => r.reason).join('; ')}`,
          { level: 'warn', refTable: 'pod.niches', refId: nicheId },
        )
        return {
          nicheId,
          nicheName: brief.name,
          status: 'no_concepts',
          approvalId: null,
          conceptIds: [],
          accepted: [],
          rejected:
            rejected.length > 0 ? rejected : [{ title: '(none)', reason: 'the bench proposed nothing' }],
          skipped: [...skipped].slice(0, 8),
        }
      }

      /* ---------------- write, then hand it to a person ---------------- */

      const rows: Array<Record<string, unknown>> = await db
        .insert(concepts)
        .values(
          usable.map((c) => ({
            divisionId,
            nicheId,
            taskId: ctx.task?.id ?? null,
            title: c.title,
            promptBrief: c.promptBrief,
            style: c.style,
            products: c.products,
            audience: brief.audience,
            whyNow: c.whyThisOne,
            ipRisk: c.ipRisk,
            ipNotes:
              c.ipFindings.length > 0
                ? c.ipFindings.map((f) => `${f.rule}: ${f.message}`).join(' ')
                : null,
            status: 'proposed' as const,
            actor: `agent:${ctx.agent.id}`,
            updatedAt: at,
          })),
        )
        .returning()

      const conceptIds = rows.map((r) => String(r['id']))
      const idByTitle = new Map(rows.map((r) => [String(r['title']), String(r['id'])]))

      ctx.remember({
        kind: 'result',
        content: `Benched ${usable.length} concept(s) for "${brief.name}": ${usable
          .map((c) => c.title)
          .join('; ')}.`,
        importance: 0.4,
      })

      const outcome = await ctx.requestApproval({
        kind: 'concept',
        category: 'from_niche',
        refTable: 'pod.concepts',
        refId: conceptIds[0]!,
        summary: `${usable.length} concept(s) for "${brief.name}"`,
        payload: {
          nicheId,
          nicheName: brief.name,
          audience: brief.audience,
          /**
           * The evidence, carried forward rather than restated.
           *
           * Approving a concept commits image credits, and the only reason to believe
           * this market is real is what the scout read on a page. A card that shows
           * the design idea without it is asking for a decision on a vibe.
           */
          evidence: brief.citations,
          concepts: usable.map((c) => ({
            conceptId: idByTitle.get(c.title) ?? null,
            title: c.title,
            promptBrief: c.promptBrief,
            style: c.style,
            products: c.products,
            whyThisOne: c.whyThisOne,
            ipRisk: c.ipRisk,
            /** Non-blocking matches. Low risk is not no risk, and the operator judges. */
            ipWarnings: c.ipFindings,
          })),
          rejected,
          /** What the bench declined to propose. Worth reading: it is self-censoring. */
          skipped: [...skipped].slice(0, 8),
          blocklistEmpty: blocked.length === 0,
        },
      })

      return {
        nicheId,
        nicheName: brief.name,
        status: 'approval_requested',
        approvalId: outcome.approval.id,
        conceptIds,
        accepted: usable.map((c) => ({ title: c.title, style: c.style, ipRisk: c.ipRisk })),
        rejected,
        skipped: [...skipped].slice(0, 8),
      }
    },
  }
}
