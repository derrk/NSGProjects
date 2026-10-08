/**
 * Division one's own tables, in the `pod` Postgres schema.
 *
 * The rule that keeps a division removable: a module's tables may reference core rows
 * by id, but core never references a module table. Drop the `pod` schema and the core
 * OS still runs.
 *
 * Anything another division might need — a customer, a listing, a sale — is ALSO
 * written to core `entities` and `ledger`. These tables hold what only the POD store
 * cares about.
 */

import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const pod = pgSchema('pod')

/* ------------------------------------------------------------------ *
 * Enums (namespaced so they cannot collide with another module's)
 * ------------------------------------------------------------------ */

export const nicheStatus = pgEnum('pod_niche_status', [
  'proposed',
  'approved',
  'rejected',
  'exhausted',
])

export const ipRisk = pgEnum('pod_ip_risk', ['low', 'medium', 'high'])

export const conceptStatus = pgEnum('pod_concept_status', [
  'proposed',
  'approved',
  'rejected',
  'designed',
  'needs_human',
])

export const designStyle = pgEnum('pod_design_style', [
  'flat-vector',
  'hand-lettered',
  'retro-badge',
  'line-art',
  'watercolor',
])

export const designStatus = pgEnum('pod_design_status', [
  'generated',
  'pending_approval',
  'approved',
  'rejected',
])

export const productStatus = pgEnum('pod_product_status', [
  'draft',
  'pending_approval',
  'published',
  'paused',
  'retired',
  'rejected',
])

export const productType = pgEnum('pod_product_type', [
  'mug_11oz',
  'mug_15oz',
  'tee',
  'sweatshirt',
  'hoodie',
])

export const orderStatus = pgEnum('pod_order_status', [
  'received',
  'in_production',
  'shipped',
  'delivered',
  'issue',
  'refunded',
])

export const messageChannel = pgEnum('pod_message_channel', ['gmail', 'shopify_inbox'])

export const messageIntent = pgEnum('pod_message_intent', [
  'shipping_eta',
  'sizing',
  'tracking',
  'refund',
  'complaint',
  'custom',
  'other',
])

export const messageStatus = pgEnum('pod_message_status', [
  'new',
  'drafted',
  'sent',
  'escalated',
  'closed',
])

export const replyStatus = pgEnum('pod_reply_status', ['pending_approval', 'sent', 'rejected'])

/* ------------------------------------------------------------------ *
 * Tables
 * ------------------------------------------------------------------ */

const moduleAudit = {
  /** Which division owns this row. Not a FK: core never depends on pod. */
  divisionId: uuid('division_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  actor: text('actor').notNull().default('system'),
}

/** A market worth selling into. Scout evidence, with source urls, not a recommendation. */
export const niches = pod.table(
  'niches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    keywords: text('keywords')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    audience: text('audience'),
    season: text('season'),
    /** 0-100 composite of demand, competition, giftability and IP safety. */
    score: integer('score').notNull().default(0),
    scoreBreakdown: jsonb('score_breakdown').notNull().default({}),
    rationale: text('rationale'),
    status: nicheStatus('status').notNull().default('proposed'),
    sourceUrls: text('source_urls')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** The core opportunities row this niche was also written to. */
    opportunityId: uuid('opportunity_id'),
    ...moduleAudit,
  },
  (t) => [uniqueIndex('pod_niches_name_idx').on(t.name), index('pod_niches_status_idx').on(t.status)],
)

/** One design idea. Approval gate #1. */
export const concepts = pod.table(
  'concepts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nicheId: uuid('niche_id').references(() => niches.id, { onDelete: 'set null' }),
    /** The core task that produced this, so the chain is reconstructible. */
    taskId: uuid('task_id'),
    title: text('title').notNull(),
    promptBrief: text('prompt_brief').notNull(),
    style: designStyle('style').notNull(),
    products: text('products')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    audience: text('audience'),
    whyNow: text('why_now'),
    ipRisk: ipRisk('ip_risk').notNull().default('low'),
    ipNotes: text('ip_notes'),
    status: conceptStatus('status').notNull().default('proposed'),
    ...moduleAudit,
  },
  (t) => [
    index('pod_concepts_status_idx').on(t.status),
    index('pod_concepts_division_idx').on(t.divisionId),
  ],
)

/** One generated variant. Three per concept; the operator picks one. */
export const designs = pod.table(
  'designs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conceptId: uuid('concept_id')
      .notNull()
      .references(() => concepts.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id'),
    variantNo: integer('variant_no').notNull(),
    imageUrl: text('image_url').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    /** Print-resolution file, produced only after the operator picks this variant. */
    printUrl: text('print_url'),
    sourceModel: text('source_model').notNull(),
    genPrompt: text('gen_prompt').notNull(),
    seed: text('seed'),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    dpi: integer('dpi').notNull().default(72),
    textCheckPassed: text('text_check_passed'),
    status: designStatus('status').notNull().default('generated'),
    ...moduleAudit,
  },
  (t) => [
    uniqueIndex('pod_designs_concept_variant_idx').on(t.conceptId, t.variantNo),
    index('pod_designs_status_idx').on(t.status),
  ],
)

/** One design on one product type. Approval gate #2. */
export const products = pod.table(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    designId: uuid('design_id').references(() => designs.id, { onDelete: 'set null' }),
    /** The core entities row for this listing, so other divisions can see it. */
    entityId: uuid('entity_id'),
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
    /** Real money: exact integer cents. */
    priceCents: integer('price_cents').notNull(),
    costCents: integer('cost_cents').notNull(),
    mockupUrls: text('mockup_urls')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: productStatus('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...moduleAudit,
  },
  (t) => [
    index('pod_products_division_status_idx').on(t.divisionId, t.status),
    uniqueIndex('pod_products_printify_idx').on(t.printifyProductId),
  ],
)

export const orders = pod.table(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The core entities row for the customer. */
    customerEntityId: uuid('customer_entity_id'),
    shopifyOrderId: text('shopify_order_id'),
    printifyOrderId: text('printify_order_id'),
    orderNumber: text('order_number'),
    customerEmail: text('customer_email'),
    totalCents: integer('total_cents').notNull().default(0),
    costCents: integer('cost_cents').notNull().default(0),
    status: orderStatus('status').notNull().default('received'),
    trackingUrl: text('tracking_url'),
    trackingNumber: text('tracking_number'),
    /** Raw Printify status, so an unexpected value is never silently lost. */
    printifyStatus: text('printify_status'),
    issueNotes: text('issue_notes'),
    placedAt: timestamp('placed_at', { withTimezone: true }),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    ...moduleAudit,
  },
  (t) => [
    index('pod_orders_division_status_idx').on(t.divisionId, t.status),
    uniqueIndex('pod_orders_shopify_idx').on(t.shopifyOrderId),
    index('pod_orders_email_idx').on(t.customerEmail),
  ],
)

export const messages = pod.table(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channel: messageChannel('channel').notNull(),
    externalId: text('external_id').notNull(),
    threadId: text('thread_id'),
    fromEmail: text('from_email'),
    subject: text('subject'),
    body: text('body').notNull(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    intent: messageIntent('intent'),
    status: messageStatus('status').notNull().default('new'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    ...moduleAudit,
  },
  (t) => [
    uniqueIndex('pod_messages_channel_external_idx').on(t.channel, t.externalId),
    index('pod_messages_status_idx').on(t.status),
  ],
)

/** Approval gate #3. */
export const replies = pod.table(
  'replies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    autoSent: boolean('auto_sent').notNull().default(false),
    status: replyStatus('status').notNull().default('pending_approval'),
    /** Order data the draft cited, so a wrong promise can be traced back. */
    citedData: jsonb('cited_data').notNull().default({}),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    ...moduleAudit,
  },
  (t) => [index('pod_replies_message_idx').on(t.messageId)],
)

/**
 * Phrases no concept or listing may contain.
 *
 * SPEC.md applies this to every design-producing agent, not only this module, so it
 * will move to core when a second such division exists. It lives here until then
 * rather than inventing a core table with one consumer.
 */
export const blockedPhrases = pod.table(
  'blocked_phrases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phrase: text('phrase').notNull(),
    reason: text('reason'),
    ...moduleAudit,
  },
  (t) => [uniqueIndex('pod_blocked_phrases_idx').on(t.phrase)],
)

/** Per-product-type pricing, editable from the division's settings. */
export const pricingRules = pod.table(
  'pricing_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productType: text('product_type').notNull(),
    markupMultiple: real('markup_multiple').notNull().default(2.2),
    /** Rounding target in cents, e.g. 99 to land on .99 prices. */
    roundToCents: integer('round_to_cents').notNull().default(99),
    minPriceCents: integer('min_price_cents'),
    maxPriceCents: integer('max_price_cents'),
    blueprintId: integer('blueprint_id'),
    printProviderId: integer('print_provider_id'),
    ...moduleAudit,
  },
  (t) => [uniqueIndex('pod_pricing_rules_idx').on(t.divisionId, t.productType)],
)
