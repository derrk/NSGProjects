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
  /** Set by the gate when the operator picks a variant. */
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

/** The design this task is about, whichever shape it arrived in. */
export function designIdFrom(input: StoreOpsInput): string | null {
  const fromApproval =
    typeof input.approval?.payload === 'object' && input.approval.payload !== null
      ? ((input.approval.payload as { chosenDesignId?: unknown }).chosenDesignId ?? null)
      : null

  if (typeof fromApproval === 'string') return fromApproval
  return input.designId ?? input.refId ?? null
}
