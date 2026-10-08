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

import {
  agentAutonomy,
  agentStatus,
  divisionStatus,
  goalStatus,
  userRole,
} from './enums'

/**
 * Columns every core row carries.
 *
 * `actor` is who wrote the row — `agent:<id>` or `user:<id>` (SPEC.md §Core data
 * model). It is text rather than a foreign key so an agent that is later retired does
 * not drag its history with it.
 */
export const auditColumns = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  actor: text('actor').notNull().default('system'),
}

/** One row today. Roles exist so a second user is a row, not a refactor. */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    role: userRole('role').notNull().default('owner'),
    settings: jsonb('settings').notNull().default({}),
    ...auditColumns,
  },
  (t) => [uniqueIndex('users_email_idx').on(t.email)],
)

/**
 * Maps a credential NAME to the env var that holds it.
 *
 * The value never lives here. Tools resolve a name to an env key at call time, so an
 * agent's prompt and its tool logs can reference `printify_token` without the secret
 * ever entering the database, a prompt, or an event.
 */
export const credentials = pgTable(
  'credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    divisionId: uuid('division_id'),
    name: text('name').notNull(),
    /** The env var to read, e.g. `PRINTIFY_API_TOKEN`. Never the value itself. */
    envKey: text('env_key').notNull(),
    description: text('description'),
    ...auditColumns,
  },
  (t) => [uniqueIndex('credentials_division_name_idx').on(t.divisionId, t.name)],
)

/**
 * One row per installed module, written by its `module.ts` on boot.
 *
 * The floor and the inbox are rendered from these rows, which is why a new division
 * appears on screen without any UI work.
 */
export const modules = pgTable(
  'modules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    version: text('version').notNull(),
    description: text('description'),
    /** `{key, label, agentKey, counterQuery}[]` — one station per entry. */
    stations: jsonb('stations').notNull().default([]),
    /** `{kind, label, cardComponent, neverAuto?}[]` — what this module may propose. */
    approvalKinds: jsonb('approval_kinds').notNull().default([]),
    toolNames: text('tool_names')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    enabled: boolean('enabled').notNull().default(true),
    ...auditColumns,
  },
  (t) => [uniqueIndex('modules_name_idx').on(t.name)],
)

/**
 * One business.
 *
 * A module can back several divisions — two POD shops in different niches are two
 * divisions on one module.
 */
export const divisions = pgTable(
  'divisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    moduleId: uuid('module_id').references(() => modules.id, { onDelete: 'restrict' }),
    /** Free text so a new kind of business needs no core migration. */
    type: text('type').notNull().default('generic'),
    status: divisionStatus('status').notNull().default('planning'),
    goalSummary: text('goal_summary'),
    /** Module-specific settings, shaped by that module's Zod config schema. */
    config: jsonb('config').notNull().default({}),
    /** Daily spend ceiling in cents. Breaching it pauses this division's agents. */
    dailySpendCapCents: integer('daily_spend_cap_cents').notNull().default(2500),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex('divisions_slug_idx').on(t.slug),
    index('divisions_status_idx').on(t.status),
  ],
)

/**
 * An agent is a ROW, not code.
 *
 * Its name, purpose, prompt, tools, schedule and autonomy all live here so the
 * operator can create, retune or retire one from the registry page without a deploy.
 * The module supplies only the `run` function, found via `moduleAgentKey`.
 */
export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    divisionId: uuid('division_id')
      .notNull()
      .references(() => divisions.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    /** Shown on the station and injected into every prompt this agent receives. */
    purpose: text('purpose'),
    /**
     * Which `run` function from the module to call. `generic` means prompt-only,
     * using core tools, with no module code behind it.
     */
    moduleAgentKey: text('module_agent_key').notNull().default('generic'),
    model: text('model').notNull(),
    systemPrompt: text('system_prompt').notNull().default(''),
    /** Names from the shared tool catalog. The runtime refuses calls outside this. */
    tools: text('tools')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** A cron expression, or `event:<name>`, or empty for manual-only. */
    schedule: text('schedule'),
    autonomy: agentAutonomy('autonomy').notNull().default('propose'),
    status: agentStatus('status').notNull().default('active'),
    /** May this agent read other divisions' data? Off by default. */
    crossDivision: boolean('cross_division').notNull().default(false),
    maxSteps: integer('max_steps').notNull().default(12),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    ...auditColumns,
  },
  (t) => [
    index('agents_division_idx').on(t.divisionId),
    index('agents_status_schedule_idx').on(t.status, t.schedule),
    uniqueIndex('agents_division_name_idx').on(t.divisionId, t.name),
  ],
)

/** Injected into every prompt, with current vs target, so agents know what matters. */
export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    divisionId: uuid('division_id')
      .notNull()
      .references(() => divisions.id, { onDelete: 'cascade' }),
    /** Null means the goal belongs to the whole division. */
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    statement: text('statement').notNull(),
    /** What is counted, e.g. `products_live`, `revenue_cents`. */
    metric: text('metric'),
    target: integer('target'),
    current: integer('current').notNull().default(0),
    deadline: timestamp('deadline', { withTimezone: true }),
    status: goalStatus('status').notNull().default('active'),
    ...auditColumns,
  },
  (t) => [index('goals_division_status_idx').on(t.divisionId, t.status)],
)
