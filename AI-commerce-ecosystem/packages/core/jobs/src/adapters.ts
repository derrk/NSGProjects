/**
 * Database- and Inngest-backed implementations of the ports in @acf/core.
 *
 * The core logic — approval gate, run loop, health, registry — is written against
 * interfaces so it can be tested without any of this. This file is where it meets the
 * real world, and it is deliberately thin: mapping only, no decisions.
 */

import { and, desc, eq, sql } from 'drizzle-orm'
import type { Inngest } from 'inngest'

import type {
  ApprovalRow,
  ApprovalStore,
  Clock,
  EventBus,
  EventSink,
  RuleStore,
  SpendGuard,
  TaskGate,
} from '@acf/core/approvals'
import type {
  AgentRunRecord,
  AgentRunStore,
  LedgerPort,
  Sleeper,
  TaskStore,
} from '@acf/core/runtime'
import type {
  AgentStore,
  ApprovalRuleSeedStore,
  DivisionRow,
  DivisionStore,
  ModuleRow,
  ModuleStore,
  SeededAgent,
} from '@acf/core/modules'
import {
  agentRuns,
  agents,
  approvalRules,
  approvals,
  divisions,
  events,
  ledger,
  modules,
  tasks,
  type Database,
} from '@acf/db'

export const systemClock: Clock = { now: () => new Date() }

export const realSleeper: Sleeper = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

export const newId = (): string => crypto.randomUUID()

/* ------------------------------------------------------------------ *
 * Approvals
 * ------------------------------------------------------------------ */

type ApprovalRecord = typeof approvals.$inferSelect

function toApprovalRow(row: ApprovalRecord): ApprovalRow {
  return {
    id: row.id,
    divisionId: row.divisionId,
    kind: row.kind,
    category: row.category,
    refTable: row.refTable,
    refId: row.refId,
    summary: row.summary,
    payload: row.payload,
    decision: row.decision,
    autoDecided: row.autoDecided,
    editPayload: row.editPayload ?? null,
    taskId: row.taskId,
    requestedBy: row.requestedBy,
    decidedBy: row.decidedBy,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
  }
}

export function approvalStore(db: Database): ApprovalStore {
  return {
    async findByRef(divisionId, kind, refTable, refId) {
      const [row] = await db
        .select()
        .from(approvals)
        .where(
          and(
            eq(approvals.divisionId, divisionId),
            eq(approvals.kind, kind),
            eq(approvals.refTable, refTable),
            eq(approvals.refId, refId),
            sql`${approvals.decision} <> 'rejected'`,
          ),
        )
        .limit(1)
      return row ? toApprovalRow(row) : null
    },

    async insert(row) {
      const [inserted] = await db
        .insert(approvals)
        .values({
          id: row.id,
          divisionId: row.divisionId,
          kind: row.kind,
          category: row.category,
          refTable: row.refTable,
          refId: row.refId,
          summary: row.summary,
          payload: row.payload,
          decision: row.decision,
          autoDecided: row.autoDecided,
          editPayload: row.editPayload,
          taskId: row.taskId,
          requestedBy: row.requestedBy,
          decidedBy: row.decidedBy,
          createdAt: row.createdAt,
          decidedAt: row.decidedAt,
          actor: row.requestedBy,
        })
        .returning()
      if (!inserted) throw new Error(`failed to insert approval ${row.id}`)
      return toApprovalRow(inserted)
    },

    async findById(id) {
      const [row] = await db.select().from(approvals).where(eq(approvals.id, id)).limit(1)
      return row ? toApprovalRow(row) : null
    },

    async update(id, patch) {
      const [row] = await db
        .update(approvals)
        .set({
          ...(patch.decision === undefined ? {} : { decision: patch.decision }),
          ...(patch.decidedBy === undefined ? {} : { decidedBy: patch.decidedBy }),
          ...(patch.decidedAt === undefined ? {} : { decidedAt: patch.decidedAt }),
          ...(patch.editPayload === undefined ? {} : { editPayload: patch.editPayload }),
          updatedAt: new Date(),
        })
        .where(eq(approvals.id, id))
        .returning()
      if (!row) throw new Error(`approval ${id} not found`)
      return toApprovalRow(row)
    },
  }
}

export function ruleStore(db: Database): RuleStore {
  return {
    async get(divisionId, kind, category) {
      const [row] = await db
        .select()
        .from(approvalRules)
        .where(
          and(
            eq(approvalRules.divisionId, divisionId),
            eq(approvalRules.kind, kind),
            eq(approvalRules.category, category),
          ),
        )
        .limit(1)
      if (!row) return null
      return {
        divisionId: row.divisionId,
        kind: row.kind,
        category: row.category,
        approvedCount: row.approvedCount,
        rejectedCount: row.rejectedCount,
        editedCount: row.editedCount,
        autoEnabled: row.autoEnabled,
        thresholdCount: row.thresholdCount,
        thresholdRate: row.thresholdRate,
        neverAuto: row.neverAuto,
      }
    },

    async upsert(rule) {
      await db
        .insert(approvalRules)
        .values(rule)
        .onConflictDoUpdate({
          target: [approvalRules.divisionId, approvalRules.kind, approvalRules.category],
          set: {
            approvedCount: rule.approvedCount,
            rejectedCount: rule.rejectedCount,
            editedCount: rule.editedCount,
            autoEnabled: rule.autoEnabled,
            thresholdCount: rule.thresholdCount,
            thresholdRate: rule.thresholdRate,
            neverAuto: rule.neverAuto,
            updatedAt: new Date(),
          },
        })
      return rule
    },
  }
}

/* ------------------------------------------------------------------ *
 * Events, tasks, ledger
 * ------------------------------------------------------------------ */

export function eventSink(db: Database): EventSink {
  return {
    async emit(event) {
      await db.insert(events).values({
        divisionId: event.divisionId ?? null,
        agentId: event.agentId ?? null,
        station: event.station ?? null,
        kind: event.kind,
        level: event.level,
        message: event.message,
        refTable: event.refTable ?? null,
        refId: event.refId ?? null,
      })
    },
  }
}

export function eventBus(inngest: Inngest.Any): EventBus {
  return {
    async send(name, data) {
      await inngest.send({ name, data })
    },
  }
}

/** Marks a task blocked while its approval waits. */
export function taskGate(db: Database): TaskGate {
  return {
    async block(taskId, approvalId) {
      await db
        .update(tasks)
        .set({ status: 'blocked', blockedOnApprovalId: approvalId, updatedAt: new Date() })
        .where(eq(tasks.id, taskId))
    },
  }
}

export function taskStore(db: Database): TaskStore {
  return {
    async complete(taskId, output) {
      await db
        .update(tasks)
        .set({ status: 'done', output, finishedAt: new Date(), updatedAt: new Date() })
        .where(eq(tasks.id, taskId))
    },
    async fail(taskId, error) {
      await db
        .update(tasks)
        .set({ status: 'failed', error, finishedAt: new Date(), updatedAt: new Date() })
        .where(eq(tasks.id, taskId))
    },
  }
}

export function ledgerPort(db: Database): LedgerPort {
  return {
    async post(entry) {
      await db.insert(ledger).values({
        divisionId: entry.divisionId,
        kind: entry.kind,
        amountCents: entry.amountCents,
        source: entry.source,
        description: entry.description ?? null,
        refTable: entry.refTable ?? null,
        refId: entry.refId ?? null,
      })
    },
  }
}

/* ------------------------------------------------------------------ *
 * Agent runs
 * ------------------------------------------------------------------ */

export function agentRunStore(db: Database): AgentRunStore {
  return {
    async start(record) {
      const [row] = await db
        .insert(agentRuns)
        .values({
          agentId: record.agentId,
          taskId: record.taskId,
          divisionId: record.divisionId,
          status: record.status,
          startedAt: record.startedAt,
          finishedAt: record.finishedAt,
          input: record.input,
          output: record.output,
          toolCalls: record.toolCalls,
          tokensIn: record.tokensIn,
          tokensOut: record.tokensOut,
          costCents: record.costCents,
          attempts: record.attempts,
          error: record.error,
        })
        .returning()
      if (!row) throw new Error('failed to open an agent run')
      return row as unknown as AgentRunRecord
    },

    async finish(id, patch) {
      const [row] = await db
        .update(agentRuns)
        .set({
          ...(patch.status === undefined ? {} : { status: patch.status }),
          ...(patch.finishedAt === undefined ? {} : { finishedAt: patch.finishedAt }),
          ...(patch.output === undefined ? {} : { output: patch.output }),
          ...(patch.toolCalls === undefined ? {} : { toolCalls: patch.toolCalls }),
          ...(patch.tokensIn === undefined ? {} : { tokensIn: patch.tokensIn }),
          ...(patch.tokensOut === undefined ? {} : { tokensOut: patch.tokensOut }),
          ...(patch.costCents === undefined ? {} : { costCents: patch.costCents }),
          ...(patch.attempts === undefined ? {} : { attempts: patch.attempts }),
          ...(patch.error === undefined ? {} : { error: patch.error }),
          updatedAt: new Date(),
        })
        .where(eq(agentRuns.id, id))
        .returning()
      if (!row) throw new Error(`agent run ${id} not found`)
      return row as unknown as AgentRunRecord
    },
  }
}

/* ------------------------------------------------------------------ *
 * Registry
 * ------------------------------------------------------------------ */

export function moduleStore(db: Database): ModuleStore {
  return {
    async upsertByName(row) {
      const [inserted] = await db
        .insert(modules)
        .values({
          name: row.name,
          version: row.version,
          description: row.description,
          stations: row.stations,
          approvalKinds: row.approvalKinds,
          toolNames: row.toolNames,
          enabled: row.enabled,
        })
        .onConflictDoUpdate({
          target: modules.name,
          set: {
            version: row.version,
            description: row.description,
            stations: row.stations,
            approvalKinds: row.approvalKinds,
            toolNames: row.toolNames,
            enabled: row.enabled,
            updatedAt: new Date(),
          },
        })
        .returning()
      if (!inserted) throw new Error(`failed to upsert module ${row.name}`)
      return inserted as unknown as ModuleRow
    },

    async findByName(name) {
      const [row] = await db.select().from(modules).where(eq(modules.name, name)).limit(1)
      return (row ?? null) as ModuleRow | null
    },
  }
}

export function divisionStore(db: Database): DivisionStore {
  return {
    async insert(row) {
      const [inserted] = await db
        .insert(divisions)
        .values({
          name: row.name,
          slug: row.slug,
          moduleId: row.moduleId,
          type: row.type,
          status: row.status,
          config: row.config,
        })
        .returning()
      if (!inserted) throw new Error(`failed to create division ${row.slug}`)
      return inserted as unknown as DivisionRow
    },

    async findBySlug(slug) {
      const [row] = await db.select().from(divisions).where(eq(divisions.slug, slug)).limit(1)
      return (row ?? null) as DivisionRow | null
    },
  }
}

export function agentStore(db: Database): AgentStore {
  return {
    async insertMany(rows) {
      if (rows.length === 0) return []
      const inserted = await db.insert(agents).values(rows).returning()
      return inserted as unknown as SeededAgent[]
    },
  }
}

export function approvalRuleSeedStore(db: Database): ApprovalRuleSeedStore {
  return {
    async seed(rows) {
      if (rows.length === 0) return
      await db
        .insert(approvalRules)
        .values(rows)
        // Re-registering a module must not reset counters an operator has earned.
        .onConflictDoNothing({
          target: [approvalRules.divisionId, approvalRules.kind, approvalRules.category],
        })
    },
  }
}

/* ------------------------------------------------------------------ *
 * Spend cap
 * ------------------------------------------------------------------ */

/**
 * Today's API spend against the division's daily cap, plus the pause switches.
 *
 * Reads the ledger rather than a counter, so the cap and the Company screen can never
 * disagree about what has been spent.
 */
export function spendGuard(db: Database): SpendGuard {
  return {
    async check(divisionId) {
      const [division] = await db
        .select()
        .from(divisions)
        .where(eq(divisions.id, divisionId))
        .limit(1)
      if (!division) return `division ${divisionId} does not exist`
      if (division.status === 'paused') return 'division is paused'
      if (division.status === 'closed') return 'division is closed'

      const [spent] = await db
        .select({
          // Costs are stored negative, so flip the sign to get spend.
          cents: sql<number>`COALESCE(-SUM(${ledger.amountCents}), 0)`,
        })
        .from(ledger)
        .where(
          and(
            eq(ledger.divisionId, divisionId),
            sql`${ledger.kind} IN ('api_cost', 'expense')`,
            sql`${ledger.occurredAt} >= date_trunc('day', now())`,
          ),
        )

      const used = Number(spent?.cents ?? 0)
      if (used >= division.dailySpendCapCents) {
        return `daily spend cap reached (${(used / 100).toFixed(2)} of ${(division.dailySpendCapCents / 100).toFixed(2)} USD)`
      }
      return null
    },
  }
}

/* ------------------------------------------------------------------ *
 * Queries the jobs need
 * ------------------------------------------------------------------ */

/** Every active agent with a clock schedule, for the scheduler tick. */
export async function scheduledAgents(db: Database) {
  return db
    .select({
      id: agents.id,
      divisionId: agents.divisionId,
      name: agents.name,
      schedule: agents.schedule,
      lastRunAt: agents.lastRunAt,
      moduleAgentKey: agents.moduleAgentKey,
    })
    .from(agents)
    .where(and(eq(agents.status, 'active'), sql`${agents.schedule} IS NOT NULL`))
}

/** Recent runs for the health heartbeat, newest first. */
export async function recentRuns(db: Database, limit = 500) {
  return db
    .select({
      agentId: agentRuns.agentId,
      status: agentRuns.status,
      startedAt: agentRuns.startedAt,
      finishedAt: agentRuns.finishedAt,
    })
    .from(agentRuns)
    .orderBy(desc(agentRuns.startedAt))
    .limit(limit)
}

/** Every registered agent, for the health heartbeat. */
export async function allAgents(db: Database) {
  return db
    .select({
      id: agents.id,
      name: agents.name,
      divisionId: agents.divisionId,
      schedule: agents.schedule,
      status: agents.status,
    })
    .from(agents)
}

/** Divisions whose agents should not run right now. */
export async function pausedDivisionIds(db: Database): Promise<string[]> {
  const rows = await db
    .select({ id: divisions.id })
    .from(divisions)
    .where(sql`${divisions.status} IN ('paused', 'closed')`)
  return rows.map((r) => r.id)
}

/** Delete events past the 90-day retention window (SPEC.md §Event log). */
export async function pruneEvents(db: Database, days = 90): Promise<void> {
  await db.delete(events).where(sql`${events.ts} < now() - make_interval(days => ${days})`)
}
