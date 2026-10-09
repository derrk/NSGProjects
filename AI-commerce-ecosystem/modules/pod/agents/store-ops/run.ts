/**
 * Store ops (SPEC.md §Module 1).
 *
 * One approved design in; a Printify product per product type, with mockups and a
 * price, waiting in the operator's inbox as a `product` approval.
 *
 * Publishing is NOT here. It happens when the operator approves, because publishing
 * locks the product in Printify and that lock is only released by a callback — which
 * makes it a separate durable step rather than the tail of this run.
 */

import type { AgentContext, AgentDefinition } from '@acf/core/runtime'
import { NonRetriableError } from '@acf/core/runtime'
import { MODELS, type ModelClient } from '@acf/integrations/anthropic'
import type { PrintifyClient } from '@acf/integrations/printify'
import { and, eq } from 'drizzle-orm'

import { priceProduct, type PricingRule } from '../../pricing'
import { concepts, designs, pricingRules, products } from '../../schema/index'
import { listingPrompt } from './prompt'
import {
  designIdFrom,
  listingCopySchema,
  MAX_TITLE_CHARS,
  REQUIRED_TAGS,
  storeOpsOutputSchema,
  type ListingCopy,
  type StoreOpsInput,
  type StoreOpsOutput,
} from './schema'

type Db = Record<string, unknown>

export interface StoreOpsDeps {
  db: Db
  model: ModelClient
  printify: PrintifyClient
  /** The Printify shop to create products in. Comes from the division's config. */
  shopId?: string
}

/** Which Printify blueprint backs each of our product types. */
export const BLUEPRINTS: Record<string, { blueprintId: number; printProviderId: number }> = {
  tee: { blueprintId: 6, printProviderId: 29 },
  sweatshirt: { blueprintId: 77, printProviderId: 29 },
  hoodie: { blueprintId: 49, printProviderId: 29 },
  mug_11oz: { blueprintId: 68, printProviderId: 99 },
  mug_15oz: { blueprintId: 1108, printProviderId: 99 },
}

/**
 * Check what structured outputs could not enforce.
 *
 * The Anthropic SDK drops length limits and array sizes from the JSON Schema, so the
 * model is only hinted at "140 characters" and "13 tags". Re-checking here turns a
 * silent violation into a retry that tells the model exactly what was wrong.
 */
export function validateCopy(copy: ListingCopy): string[] {
  const problems: string[] = []

  if (copy.title.length > MAX_TITLE_CHARS) {
    problems.push(`the title is ${copy.title.length} characters; the limit is ${MAX_TITLE_CHARS}`)
  }
  if (copy.tags.length !== REQUIRED_TAGS) {
    problems.push(`there are ${copy.tags.length} tags; exactly ${REQUIRED_TAGS} are needed`)
  }
  const paragraphs = copy.description.split(/\n\s*\n/).filter((p) => p.trim())
  if (paragraphs.length !== 3) {
    problems.push(`the description has ${paragraphs.length} paragraphs; it needs exactly 3`)
  }
  const lowered = copy.tags.map((t) => t.toLowerCase())
  if (new Set(lowered).size !== lowered.length) {
    problems.push('two tags are the same')
  }

  return problems
}

/** Phrases that promise a delivery date. Shipping copy describes a process, not a date. */
const DELIVERY_PROMISE =
  /(arriv\w*|deliver\w*|get it|have it|in time)[^.!?]{0,40}(christmas|xmas|dec(ember)?\b|holidays?\b|by the \d+)/i

export function createStoreOpsAgent(
  deps: StoreOpsDeps,
): AgentDefinition<StoreOpsInput, StoreOpsOutput> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural db type
  const db = deps.db as any

  return {
    key: 'store_ops',
    outputSchema: storeOpsOutputSchema,

    async run(ctx: AgentContext<StoreOpsInput>): Promise<StoreOpsOutput> {
      const divisionId = ctx.division.id
      const designId = designIdFrom(ctx.input)
      if (!designId) {
        throw new NonRetriableError(
          'no design id in the task input (expected designId, refId, or an approval payload)',
        )
      }

      const [design] = await db.select().from(designs).where(eq(designs.id, designId)).limit(1)
      if (!design) throw new NonRetriableError(`design ${designId} does not exist`)

      const [concept] = await db
        .select()
        .from(concepts)
        .where(and(eq(concepts.id, design.conceptId), eq(concepts.divisionId, divisionId)))
        .limit(1)
      if (!concept) {
        throw new NonRetriableError(`design ${designId} does not belong to this division`)
      }

      // Idempotency: a redelivered design.approved must not create a second set of
      // Printify products, which would be real listings in a real shop.
      const existing = await db.select().from(products).where(eq(products.designId, designId))
      if (existing.length > 0) {
        const outcome = await ctx.requestApproval({
          kind: 'product',
          category: existing[0].type,
          refTable: 'pod.designs',
          refId: designId,
          summary: `${existing.length} listing(s) for "${concept.title}"`,
          payload: {
            designId,
            conceptTitle: concept.title,
            products: existing.map((p: Record<string, unknown>) => ({
              productId: p['id'],
              type: p['type'],
              title: p['title'],
              priceCents: p['priceCents'],
              mockupUrls: p['mockupUrls'],
            })),
          },
        })

        await ctx.log('pod.already_listed', `design already has ${existing.length} listing(s)`, {
          refTable: 'pod.designs',
          refId: designId,
        })

        return {
          designId,
          productIds: existing.map((p: { id: string }) => p.id),
          approvalId: outcome.approval.id,
          status: outcome.status === 'duplicate' ? 'already_requested' : 'approval_requested',
          skipped: [],
        }
      }

      const shopId = deps.shopId ?? (ctx.division.config as { printifyShopId?: string } | null)?.printifyShopId
      if (!shopId) {
        throw new NonRetriableError(
          "this division has no printifyShopId in its config; add it before publishing listings",
        )
      }

      // Upload once and reuse the id across every product type, rather than paying to
      // upload the same artwork five times.
      const uploaded = await deps.printify.uploadImageByUrl(
        `${concept.title.slice(0, 40)}-${design.variantNo}.png`,
        design.printUrl ?? design.imageUrl,
      )
      ctx.recordToolCall({ name: 'printify.uploadImage', args: { designId }, ok: true })

      const rules = await db.select().from(pricingRules).where(eq(pricingRules.divisionId, divisionId))
      const ruleFor = (type: string): PricingRule | null => {
        const row = rules.find((r: { productType: string }) => r.productType === type)
        return row
          ? {
              productType: row.productType,
              markupMultiple: row.markupMultiple,
              roundToCents: row.roundToCents,
              minPriceCents: row.minPriceCents,
              maxPriceCents: row.maxPriceCents,
            }
          : null
      }

      const targetTypes: string[] = concept.products.length > 0 ? concept.products : ['tee']
      const created: Array<Record<string, unknown>> = []
      const skipped: Array<{ productType: string; reason: string }> = []

      for (const type of targetTypes) {
        const blueprint = BLUEPRINTS[type]
        if (!blueprint) {
          skipped.push({ productType: type, reason: 'no Printify blueprint is mapped for it' })
          continue
        }
        const rule = ruleFor(type)
        if (!rule) {
          skipped.push({ productType: type, reason: 'no pricing rule for this product type' })
          continue
        }

        const variants = await deps.printify.getVariants(
          blueprint.blueprintId,
          blueprint.printProviderId,
        )
        const priced = priceProduct(variants, rule)

        if (priced.variants.length === 0) {
          skipped.push({ productType: type, reason: 'no variant could be priced' })
          continue
        }

        /* ---------------- listing copy ---------------- */

        const blueprintFacts = variants
          .slice(0, 1)
          .flatMap((v) => v.placeholders.map((p) => `print area ${p.position}: ${p.width}x${p.height}px`))

        let copy: ListingCopy | null = null
        let copyProblems: string[] = []

        for (let attempt = 1; attempt <= 2 && !copy; attempt++) {
          const result = await deps.model.structured({
            model: MODELS.routine,
            system: ctx.agent.systemPrompt || listingPrompt({ shopName: ctx.division.name }),
            parts: [
              {
                kind: 'text',
                text: [
                  `Product type: ${type}`,
                  `Concept: ${concept.title}`,
                  `Design brief: ${concept.promptBrief}`,
                  `Audience: ${concept.audience ?? 'gift buyers'}`,
                  `Blueprint facts you may state: ${blueprintFacts.join('; ') || 'none provided'}`,
                  `Sizes available: ${variants.map((v) => v.title).join(', ')}`,
                  copyProblems.length > 0
                    ? `Your previous attempt was rejected: ${copyProblems.join('; ')}. Fix exactly those.`
                    : '',
                ]
                  .filter(Boolean)
                  .join('\n'),
              },
            ],
            schema: listingCopySchema,
          })
          ctx.recordUsage(result.usage)

          copyProblems = validateCopy(result.output)
          if (DELIVERY_PROMISE.test(result.output.description)) {
            copyProblems.push('the description promises a delivery date; describe the process instead')
          }
          if (copyProblems.length === 0) copy = result.output
        }

        if (!copy) {
          skipped.push({
            productType: type,
            reason: `listing copy failed validation twice: ${copyProblems.join('; ')}`,
          })
          continue
        }

        /* ---------------- create in Printify ---------------- */

        const placeholderPosition = variants[0]?.placeholders[0]?.position ?? 'front'
        const printifyProduct = await deps.printify.createProduct(shopId, {
          title: copy.title,
          description: copy.description,
          tags: copy.tags,
          blueprintId: blueprint.blueprintId,
          printProviderId: blueprint.printProviderId,
          variants: priced.variants.map((v) => ({
            id: v.variantId,
            price: v.priceCents,
            is_enabled: true,
          })),
          printAreas: [
            {
              variantIds: priced.variants.map((v) => v.variantId),
              placeholders: [
                {
                  position: placeholderPosition,
                  images: [{ id: uploaded.id, x: 0.5, y: 0.5, scale: 1, angle: 0 }],
                },
              ],
            },
          ],
        })
        ctx.recordToolCall({ name: 'printify.createProduct', args: { type }, ok: true })

        const mockups = (printifyProduct.images ?? []).filter((i) => i.is_default).map((i) => i.src)
        const cheapest = priced.variants.reduce((a, b) => (a.priceCents <= b.priceCents ? a : b))

        const [row] = await db
          .insert(products)
          .values({
            divisionId,
            designId,
            type,
            printifyProductId: printifyProduct.id,
            blueprintId: blueprint.blueprintId,
            printProviderId: blueprint.printProviderId,
            title: copy.title,
            description: copy.description,
            tags: copy.tags,
            priceCents: cheapest.priceCents,
            costCents: cheapest.costCents,
            mockupUrls: mockups,
            status: 'pending_approval',
            actor: `agent:${ctx.agent.id}`,
          })
          .returning()

        created.push(row)

        if (priced.problems.length > 0) {
          await ctx.log(
            'pod.pricing_warning',
            `${type}: ${priced.problems.map((p) => p.reason).join('; ')}`,
            { level: 'warn', refTable: 'pod.products', refId: row.id },
          )
        }
      }

      if (created.length === 0) {
        await ctx.log(
          'pod.no_listings',
          `no listing could be built for "${concept.title}": ${skipped.map((s) => s.reason).join('; ')}`,
          { level: 'error', refTable: 'pod.designs', refId: designId },
        )
        return {
          designId,
          productIds: [],
          approvalId: null,
          status: 'no_priceable_variants',
          skipped,
        }
      }

      ctx.remember({
        kind: 'result',
        content: `Built ${created.length} listing(s) for "${concept.title}" (${targetTypes.join(', ')}).`,
        importance: 0.3,
      })

      const outcome = await ctx.requestApproval({
        kind: 'product',
        category: String(created[0]!['type']),
        refTable: 'pod.designs',
        refId: designId,
        summary: `${created.length} listing(s) for "${concept.title}"`,
        payload: {
          designId,
          conceptTitle: concept.title,
          designImageUrl: design.imageUrl,
          skipped,
          products: created.map((p) => ({
            productId: p['id'],
            type: p['type'],
            title: p['title'],
            description: p['description'],
            tags: p['tags'],
            priceCents: p['priceCents'],
            costCents: p['costCents'],
            mockupUrls: p['mockupUrls'],
          })),
        },
      })

      return {
        designId,
        productIds: created.map((p) => String(p['id'])),
        approvalId: outcome.approval.id,
        status: outcome.status === 'duplicate' ? 'already_requested' : 'approval_requested',
        skipped,
      }
    },
  }
}
