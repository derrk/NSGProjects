import * as z from 'zod'

/**
 * Store ops schemas.
 *
 * The listing-copy schema goes through Anthropic structured outputs, which keeps only
 * a small JSON-Schema keyword allowlist — length limits and enums are demoted to the
 * description. So every constraint that matters is ALSO stated in prose in the
 * `.describe()`, and re-checked in code after parsing.
 */

export const listingCopySchema = z.object({
  title: z
    .string()
    .describe(
      'At most 140 characters, with the strongest search keyword FIRST. No ALL CAPS, ' +
        'no emoji, no "best" or "#1" claims.',
    ),
  description: z
    .string()
    .describe(
      'Exactly three paragraphs separated by blank lines. First: who this is a gift ' +
        'for and why it lands. Second: material facts taken ONLY from the blueprint ' +
        'data given to you — never invent a fibre content, weight or size. Third: care ' +
        'and shipping, describing the process and never promising a delivery date.',
    ),
  tags: z
    .array(z.string())
    .describe('Exactly 13 tags. Lowercase, no punctuation, no repeated words, no brand names.'),
})

export type ListingCopy = z.infer<typeof listingCopySchema>

export const MAX_TITLE_CHARS = 140
export const REQUIRED_TAGS = 13

export const storeOpsInputSchema = z.object({
  designId: z.string().optional(),
  /** What the core dispatcher sends when `design.approved` fires. */
  refId: z.string().optional(),
  refTable: z.string().optional(),
  /**
   * What the dispatcher actually sends: the SHIPPED payload, flat.
   *
   * On an `edited` decision the gate ships the operator's version rather than the
   * agent's, and that is where `chosenDesignId` lives — which variant of the three
   * they picked. This agent only read `approval.payload`, a shape nothing in the
   * dispatch path produces, so the pick was silently missed on every real run.
   */
  payload: z.unknown().optional(),
  decision: z.string().optional(),
  /** The nested shape, kept for a resumed task that carries its own decision. */
  approval: z
    .object({ payload: z.unknown().optional(), decision: z.string().optional() })
    .optional(),
})

export type StoreOpsInput = z.infer<typeof storeOpsInputSchema>

export const storeOpsOutputSchema = z.object({
  designId: z.string(),
  productIds: z.array(z.string()),
  approvalId: z.string().nullable(),
  status: z.enum(['approval_requested', 'already_requested', 'no_priceable_variants']),
  /** Product types that could not be built, with why. */
  skipped: z.array(z.object({ productType: z.string(), reason: z.string() })),
})

export type StoreOpsOutput = z.infer<typeof storeOpsOutputSchema>

/**
 * The design this task is about, whichever shape it arrived in.
 *
 * Order matters. The operator's PICK comes first, because a `design` approval covers
 * three variants and the one they chose is the only one that should become a
 * listing.
 *
 * It was read only from `input.approval.payload`, which nothing in the dispatch path
 * produces — `dispatchInput` sends the shipped payload flat. So on every real run the
 * pick was missed and the function fell through to `refId`, which for a `design`
 * approval is the CONCEPT id. Store ops then looked up a concept id in the designs
 * table and the whole pipeline stopped there, one step after the operator chose.
 */
export function chosenDesignId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const chosen = (payload as { chosenDesignId?: unknown }).chosenDesignId
  return typeof chosen === 'string' && chosen.trim() ? chosen.trim() : null
}

export function designIdFrom(input: StoreOpsInput): string | null {
  const picked = chosenDesignId(input.payload) ?? chosenDesignId(input.approval?.payload)
  if (picked) return picked

  if (input.designId) return input.designId

  /*
   * `refId` only when it is actually a design.
   *
   * A `design` approval refs the CONCEPT — that is what the card is about — so an
   * unguarded fallback hands a concept id to a designs lookup. The failure was at
   * least loud; the version of this that silently found a row would have built a
   * listing for the wrong artwork.
   */
  if (input.refTable && input.refTable !== 'pod.designs') return null
  return input.refId ?? null
}
