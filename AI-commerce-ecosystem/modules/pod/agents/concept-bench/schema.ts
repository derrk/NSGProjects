import * as z from 'zod'

/**
 * Concept bench schemas.
 *
 * The gap this closes: the Trend scout writes a niche, the Designer turns a concept
 * into images, and until now nothing in production wrote a concept. Only the seed
 * script and the tests did — so an approved niche went nowhere, and the pipeline
 * that reads as a chain on the floor was two separate halves.
 *
 * Same discipline as both scouts, because the same thing is true here: structured
 * outputs drop enums, array sizes and string lengths, so every bound stated in a
 * `.describe()` below is re-checked in `vetConcepts`. The one that matters most is
 * `style`, which is a Postgres enum — a value outside it does not produce a bad
 * concept, it produces a failed insert partway through a batch.
 */

export const conceptBenchInputSchema = z.object({
  /** Set by a direct or manual invocation. */
  nicheId: z.string().optional(),
  /** What the core dispatcher sends when a `niche` approval is approved. */
  refId: z.string().optional(),
  refTable: z.string().optional(),
  /** Cap for this run, if the operator wants fewer than the default. */
  limit: z.number().optional(),
})

export type ConceptBenchInput = z.infer<typeof conceptBenchInputSchema>

/**
 * The styles, as the database spells them.
 *
 * Exported so the prompt can list them and the vet can check against the same
 * array rather than a second copy that drifts.
 */
export const DESIGN_STYLES = [
  'flat-vector',
  'hand-lettered',
  'retro-badge',
  'line-art',
  'watercolor',
] as const

export type DesignStyle = (typeof DESIGN_STYLES)[number]

/** Product types a concept may name when the division has not configured its own. */
export const DEFAULT_PRODUCT_TYPES = [
  'mug_11oz',
  'mug_15oz',
  'tee',
  'sweatshirt',
  'hoodie',
] as const

export const MAX_CONCEPTS = 4
export const MAX_TITLE_CHARS = 90
export const MAX_BRIEF_CHARS = 600
export const MAX_PRODUCTS_PER_CONCEPT = 5
/**
 * Short of this a prompt brief is not a brief.
 *
 * The Designer writes three generation prompts from this field and nothing else. A
 * twelve-character brief produces three renders of whatever the image model felt
 * like, and the operator is then picking between three accidents.
 */
export const MIN_BRIEF_CHARS = 40

export const conceptProposalSchema = z.object({
  title: z
    .string()
    .describe(
      'What the design says or is, at most 90 characters. A buyer should understand ' +
        'the joke from this line alone — if it needs the brief to land, it will not ' +
        'land from a thumbnail either.',
    ),
  promptBrief: z
    .string()
    .describe(
      'Between 40 and 600 characters describing what should be ON the item: the ' +
        'subject, the composition, the exact words if there are words, and the mood. ' +
        'Written for someone who will render it and has not read anything else. Do ' +
        'not describe the market, the buyer or why it will sell — that is elsewhere ' +
        'and it is not what gets printed.',
    ),
  style: z
    .string()
    .describe(
      'EXACTLY one of: flat-vector, hand-lettered, retro-badge, line-art, ' +
        'watercolor. Spelled as written, hyphens included. Anything else discards ' +
        'this concept, because it is a database enum rather than a preference.',
    ),
  products: z
    .array(z.string())
    .describe(
      'At most 5 product types from the list you were given, best first. Pick the ' +
        'ones this design actually suits — a wide landscape joke does not work on a ' +
        'mug, and a one-word gag is wasted on a hoodie.',
    ),
  whyThisOne: z
    .string()
    .describe(
      'At most 200 characters: what about the evidence makes THIS design worth ' +
        'making, rather than what makes the niche worth selling into. Those are ' +
        'different arguments and only the first one belongs to a concept.',
    ),
})

export type ConceptProposal = z.infer<typeof conceptProposalSchema>

export const conceptBenchExtractionSchema = z.object({
  concepts: z
    .array(conceptProposalSchema)
    .describe(
      'At most 4 concepts, each a genuinely different idea rather than the same joke ' +
        'reworded. Fewer is correct when the niche supports fewer, and the operator ' +
        'would rather see two good ones than four.',
    ),
  skipped: z
    .array(z.string())
    .describe(
      'Ideas you considered and did not propose, one line each, with why. Usually ' +
        'because they would need a brand, a character or a lyric. Empty is fine.',
    ),
})

export const conceptBenchOutputSchema = z.object({
  nicheId: z.string(),
  nicheName: z.string(),
  status: z.enum(['approval_requested', 'no_concepts', 'already_benched']),
  approvalId: z.string().nullable(),
  conceptIds: z.array(z.string()),
  accepted: z.array(
    z.object({
      title: z.string(),
      style: z.string(),
      ipRisk: z.enum(['low', 'medium', 'high']),
    }),
  ),
  /** What the vet and the IP gate threw out, and why. A gap is a finding. */
  rejected: z.array(z.object({ title: z.string(), reason: z.string() })),
  /** Ideas the model declined to propose at all. Worth seeing: it is self-censoring. */
  skipped: z.array(z.string()),
})

export type ConceptBenchOutput = z.infer<typeof conceptBenchOutputSchema>

/** The niche this task is about, whichever shape it arrived in. */
export function nicheIdFrom(input: ConceptBenchInput): string | null {
  if (input.nicheId) return input.nicheId
  // The dispatcher sends refTable with refId. A ref to anything else is not ours —
  // acting on it would mean looking up a design id in the niches table and either
  // finding nothing or, worse, finding an unrelated row with the same uuid.
  if (input.refTable && input.refTable !== 'pod.niches') return null
  return input.refId ?? null
}
