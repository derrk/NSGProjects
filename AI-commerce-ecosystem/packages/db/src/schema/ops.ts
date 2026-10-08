import { sql } from 'drizzle-orm'
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { agentTrigger, approvalDecision, approvalKind, eventLevel, runStatus } from './enums.js'
import { auditColumns, shops } from './shops.js'

/** The single inbox the operator works. Mirrors `ApprovalRow` in @acf/core. */
export const approvals = pgTable(
  'approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id').references(() => shops.id, { onDelete: 'cascade' }),
    kind: approvalKind('kind').notNull(),
    /** Graduated-autonomy bucket: niche type, reply intent, product type, ... */
    category: text('category').notNull(),
    refId: text('ref_id').notNull(),
    summary: text('summary').notNull(),
    payload: jsonb('payload').notNull(),
    decision: approvalDecision('decision').notNull().default('pending'),
    /** True when the gate decided this without showing it to the operator. */
    autoDecided: boolean('auto_decided').notNull().default(false),
    editPayload: jsonb('edit_payload'),
    requestedBy: text('requested_by').notNull(),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    ...auditColumns,
  },
  (t) => [
    index('approvals_decision_kind_idx').on(t.decision, t.kind),
    index('approvals_shop_idx').on(t.shopId),
    /**
     * Idempotency for `requestApproval`: at most one live proposal per (kind, refId).
     * Partial, so a rejected proposal can legitimately be re-proposed later.
     */
    uniqueIndex('approvals_live_ref_idx')
      .on(t.kind, t.refId)
      .where(sql`${t.decision} <> 'rejected'`),
  ],
)

/** Graduated-autonomy counters per (kind, category). Only operator decisions count. */
export const approvalRules = pgTable(
  'approval_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: approvalKind('kind').notNull(),
    category: text('category').notNull(),
    approvedCount: integer('approved_count').notNull().default(0),
    rejectedCount: integer('rejected_count').notNull().default(0),
    /** An edit is not a clean approval; it counts against the rate on its own. */
    editedCount: integer('edited_count').notNull().default(0),
    autoEnabled: boolean('auto_enabled').notNull().default(false),
    /** Decisions needed before graduating. 20 by default, 50 for designs. */
    threshold: integer('threshold').notNull().default(20),
    requiredRate: real('required_rate').notNull().default(0.95),
    ...auditColumns,
  },
  (t) => [uniqueIndex('approval_rules_kind_category_idx').on(t.kind, t.category)],
)

/** One row per agent invocation, written by the agent run wrapper. */
export const agentRuns = pgTable(
  'agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agent: text('agent').notNull(),
    shopId: uuid('shop_id').references(() => shops.id, { onDelete: 'set null' }),
    trigger: agentTrigger('trigger').notNull(),
    status: runStatus('status').notNull().default('running'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    input: jsonb('input'),
    output: jsonb('output'),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    /**
     * Estimated API cost. Floating point on purpose: a single run can cost a fraction
     * of a cent, and this is an estimate from a price table, not ledger money. Revenue
     * and COGS are integer cents elsewhere in this schema.
     */
    costCents: doublePrecision('cost_cents').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    ...auditColumns,
  },
  (t) => [
    index('agent_runs_agent_started_idx').on(t.agent, t.startedAt),
    index('agent_runs_status_idx').on(t.status),
  ],
)

/**
 * Append-only audit log and the command center's realtime feed.
 *
 * Retention is 90 days, pruned nightly (SPEC.md §Event log).
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
    agent: text('agent').notNull(),
    /** Namespaced, e.g. `scout.proposed`, `designer.generated`, `health.stale`. */
    kind: text('kind').notNull(),
    level: eventLevel('level').notNull().default('info'),
    message: text('message').notNull(),
    refTable: text('ref_table'),
    refId: text('ref_id'),
    shopId: uuid('shop_id').references(() => shops.id, { onDelete: 'cascade' }),
  },
  (t) => [
    index('events_ts_idx').on(t.ts),
    index('events_agent_ts_idx').on(t.agent, t.ts),
    index('events_level_idx').on(t.level),
  ],
)

/** Rolled up nightly by the Finance agent. */
export const dailyMetrics = pgTable(
  'daily_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    revenueCents: integer('revenue_cents').notNull().default(0),
    cogsCents: integer('cogs_cents').notNull().default(0),
    orders: integer('orders').notNull().default(0),
    productsLive: integer('products_live').notNull().default(0),
    designsGenerated: integer('designs_generated').notNull().default(0),
    messagesHandled: integer('messages_handled').notNull().default(0),
    apiCostCents: doublePrecision('api_cost_cents').notNull().default(0),
    ...auditColumns,
  },
  (t) => [uniqueIndex('daily_metrics_shop_date_idx').on(t.shopId, t.date)],
)

/**
 * Phrases no concept or listing may contain — trademarked apparel slogans and the
 * like. Checked by the Scout and by Store ops (SPEC.md §IP and content guardrails).
 */
export const blockedPhrases = pgTable(
  'blocked_phrases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phrase: text('phrase').notNull(),
    reason: text('reason'),
    ...auditColumns,
  },
  (t) => [uniqueIndex('blocked_phrases_phrase_idx').on(t.phrase)],
)

/** Per-product-type pricing, editable from the settings screen. */
export const pricingRules = pgTable(
  'pricing_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id').references(() => shops.id, { onDelete: 'cascade' }),
    /** A `product_type` value, kept as text so a new type does not need a migration. */
    productType: text('product_type').notNull(),
    /** Multiple of Printify cost, e.g. 2.2. */
    markupMultiple: real('markup_multiple').notNull().default(2.2),
    /** Rounding target in cents, e.g. 99 to land on .99 prices. */
    roundToCents: integer('round_to_cents').notNull().default(99),
    minPriceCents: integer('min_price_cents'),
    maxPriceCents: integer('max_price_cents'),
    blueprintId: integer('blueprint_id'),
    printProviderId: integer('print_provider_id'),
    ...auditColumns,
  },
  (t) => [uniqueIndex('pricing_rules_shop_type_idx').on(t.shopId, t.productType)],
)

/**
 * Global key/value settings: the pause switch, per-API daily spend caps, agent prompt
 * overrides. One row per key so the settings screen can write them individually.
 */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by').notNull().default('system'),
})
