import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  conceptStatus,
  designStatus,
  designStyle,
  ipRisk,
  nicheStatus,
  productStatus,
  productType,
} from './enums'
import { auditColumns, shops, suppliers } from './shops'

/**
 * A market the Scout found worth selling into.
 *
 * Written by the Scout as *evidence*: scores and source urls, not recommendations.
 * The Strategist reads these and proposes what to do about them.
 */
export const niches = pgTable(
  'niches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Null while the niche is unassigned — a niche can justify a whole new shop. */
    shopId: uuid('shop_id').references(() => shops.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    keywords: text('keywords')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    audience: text('audience'),
    /** e.g. 'christmas-2026', 'evergreen', 'mothers-day'. */
    season: text('season'),
    /** 0-100 composite of demand, competition, giftability and IP safety. */
    score: integer('score').notNull().default(0),
    /** Component scores, kept so a ranking can be re-derived without re-researching. */
    scoreBreakdown: jsonb('score_breakdown').notNull().default({}),
    rationale: text('rationale'),
    status: nicheStatus('status').notNull().default('proposed'),
    sourceUrls: text('source_urls')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ...auditColumns,
  },
  (t) => [
    index('niches_status_idx').on(t.status),
    index('niches_shop_idx').on(t.shopId),
    uniqueIndex('niches_name_idx').on(t.name),
  ],
)

/**
 * A product the Scout observed selling inside a niche.
 *
 * This is market evidence, not something this system sells — it is what the Strategist
 * reasons over when deciding what to make and whether a niche justifies a new shop.
 */
export const nicheProducts = pgTable(
  'niche_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nicheId: uuid('niche_id')
      .notNull()
      .references(() => niches.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** Where it was seen: 'etsy', 'amazon', 'shopify', 'tiktok', ... */
    marketplace: text('marketplace'),
    url: text('url'),
    /** Observed price range in cents, so a pricing floor/ceiling can be derived. */
    priceLowCents: integer('price_low_cents'),
    priceHighCents: integer('price_high_cents'),
    /** Whatever demand proxy the source exposes: reviews, sales, favourites. */
    demandSignal: text('demand_signal'),
    demandValue: integer('demand_value'),
    /** Can this be made with print-on-demand, or would it need a supplier? */
    producibleWithPod: text('producible_with_pod'),
    notes: text('notes'),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
    ...auditColumns,
  },
  (t) => [index('niche_products_niche_idx').on(t.nicheId)],
)

/** One design idea. Approval gate #1. */
export const concepts = pgTable(
  'concepts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id').references(() => shops.id, { onDelete: 'cascade' }),
    nicheId: uuid('niche_id').references(() => niches.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    /** What the image should show, in 2-3 sentences. Feeds the Designer's prompts. */
    promptBrief: text('prompt_brief').notNull(),
    style: designStyle('style').notNull(),
    /** Which product types this concept should be put on, as `product_type` values. */
    products: text('products')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    audience: text('audience'),
    whyNow: text('why_now'),
    ipRisk: ipRisk('ip_risk').notNull().default('low'),
    ipNotes: text('ip_notes'),
    status: conceptStatus('status').notNull().default('proposed'),
    ...auditColumns,
  },
  (t) => [
    index('concepts_status_idx').on(t.status),
    index('concepts_shop_idx').on(t.shopId),
    index('concepts_niche_idx').on(t.nicheId),
  ],
)

/** One generated image variant. Three per concept; the operator picks one. */
export const designs = pgTable(
  'designs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conceptId: uuid('concept_id')
      .notNull()
      .references(() => concepts.id, { onDelete: 'cascade' }),
    /** 1, 2 or 3 — which of the concept's variants this is. */
    variantNo: integer('variant_no').notNull(),
    /** Supabase Storage path of the print-ready PNG. */
    imageUrl: text('image_url').notNull(),
    /** 1024-square version used for inbox thumbnails. */
    thumbnailUrl: text('thumbnail_url'),
    /** fal.ai endpoint id, e.g. 'fal-ai/ideogram/v3'. */
    sourceModel: text('source_model').notNull(),
    genPrompt: text('gen_prompt').notNull(),
    /** Kept so a design can be reproduced exactly. Not every fal model returns one. */
    seed: text('seed'),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    dpi: integer('dpi').notNull().default(300),
    /** Result of the vision check that the lettering matches the brief. */
    textCheckPassed: text('text_check_passed'),
    status: designStatus('status').notNull().default('generated'),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex('designs_concept_variant_idx').on(t.conceptId, t.variantNo),
    index('designs_status_idx').on(t.status),
  ],
)

/** One design on one product type. Approval gate #2. */
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    /** Null for a dropshipped product, which has a supplier instead of a design. */
    designId: uuid('design_id').references(() => designs.id, { onDelete: 'set null' }),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    type: productType('type').notNull(),
    printifyProductId: text('printify_product_id'),
    shopifyProductId: text('shopify_product_id'),
    etsyListingId: text('etsy_listing_id'),
    blueprintId: integer('blueprint_id'),
    printProviderId: integer('print_provider_id'),
    title: text('title').notNull(),
    description: text('description').notNull(),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Real money, so exact integer cents — never floating point. */
    priceCents: integer('price_cents').notNull(),
    costCents: integer('cost_cents').notNull(),
    /** Printify mockup urls, cached for the inbox and the product page. */
    mockupUrls: text('mockup_urls')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: productStatus('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...auditColumns,
  },
  (t) => [
    index('products_shop_status_idx').on(t.shopId, t.status),
    index('products_design_idx').on(t.designId),
    uniqueIndex('products_printify_idx').on(t.printifyProductId),
  ],
)
