import { sql } from 'drizzle-orm'
import {
  boolean,
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

import { approvalDecision } from './enums'
import { auditColumns, divisions } from './registry'
import { tasks } from './work'

/**
 * The one inbox, across every division.
 *
 * `kind` is text, not an enum: it must be registered in `modules.approval_kinds`, so a
 * new module adds approval kinds without a core migration. The inbox renders the
 * module's card component for a known kind and a generic JSON card otherwise.
 */
export const approvals = pgTable(
  'approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    divisionId: uuid('division_id')
      .notNull()
      .references(() => divisions.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    /** The graduated-autonomy bucket within this kind. */
    category: text('category').notNull(),
    /** What this approval is about, as a table name plus id rather than a FK. */
    refTable: text('ref_table').notNull(),
    refId: text('ref_id').notNull(),
    summary: text('summary').notNull(),
    payload: jsonb('payload').notNull(),
    decision: approvalDecision('decision').notNull().default('pending'),
    /** True when the gate decided this without showing it to the operator. */
    autoDecided: boolean('auto_decided').notNull().default(false),
    editPayload: jsonb('edit_payload'),
    /** The task to resume once this is decided. */
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    requestedBy: text('requested_by').notNull(),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    ...auditColumns,
  },
  (t) => [
    index('approvals_decision_division_idx').on(t.decision, t.divisionId),
    index('approvals_kind_idx').on(t.kind),
    index('approvals_task_idx').on(t.taskId),
    /**
     * Idempotency for `requestApproval`, enforced in the database as well as in code:
     * at most one LIVE proposal per (division, kind, ref). Partial, so a rejected
     * proposal can legitimately be re-proposed later.
     */
    uniqueIndex('approvals_live_ref_idx')
      .on(t.divisionId, t.kind, t.refTable, t.refId)
      .where(sql`${t.decision} <> 'rejected'`),
  ],
)

/**
 * Graduated autonomy per (division, kind, category).
 *
 * Counters move on OPERATOR decisions only. If a category's own auto-approvals
 * counted, its approval rate would sit at 100% forever and could never be re-tested
 * against real operator judgement.
 */
export const approvalRules = pgTable(
  'approval_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    divisionId: uuid('division_id')
      .notNull()
      .references(() => divisions.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    category: text('category').notNull(),
    approvedCount: integer('approved_count').notNull().default(0),
    rejectedCount: integer('rejected_count').notNull().default(0),
    /**
     * An operator edit is not a clean approval — it means the output was close but not
     * shippable — so it counts against the rate without being a rejection.
     */
    editedCount: integer('edited_count').notNull().default(0),
    thresholdCount: integer('threshold_count').notNull().default(20),
    thresholdRate: real('threshold_rate').notNull().default(0.95),
    autoEnabled: boolean('auto_enabled').notNull().default(false),
    /**
     * Absolute. Set by the module (`neverAuto` on an approval kind) or by the operator.
     * Checked before graduation, so a category that has earned autonomy still cannot
     * auto-run refunds, large price changes or purchases.
     */
    neverAuto: boolean('never_auto').notNull().default(false),
    ...auditColumns,
  },
  (t) => [uniqueIndex('approval_rules_scope_idx').on(t.divisionId, t.kind, t.category)],
)
