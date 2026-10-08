import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { fulfillmentModel, shopPlatform, shopStatus } from './enums'

/**
 * Shared column shapes. `createdBy` records who wrote the row — `agent:<name>` or
 * `operator` — as required by the data model section of SPEC.md.
 */
export const auditColumns = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: text('created_by').notNull().default('system'),
}

/**
 * One storefront.
 *
 * The system was specified around a single shop, but the Strategist agent proposes new
 * ones, so every domain table carries `shop_id` from day one rather than needing a
 * migration across the whole schema later.
 */
export const shops = pgTable(
  'shops',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    platform: shopPlatform('platform').notNull().default('shopify'),
    status: shopStatus('status').notNull().default('proposed'),
    fulfillment: fulfillmentModel('fulfillment').notNull().default('pod'),
    domain: text('domain'),
    /** One-line positioning statement; shown on the About page and used in prompts. */
    positioning: text('positioning'),
    audience: text('audience'),
    /** Shopify store handle / Printify shop id, once the operator has connected them. */
    shopifyShopDomain: text('shopify_shop_domain'),
    printifyShopId: text('printify_shop_id'),
    etsyShopId: text('etsy_shop_id'),
    /** Which product types this shop sells, as `product_type` values. */
    productTypes: text('product_types')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    launchedAt: timestamp('launched_at', { withTimezone: true }),
    ...auditColumns,
  },
  (t) => [uniqueIndex('shops_slug_idx').on(t.slug), index('shops_status_idx').on(t.status)],
)

/**
 * A Strategist recommendation to open a new shop. Approval gate kind `shop_proposal`,
 * which never auto-approves.
 */
export const shopProposals = pgTable(
  'shop_proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The niche the recommendation is built on. */
    nicheId: uuid('niche_id'),
    /** Preferred shop name; `nameAlternatives` holds the runners-up. */
    name: text('name').notNull(),
    nameAlternatives: text('name_alternatives')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    domainCandidates: text('domain_candidates')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    platform: shopPlatform('platform').notNull().default('shopify'),
    fulfillment: fulfillmentModel('fulfillment').notNull().default('pod'),
    positioning: text('positioning').notNull(),
    audience: text('audience').notNull(),
    /** Product types the Strategist recommends launching with. */
    productTypes: text('product_types')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** 0-100, same scale as niche scoring. */
    score: integer('score').notNull().default(0),
    /** Why this shop, why now, and why this fulfillment model over the alternatives. */
    rationale: text('rationale').notNull(),
    /** Estimated setup cost and monthly fixed cost, in cents, so the score is checkable. */
    setupCostCents: integer('setup_cost_cents'),
    monthlyFixedCostCents: integer('monthly_fixed_cost_cents'),
    /** Evidence the recommendation rests on: niche_product ids, urls, figures. */
    evidence: jsonb('evidence').notNull().default({}),
    status: text('status').notNull().default('proposed'),
    /** Set once the operator approves and the shop row is created. */
    shopId: uuid('shop_id').references(() => shops.id, { onDelete: 'set null' }),
    ...auditColumns,
  },
  (t) => [index('shop_proposals_status_idx').on(t.status), index('shop_proposals_niche_idx').on(t.nicheId)],
)

/**
 * A dropship or wholesale supplier.
 *
 * Only used by shops whose fulfillment is `dropship` or `hybrid`. Print-on-demand
 * shops are served by Printify and do not need rows here.
 */
export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** e.g. 'cj_dropshipping', 'spocket', 'direct'. Free text until one is integrated. */
    platform: text('platform').notNull(),
    url: text('url'),
    country: text('country'),
    /** Quoted handling + shipping time to the US, in days. Drives the ETA copy. */
    shipDaysMin: integer('ship_days_min'),
    shipDaysMax: integer('ship_days_max'),
    /** Operator's own notes: reliability, returns handling, who to email. */
    notes: text('notes'),
    active: boolean('active').notNull().default(true),
    ...auditColumns,
  },
  (t) => [index('suppliers_active_idx').on(t.active)],
)
