import {
  boolean,
  doublePrecision,
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

import { memoryKind, runStatus, taskSource, taskStatus } from './enums'
import { agents, auditColumns, divisions } from './registry'

/**
 * The universal work queue.
 *
 * A task is the ONLY unit of work. An operator request, a schedule tick, a webhook
 * and an agent's own subtask all become rows here, which is what lets one generic
 * `task.run` job serve every division.
 */
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    divisionId: uuid('division_id')
      .notNull()
      .references(() => divisions.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    /** Set when an agent spawned this as a subtask. */
    parentTaskId: uuid('parent_task_id'),
    title: text('title').notNull(),
    input: jsonb('input').notNull().default({}),
    output: jsonb('output'),
    status: taskStatus('status').notNull().default('queued'),
    source: taskSource('source').notNull().default('schedule'),
    /** Higher runs first. Operator-sourced tasks jump the queue regardless. */
    priority: integer('priority').notNull().default(0),
    dueAt: timestamp('due_at', { withTimezone: true }),
    /** Set while the task is `blocked`, so the inbox can say what it is waiting on. */
    blockedOnApprovalId: uuid('blocked_on_approval_id'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    ...auditColumns,
  },
  (t) => [
    index('tasks_status_priority_idx').on(t.status, t.priority, t.createdAt),
    index('tasks_division_status_idx').on(t.divisionId, t.status),
    index('tasks_agent_idx').on(t.agentId),
    index('tasks_parent_idx').on(t.parentTaskId),
  ],
)

/** One row per agent invocation. The audit trail, as distinct from memory. */
export const agentRuns = pgTable(
  'agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'cascade' }),
    status: runStatus('status').notNull().default('running'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    input: jsonb('input'),
    output: jsonb('output'),
    /** Every tool call with its arguments, bodies over 2 KB truncated. */
    toolCalls: jsonb('tool_calls').notNull().default([]),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    /**
     * Estimated API cost. Floating point on purpose: one run can cost a fraction of a
     * cent and this is an estimate from a price table. Real money — revenue, COGS,
     * prices — is integer cents in `ledger` and the module schemas.
     */
    costCents: doublePrecision('cost_cents').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    ...auditColumns,
  },
  (t) => [
    index('agent_runs_agent_started_idx').on(t.agentId, t.startedAt),
    index('agent_runs_status_idx').on(t.status),
    index('agent_runs_task_idx').on(t.taskId),
  ],
)

/**
 * What an agent chose to keep.
 *
 * Distinct from `agent_runs`, which is everything that happened. Before each run the
 * runtime recalls the top entries by cosine similarity to the task input, plus the
 * most recent `lesson` entries regardless of similarity — a lesson is worth loading
 * even when it does not resemble today's task.
 */
export const agentMemory = pgTable(
  'agent_memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    divisionId: uuid('division_id')
      .notNull()
      .references(() => divisions.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    kind: memoryKind('kind').notNull(),
    content: text('content').notNull(),
    /** text-embedding dimension. Null until the embedding call succeeds. */
    embedding: vector('embedding', { dimensions: 1536 }),
    /** 0-1. The weekly prune drops anything below 0.2 that is older than 60 days. */
    importance: real('importance').notNull().default(0.5),
    /** Pinned memories always load, whatever the similarity score. */
    pinned: boolean('pinned').notNull().default(false),
    ...auditColumns,
  },
  (t) => [
    index('agent_memory_agent_idx').on(t.agentId),
    index('agent_memory_kind_idx').on(t.agentId, t.kind, t.createdAt),
  ],
)
