import { pgEnum } from 'drizzle-orm/pg-core'

/**
 * Core enums only.
 *
 * Note what is deliberately NOT an enum: `approvals.kind`, `agents.model`,
 * `agents.schedule`, `divisions.type` and `entities.type` are all text. A module
 * registers its own approval kinds in `modules.approval_kinds`, and a new module must
 * never require a core migration — that is what keeps a division droppable.
 */

export const userRole = pgEnum('user_role', ['owner', 'operator', 'viewer'])

export const divisionStatus = pgEnum('division_status', [
  'planning',
  'active',
  'paused',
  'closed',
])

/**
 * How much an agent may do on its own (SPEC.md §Agent framework).
 *
 * Every new agent starts at `propose`. `auto` is earned per category through
 * `approval_rules`, never granted wholesale.
 */
export const agentAutonomy = pgEnum('agent_autonomy', ['propose', 'act_with_approval', 'auto'])

export const agentStatus = pgEnum('agent_status', ['active', 'paused', 'retired'])

/** `blocked` means waiting on an approval or a parent task. */
export const taskStatus = pgEnum('task_status', [
  'queued',
  'running',
  'blocked',
  'done',
  'failed',
])

export const taskSource = pgEnum('task_source', ['schedule', 'event', 'operator', 'agent'])

export const runStatus = pgEnum('run_status', ['running', 'ok', 'error'])

/** What an agent chose to remember. Run history is the audit trail; this is memory. */
export const memoryKind = pgEnum('memory_kind', ['decision', 'result', 'lesson', 'fact'])

export const approvalDecision = pgEnum('approval_decision', [
  'pending',
  'approved',
  'rejected',
  'edited',
])

export const opportunityRisk = pgEnum('opportunity_risk', ['low', 'med', 'high'])

export const opportunityStatus = pgEnum('opportunity_status', [
  'new',
  'reviewed',
  'pursuing',
  'shelved',
  'done',
])

export const entityType = pgEnum('entity_type', [
  'customer',
  'lead',
  'supplier',
  'listing',
  'inventory_item',
  'asset',
])

/** Append-only accounting. Revenue, cash flow and net worth are views over this. */
export const ledgerKind = pgEnum('ledger_kind', [
  'revenue',
  'cogs',
  'expense',
  'api_cost',
  'asset',
  'liability',
])

export const eventLevel = pgEnum('event_level', ['info', 'warn', 'error'])

export const goalStatus = pgEnum('goal_status', ['active', 'met', 'missed', 'abandoned'])
