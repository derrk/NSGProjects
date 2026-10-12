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

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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

/** This module's migration folder, applied after core's. */
export const POD_MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle')

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
  'poster',
  // Dropshipped goods are not a product type we print, so there is nothing to
  // enumerate: what matters about them is the supplier SKU, not the blueprint.
  'other',
])

export const orderStatus = pgEnum('pod_order_status', [
  'received',
  /**
   * Held for a human to read what the buyer typed.
   *
   * Distinct from `issue` on purpose: nothing has gone wrong, and filing it as an
   * exception would bury it in the queue the operator scans for actual failures.
   */
  'needs_review',
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
  (t) => [
    // Per DIVISION, not globally. Two divisions can both find "dog people"; only one
    // of them can own the name, and whichever scout ran second used to overwrite the
    // other division's row with its own score. See drizzle/0003.
    uniqueIndex('pod_niches_name_idx').on(t.divisionId, t.name),
    index('pod_niches_status_idx').on(t.status),
  ],
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
  (t) => [
    // Per DIVISION. Keyed on phrase alone, the first division seeded took all ten
    // phrases and every later one took none — an IP gate that reads as on and is
    // empty. See drizzle/0003.
    uniqueIndex('pod_blocked_phrases_idx').on(t.divisionId, t.phrase),
  ],
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

/* ------------------------------------------------------------------ *
 * Commerce: suppliers, order lines, supplier orders
 *
 * Added for the Etsy + Shopify commerce brief. The existing `orders` table above
 * stays as the channel-level record; these carry what routing and fulfilment need.
 * ------------------------------------------------------------------ */

export const salesChannel = pgEnum('pod_sales_channel', ['etsy', 'shopify'])

export const fulfillmentKind = pgEnum('pod_fulfillment_kind', ['pod', 'dropship', 'in_house'])

/** Where an item physically comes from. POD partners and dropship suppliers both. */
export const suppliers = pod.table(
  'suppliers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    kind: fulfillmentKind('kind').notNull(),
    /** Shown on the listing. Etsy requires this for a production partner. */
    disclosureName: text('disclosure_name'),
    shipsFrom: text('ships_from'),
    /** Quoted handling plus transit, in days. Drives the honest delivery estimate. */
    shipDaysMin: integer('ship_days_min'),
    shipDaysMax: integer('ship_days_max'),
    returnsPolicy: text('returns_policy'),
    /** When the cost and stock figures were last confirmed. Stale data blocks listing. */
    dataConfirmedAt: timestamp('data_confirmed_at', { withTimezone: true }),
    approved: boolean('approved').notNull().default(false),
    notes: text('notes'),
    ...moduleAudit,
  },
  (t) => [uniqueIndex('pod_suppliers_name_idx').on(t.divisionId, t.name)],
)

/**
 * One line of one order.
 *
 * The unique index on (channel, channel_order_id, channel_line_item_id) is what makes
 * ingestion idempotent: a webhook delivered three times inserts once. Doing this in
 * the database rather than in code means it holds even when two workers race.
 */
export const orderLines = pod.table(
  'order_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    channel: salesChannel('channel').notNull(),
    channelOrderId: text('channel_order_id').notNull(),
    channelLineItemId: text('channel_line_item_id').notNull(),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    sku: text('sku'),
    quantity: integer('quantity').notNull().default(1),
    unitPriceCents: integer('unit_price_cents').notNull().default(0),
    /** Buyer-supplied text, names or image urls for a personalised item. */
    personalization: jsonb('personalization'),
    personalized: boolean('personalized').notNull().default(false),
    personalizationReviewedAt: timestamp('personalization_reviewed_at', { withTimezone: true }),
    personalizationReviewedBy: text('personalization_reviewed_by'),
    ...moduleAudit,
  },
  (t) => [
    uniqueIndex('pod_order_lines_channel_ref_idx').on(
      t.channel,
      t.channelOrderId,
      t.channelLineItemId,
    ),
    index('pod_order_lines_order_idx').on(t.orderId),
  ],
)

export const supplierOrderStatus = pgEnum('pod_supplier_order_status', [
  'ready_to_route',
  'submitted',
  'in_production',
  'shipped',
  'delivered',
  'exception',
  'cancelled',
])

/**
 * Our request to a supplier to make and ship one line.
 *
 * Separate from the order line because an order line can be re-sent after a supplier
 * failure, and because "we told the supplier" is emphatically not "the customer has
 * it". The unique index on order_line_id prevents paying twice for one line.
 */
export const supplierOrders = pod.table(
  'supplier_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderLineId: uuid('order_line_id')
      .notNull()
      .references(() => orderLines.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    /** The supplier's own id for the job. */
    externalId: text('external_id'),
    status: supplierOrderStatus('status').notNull().default('ready_to_route'),
    costCents: integer('cost_cents'),
    /** Why it is stuck, when it is. Shown in the exception queue. */
    exceptionReason: text('exception_reason'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    trackingNumber: text('tracking_number'),
    trackingUrl: text('tracking_url'),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    ...moduleAudit,
  },
  (t) => [
    // One supplier order per line. Retrying submission must never charge twice.
    uniqueIndex('pod_supplier_orders_line_idx').on(t.orderLineId),
    index('pod_supplier_orders_status_idx').on(t.status),
  ],
)

/** One listing of one product on one channel. A product can live on both. */
export const channelListings = pod.table(
  'channel_listings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    channel: salesChannel('channel').notNull(),
    fulfillment: fulfillmentKind('fulfillment').notNull(),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    /** The platform's own id, stored after creation to prevent duplicates. */
    externalListingId: text('external_listing_id'),
    externalUrl: text('external_url'),
    originalDesign: boolean('original_design').notNull().default(false),
    personalized: boolean('personalized').notNull().default(false),
    aiAssisted: boolean('ai_assisted').notNull().default(false),
    provenanceNote: text('provenance_note'),
    productionPartner: text('production_partner'),
    shipsFrom: text('ships_from'),
    status: productStatus('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...moduleAudit,
  },
  (t) => [
    uniqueIndex('pod_channel_listings_product_channel_idx').on(t.productId, t.channel),
    uniqueIndex('pod_channel_listings_external_idx').on(t.channel, t.externalListingId),
  ],
)
