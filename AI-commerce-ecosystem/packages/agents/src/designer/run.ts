/**
 * The Designer agent (SPEC.md §Agents → Designer).
 *
 * One approved concept in, three stored PNGs and one `design` approval out.
 *
 * Deliberate deviation from SPEC.md: the print-resolution upscale and background
 * removal do NOT happen here. The operator picks one variant of three, so upscaling
 * all three first throws away two thirds of that spend — and the upscale is the single
 * most expensive step in the pipeline. The chosen variant gets promoted to print
 * resolution when `design.approved` fires, in week 2, which is where Store ops needs
 * it anyway. The fal client already exposes `upscale` and `removeBackground` for it.
 */

import type { AgentContext, AgentDefinition } from '@acf/core/runtime'
import { NonRetriableError } from '@acf/core/runtime'
import { concepts, designs, niches, shops, type Database } from '@acf/db'
import { MODELS, type ModelClient } from '@acf/integrations/anthropic'
import type { ImagePipeline } from '@acf/integrations/fal'
import { designPath, type DesignStorage } from '@acf/integrations/storage'
import { eq } from 'drizzle-orm'

import { planPrompt, resolvePrompt, simplifyPrompt, textCheckPrompt, type PromptContext } from './prompt'
import {
  designerOutputSchema,
  generationPlanSchema,
  textCheckSchema,
  type DesignerInput,
  type DesignerOutput,
  type GenerationPlan,
} from './schema'

/** SPEC.md: generate at 1024 square; the keeper is upscaled later. */
export const PREVIEW_SIZE = 1024

/**
 * How many times the lettering may come out wrong before the variant is abandoned.
 *
 * The first two attempts regenerate as-is; the last uses a simplified phrase. After
 * that the variant is dropped, and if no variant survives the concept is marked
 * `needs_human` rather than shipping a misspelled design.
 */
export const MAX_TEXT_ATTEMPTS = 3

export interface DesignerDeps {
  db: Database
  model: ModelClient
  images: ImagePipeline
  storage: DesignStorage
  /** Operator-edited system prompts. The settings screen that writes them is week 3. */
  promptOverrides?: { plan?: string | null; textCheck?: string | null; simplify?: string | null }
  /** Injected so tests do not depend on the wall clock. */
  today?: () => string
}

type PlannedVariant = GenerationPlan['variants'][number]

interface StoredVariant {
  designId: string
  variantNo: number
  imageUrl: string
  thumbnailUrl: string
  seed: string | null
  sourceModel: string
  genPrompt: string
  textCheckPassed: string
}

interface RenderedVariant {
  prompt: string
  bytes: Uint8Array
  contentType: string
  model: string
  seed: string | null
  width: number
  height: number
  textCheckPassed: string
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

export function createDesignerAgent(
  deps: DesignerDeps,
): AgentDefinition<DesignerInput, DesignerOutput> {
  const today = deps.today ?? (() => new Date().toISOString().slice(0, 10))

  /**
   * Generate one variant and prove its lettering is right.
   *
   * Returns null when the phrase never rendered correctly — the signal to abandon this
   * variant rather than ship a misspelled design.
   */
  async function renderVariant(
    ctx: AgentContext<DesignerInput>,
    promptCtx: PromptContext,
    planned: PlannedVariant,
    variantNo: number,
  ): Promise<RenderedVariant | null> {
    let prompt = planned.prompt
    let expectedText = planned.textToRender

    for (let attempt = 1; attempt <= MAX_TEXT_ATTEMPTS; attempt++) {
      const image = await deps.images.generate({
        prompt,
        hasText: planned.hasText,
        width: PREVIEW_SIZE,
        height: PREVIEW_SIZE,
        ...(planned.negativePrompt ? { negativePrompt: planned.negativePrompt } : {}),
      })

      // Download immediately: fal serves results from a CDN whose retention is
      // undocumented and whose expired files are unrecoverable. These bytes are the
      // only durable artifact of the generation.
      const file = await deps.images.download(image.url)

      const base: Omit<RenderedVariant, 'textCheckPassed'> = {
        prompt,
        bytes: file.bytes,
        contentType: file.contentType,
        model: image.model,
        seed: image.seed,
        width: image.width,
        height: image.height,
      }

      if (!planned.hasText || !expectedText) {
        return { ...base, textCheckPassed: 'n/a' }
      }

      const check = await deps.model.structured({
        model: MODELS.routine,
        system: resolvePrompt(textCheckPrompt(promptCtx), deps.promptOverrides?.textCheck),
        parts: [
          {
            kind: 'image',
            base64: toBase64(file.bytes),
            mediaType: file.contentType === 'image/jpeg' ? 'image/jpeg' : 'image/png',
          },
          { kind: 'text', text: `The lettering must read exactly: "${expectedText}"` },
        ],
        schema: textCheckSchema,
      })
      ctx.recordUsage(check.usage)

      if (check.output.matches) return { ...base, textCheckPassed: 'passed' }

      await ctx.log(
        'designer.text_check_failed',
        `variant ${variantNo} attempt ${attempt}: expected "${expectedText}", read "${check.output.observedText}"`,
        { level: 'warn' },
      )

      // Two plain regenerations, then try an easier phrase: image models fail on long,
      // punctuation-heavy strings far more often than on short ones.
      if (attempt === MAX_TEXT_ATTEMPTS - 1) {
        const simpler = await deps.model.structured({
          model: MODELS.routine,
          system: resolvePrompt(simplifyPrompt(promptCtx), deps.promptOverrides?.simplify),
          parts: [
            {
              kind: 'text',
              text: [
                `Original prompt: ${planned.prompt}`,
                `Lettering that keeps failing: "${expectedText}"`,
                `What the model actually rendered: "${check.output.observedText}"`,
              ].join('\n'),
            },
          ],
          schema: generationPlanSchema,
        })
        ctx.recordUsage(simpler.usage)

        const revised = simpler.output.variants[0]
        if (revised) {
          prompt = revised.prompt
          expectedText = revised.textToRender
        }
      }
    }

    return null
  }

  return {
    name: 'designer',
    outputSchema: designerOutputSchema,

    async run(ctx: AgentContext<DesignerInput>): Promise<DesignerOutput> {
      const { conceptId } = ctx.input

      const [concept] = await deps.db
        .select()
        .from(concepts)
        .where(eq(concepts.id, conceptId))
        .limit(1)
      if (!concept) {
        // Retrying cannot conjure the row into existence.
        throw new NonRetriableError(`concept ${conceptId} does not exist`)
      }
      if (concept.ipRisk === 'high') {
        throw new NonRetriableError(`concept ${conceptId} is ip_risk=high and must not be designed`)
      }

      /*
       * Idempotency guard.
       *
       * The orchestrator retries a failed run, and Inngest can redeliver an event, so
       * this agent must be safe to run twice for the same concept. Without this check
       * the second run regenerates three images — paying for them again — and then
       * dies on the unique (concept_id, variant_no) index after the money is spent.
       */
      const existingDesigns = await deps.db
        .select()
        .from(designs)
        .where(eq(designs.conceptId, conceptId))

      if (existingDesigns.length > 0) {
        const outcome = await ctx.requestApproval({
          kind: 'design',
          category: concept.style,
          refId: conceptId,
          summary: `${existingDesigns.length} design variant(s) for "${concept.title}"`,
          shopId: concept.shopId,
          payload: {
            conceptId,
            conceptTitle: concept.title,
            promptBrief: concept.promptBrief,
            style: concept.style,
            variants: existingDesigns.map((d) => ({
              designId: d.id,
              variantNo: d.variantNo,
              imageUrl: d.imageUrl,
              thumbnailUrl: d.thumbnailUrl ?? d.imageUrl,
              seed: d.seed,
              sourceModel: d.sourceModel,
              genPrompt: d.genPrompt,
              textCheckPassed: d.textCheckPassed ?? 'n/a',
            })),
          },
        })

        await ctx.log(
          'designer.already_designed',
          `concept already has ${existingDesigns.length} design(s); not regenerating`,
          { refTable: 'concepts', refId: conceptId },
        )

        return {
          conceptId,
          designIds: existingDesigns.map((d) => d.id),
          approvalId: outcome.approval.id,
          status: outcome.status === 'duplicate' ? 'already_requested' : 'approval_requested',
          abandonedVariants: [],
        }
      }

      const [shop] = concept.shopId
        ? await deps.db.select().from(shops).where(eq(shops.id, concept.shopId)).limit(1)
        : []
      const [niche] = concept.nicheId
        ? await deps.db.select().from(niches).where(eq(niches.id, concept.nicheId)).limit(1)
        : []

      const promptCtx: PromptContext = {
        shopName: shop?.name ?? 'the shop',
        audience: concept.audience ?? niche?.audience ?? shop?.audience ?? 'gift buyers',
        today: today(),
      }

      /* ------------- plan three distinct variants ------------- */

      const plan = await deps.model.structured({
        model: MODELS.routine,
        system: resolvePrompt(planPrompt(promptCtx), deps.promptOverrides?.plan),
        parts: [
          {
            kind: 'text',
            text: [
              `Concept title: ${concept.title}`,
              `Style: ${concept.style}`,
              `Brief: ${concept.promptBrief}`,
              concept.ipNotes ? `IP notes: ${concept.ipNotes}` : '',
              'Write exactly three generation prompts.',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
        schema: generationPlanSchema,
      })
      ctx.recordUsage(plan.usage)

      if (plan.output.variants.length !== 3) {
        // Worth a retry; the wrapper tells the next attempt what went wrong.
        throw new Error(`expected 3 variants, the model returned ${plan.output.variants.length}`)
      }

      await ctx.log('designer.planned', `planned 3 variants for "${concept.title}"`, {
        refTable: 'concepts',
        refId: conceptId,
      })

      /* ------------- generate, proof, store ------------- */

      const stored: StoredVariant[] = []
      const abandoned: number[] = []

      for (const [index, planned] of plan.output.variants.entries()) {
        const variantNo = index + 1
        const rendered = await renderVariant(ctx, promptCtx, planned, variantNo)

        if (!rendered) {
          abandoned.push(variantNo)
          await ctx.log(
            'designer.abandoned',
            `variant ${variantNo} abandoned: lettering never rendered correctly`,
            { level: 'warn', refTable: 'concepts', refId: conceptId },
          )
          continue
        }

        const object = await deps.storage.upload(
          designPath(conceptId, variantNo),
          rendered.bytes,
          rendered.contentType,
        )

        const [row] = await deps.db
          .insert(designs)
          .values({
            conceptId,
            variantNo,
            imageUrl: object.url,
            // The same asset for now; a separate print-resolution file is produced
            // once the operator picks this variant.
            thumbnailUrl: object.url,
            sourceModel: rendered.model,
            genPrompt: rendered.prompt,
            seed: rendered.seed,
            width: rendered.width,
            height: rendered.height,
            dpi: 72,
            textCheckPassed: rendered.textCheckPassed,
            status: 'pending_approval',
            createdBy: 'agent:designer',
          })
          .returning()

        if (!row) throw new Error(`failed to insert design variant ${variantNo}`)

        stored.push({
          designId: row.id,
          variantNo,
          imageUrl: object.url,
          thumbnailUrl: object.url,
          seed: rendered.seed,
          sourceModel: rendered.model,
          genPrompt: rendered.prompt,
          textCheckPassed: rendered.textCheckPassed,
        })
      }

      /* ------------- hand it to the operator ------------- */

      if (stored.length === 0) {
        await deps.db
          .update(concepts)
          .set({ status: 'needs_human', updatedAt: new Date() })
          .where(eq(concepts.id, conceptId))

        await ctx.log(
          'designer.needs_human',
          `no variant rendered correctly for "${concept.title}"`,
          { level: 'error', refTable: 'concepts', refId: conceptId },
        )

        return {
          conceptId,
          designIds: [],
          approvalId: null,
          status: 'needs_human',
          abandonedVariants: abandoned,
        }
      }

      const outcome = await ctx.requestApproval({
        kind: 'design',
        // Designs graduate per style, which is what actually varies in quality.
        category: concept.style,
        refId: conceptId,
        summary: `${stored.length} design variant(s) for "${concept.title}"`,
        shopId: concept.shopId,
        payload: {
          conceptId,
          conceptTitle: concept.title,
          promptBrief: concept.promptBrief,
          style: concept.style,
          variants: stored,
        },
      })

      await deps.db
        .update(concepts)
        .set({ status: 'designed', updatedAt: new Date() })
        .where(eq(concepts.id, conceptId))

      return {
        conceptId,
        designIds: stored.map((s) => s.designId),
        approvalId: outcome.approval.id,
        status: outcome.status === 'duplicate' ? 'already_requested' : 'approval_requested',
        abandonedVariants: abandoned,
      }
    },
  }
}
