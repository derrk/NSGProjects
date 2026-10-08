import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
  vector,
} from 'drizzle-orm/pg-core'

import { entityType, eventLevel, ledgerKind, opportunityRisk, opportunityStatus } from './enums'
import { agents, auditColumns, divisions } from './registry'

/**
 * Generic records, so a new division has somewhere to write before it earns dedicated
 * tables. Customers, leads, suppliers, listings, inventory and assets all live here;
 * a module promotes what it needs into its own schema and keeps the entity row as the
 * cross-division handle.
 */
export const entities = pgTable(
  'entities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    divisionId: uuid('division_id')
      .notNull()
      .references(() => divisions.id, { onDelete: 'cascade' }),
    type: entityType('type').notNull(),
    name: text('name').notNull(),
    /** Ids in other systems: `{shopify: "...", printify: "...", ebay: "..."}`. */
    externalIds: jsonb('external_ids').notNull().default({}),
    attributes: jsonb('attributes').notNull().default({}),
    embedding: vector('embedding', { dimensions: 1536 }),
    ...auditColumns,
  },
  (t) => [
    index('entities_division_type_idx').on(t.divisionId, t.type),
    index('entities_name_idx').on(t.name),
  ],
)

/**
 * Anything worth money that someone could act on.
 *
 * Written by scout agents in ANY division and scored by one shared formula, so the
 * Company screen can rank a card lot against an agency lead against a new product
 * line. This is also where "we should open a new division" lands.
 */
export const opportunities = pgTable(
  'opportunities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Null when the opportunity does not belong to an existing division yet. */
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    source: text('source').notNull(),
    title: text('title').notNull(),
    url: text('url'),
    summary: text('summary').notNull(),
    estProfitCents: integer('est_profit_cents'),
    /** 0-1. */
    confidence: real('confidence').notNull().default(0.5),
    risk: opportunityRisk('risk').notNull().default('med'),
    hoursRequired: real('hours_required'),
    /** expected profit x confidence / (hours x risk weight). Ranked on the Company screen. */
    score: real('score').notNull().default(0),
    status: opportunityStatus('status').notNull().default('new'),
    evaluatedBy: text('evaluated_by'),
    /** Evidence the estimate rests on, so a score can be re-derived not re-researched. */
    evidence: jsonb('evidence').notNull().default({}),
    ...auditColumns,
  },
  (t) => [
    index('opportunities_status_score_idx').on(t.status, t.score),
    index('opportunities_division_idx').on(t.divisionId),
  ],
)

/**
 * Append-only accounting. Never updated, never deleted.
 *
 * Revenue, cash flow, margin and net worth are all views over this table, so a
 * correction is a new row, not an edit — which is what makes the numbers auditable.
 */
export const ledger = pgTable(
  'ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    divisionId: uuid('division_id')
      .notNull()
      .references(() => divisions.id, { onDelete: 'cascade' }),
    kind: ledgerKind('kind').notNull(),
    /**
     * Real money, in exact integer cents, SIGNED by its effect on the company.
     *
     * Revenue is positive; cogs, expense and api_cost are posted NEGATIVE. A refund is
     * a negative `revenue` row, not a positive `expense` one. Every dashboard view
     * depends on this, so margin and net cash are plain SUMs and no view has to know
     * which kinds to flip. Correcting a mistake means posting another row, never
     * editing one: this table is append-only, which is what makes it auditable.
     */
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    currency: text('currency').notNull().default('USD'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    source: text('source').notNull(),
    description: text('description'),
    refTable: text('ref_table'),
    refId: text('ref_id'),
    ...auditColumns,
  },
  (t) => [
    index('ledger_division_occurred_idx').on(t.divisionId, t.occurredAt),
    index('ledger_kind_idx').on(t.kind),
  ],
)

/**
 * Append-only event log and the command center's realtime feed.
 *
 * Kinds are namespaced (`task.created`, `agent.run_ok`, `pod.product_published`) so
 * the floor filters per station without parsing messages. Nothing except the UI reads
 * events; no logic branches on them.
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    /** Station key for module events; `orchestrator` or `system` for core ones. */
    station: text('station'),
    kind: text('kind').notNull(),
    level: eventLevel('level').notNull().default('info'),
    message: text('message').notNull(),
    refTable: text('ref_table'),
    refId: text('ref_id'),
  },
  (t) => [
    index('events_ts_idx').on(t.ts),
    index('events_division_ts_idx').on(t.divisionId, t.ts),
    index('events_agent_ts_idx').on(t.agentId, t.ts),
    index('events_level_idx').on(t.level),
  ],
)
