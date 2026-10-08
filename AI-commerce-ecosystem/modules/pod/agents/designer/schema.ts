import * as z from 'zod'

/**
 * Schemas for the Designer agent.
 *
 * Two kinds live here and they have different constraints:
 *
 * - MODEL-FACING schemas go through the Anthropic SDK's structured outputs, which
 *   keeps only a small JSON-Schema keyword allowlist and demotes everything else into
 *   a stringified `description`. `enum` is NOT on that allowlist, so every enum below
 *   also names its allowed values in `.describe()` — otherwise the model is given no
 *   hint at all. Client-side `.parse()` still enforces it, and a violation surfaces as
 *   a retry through the run wrapper. `z.record()` and `z.any()` must never appear here:
 *   a record becomes an object the model cannot legally put keys into, and `z.any()`
 *   throws at schema-conversion time.
 *
 * - AGENT-FACING schemas are validated by the run wrapper in plain TypeScript, so they
 *   have no such limits.
 */

/* ---------------------------------------------------------------- *
 * Model-facing
 * ---------------------------------------------------------------- */

export const generationPlanSchema = z.object({
  variants: z
    .array(
      z.object({
        prompt: z
          .string()
          .describe(
            'A complete image generation prompt. Describe subject, composition, colour ' +
              'palette and rendering style concretely. Do not mention any brand, character, ' +
              'team, celebrity, song lyric, movie quote, or a living artist by name.',
          ),
        composition: z
          .string()
          .describe(
            'One short phrase naming how this variant is composed differently from the ' +
              'others, e.g. "centred stack", "circular badge", "diagonal split".',
          ),
        hasText: z
          .boolean()
          .describe('True if the design renders readable lettering as part of the artwork.'),
        textToRender: z
          .string()
          .describe(
            'The exact lettering that must appear, verbatim, or an empty string when ' +
              'hasText is false. This string is checked against the generated image.',
          ),
        negativePrompt: z
          .string()
          .describe('What to keep out of the image. Empty string if nothing in particular.'),
      }),
    )
    .describe('Exactly three variants that differ in COMPOSITION, not merely in colour.'),
})

export type GenerationPlan = z.infer<typeof generationPlanSchema>

export const textCheckSchema = z.object({
  matches: z.boolean().describe('True only if the lettering in the image is spelled exactly right.'),
  observedText: z.string().describe('The lettering you can actually read in the image.'),
  problem: z
    .string()
    .describe('What is wrong with the lettering, or an empty string when it is correct.'),
})

export type TextCheck = z.infer<typeof textCheckSchema>

/* ---------------------------------------------------------------- *
 * Agent-facing
 * ---------------------------------------------------------------- */

export const designerInputSchema = z.object({
  conceptId: z.string(),
  shopId: z.string().nullable().optional(),
})

export type DesignerInput = z.infer<typeof designerInputSchema>

export const designerOutputSchema = z.object({
  conceptId: z.string(),
  designIds: z.array(z.string()),
  approvalId: z.string().nullable(),
  status: z.enum(['approval_requested', 'needs_human', 'already_requested']),
  /** Variants abandoned because their lettering never came out right. */
  abandonedVariants: z.array(z.number()),
})

export type DesignerOutput = z.infer<typeof designerOutputSchema>
