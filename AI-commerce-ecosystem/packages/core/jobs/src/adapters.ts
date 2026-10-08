/**
 * Database- and Inngest-backed implementations of the ports in @acf/core.
 *
 * The core logic (approval gate, run wrapper, health) is written against interfaces so
 * it can be tested without any of this. This file is where it meets the real world,
 * and it is deliberately thin: mapping only, no decisions.
 */

import { and, desc, eq, ne, sql } from 'drizzle-orm'
import type { Inngest } from 'inngest'

import type {
  ApprovalKind,
  ApprovalRow,
  ApprovalRule,
  ApprovalStore,
  Clock,
  EventBus,
  EventSink,
  RuleStore,
} from '@acf/core/approvals'
import type { AgentRunRecord, AgentRunStore, Sleeper } from '@acf/core/runtime'
import { agentRuns, approvalRules, approvals, events, type Database } from '@acf/db'

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
    shopId: row.shopId,
    kind: row.kind,
    category: row.category,
    refId: row.refId,
    summary: row.summary,
    payload: row.payload,
    decision: row.decision,
    autoDecided: row.autoDecided,
    editPayload: row.editPayload ?? null,
    requestedBy: row.requestedBy as ApprovalRow['requestedBy'],
    decidedBy: (row.decidedBy ?? null) as ApprovalRow['decidedBy'],
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
  }
}

export function approvalStore(db: Database): ApprovalStore {
  return {
    async findByRef(kind, refId) {
      const [row] = await db
        .select()
        .from(approvals)
        .where(
          and(eq(approvals.kind, kind), eq(approvals.refId, refId), ne(approvals.decision, 'rejected')),
        )
        .limit(1)
      return row ? toApprovalRow(row) : null
    },

    async insert(row) {
      const [inserted] = await db
        .insert(approvals)
        .values({
          id: row.id,
          shopId: row.shopId,
          kind: row.kind,
          category: row.category,
          refId: row.refId,
          summary: row.summary,
          payload: row.payload,
          decision: row.decision,
          autoDecided: row.autoDecided,
          editPayload: row.editPayload,
          requestedBy: row.requestedBy,
          decidedBy: row.decidedBy,
          createdAt: row.createdAt,
          decidedAt: row.decidedAt,
          createdBy: row.requestedBy,
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
    async get(kind, category) {
      const [row] = await db
        .select()
        .from(approvalRules)
        .where(and(eq(approvalRules.kind, kind), eq(approvalRules.category, category)))
        .limit(1)
      if (!row) return null
      return {
        kind: row.kind,
        category: row.category,
        approvedCount: row.approvedCount,
        rejectedCount: row.rejectedCount,
        editedCount: row.editedCount,
        autoEnabled: row.autoEnabled,
        threshold: row.threshold,
        requiredRate: row.requiredRate,
      }
    },

    async upsert(rule: ApprovalRule) {
      await db
        .insert(approvalRules)
        .values({
          kind: rule.kind as ApprovalKind,
          category: rule.category,
          approvedCount: rule.approvedCount,
          rejectedCount: rule.rejectedCount,
          editedCount: rule.editedCount,
          autoEnabled: rule.autoEnabled,
          threshold: rule.threshold,
          requiredRate: rule.requiredRate,
        })
        .onConflictDoUpdate({
          target: [approvalRules.kind, approvalRules.category],
          set: {
            approvedCount: rule.approvedCount,
            rejectedCount: rule.rejectedCount,
            editedCount: rule.editedCount,
            autoEnabled: rule.autoEnabled,
            threshold: rule.threshold,
            requiredRate: rule.requiredRate,
            updatedAt: new Date(),
          },
        })
      return rule
    },
  }
}

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

export function eventSink(db: Database, shopId: string | null = null): EventSink {
  return {
    async emit(event) {
      await db.insert(events).values({
        agent: event.agent,
        kind: event.kind,
        level: event.level,
        message: event.message,
        refTable: event.refTable ?? null,
        refId: event.refId ?? null,
        shopId,
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

/* ------------------------------------------------------------------ *
 * Agent runs
 * ------------------------------------------------------------------ */

export function agentRunStore(db: Database): AgentRunStore {
  return {
    async start(record) {
      const [row] = await db
        .insert(agentRuns)
        .values({
          agent: record.agent,
          shopId: record.shopId,
          trigger: record.trigger,
          status: record.status,
          startedAt: record.startedAt,
          finishedAt: record.finishedAt,
          input: record.input,
          output: record.output,
          tokensIn: record.tokensIn,
          tokensOut: record.tokensOut,
          costCents: record.costCents,
          attempts: record.attempts,
          error: record.error,
          createdBy: `agent:${record.agent}`,
        })
        .returning()
      if (!row) throw new Error(`failed to start a run for ${record.agent}`)
      return row as AgentRunRecord
    },

    async finish(id, patch) {
      const [row] = await db
        .update(agentRuns)
        .set({
          ...(patch.status === undefined ? {} : { status: patch.status }),
          ...(patch.finishedAt === undefined ? {} : { finishedAt: patch.finishedAt }),
          ...(patch.output === undefined ? {} : { output: patch.output }),
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
      return row as AgentRunRecord
    },
  }
}

/** Recent runs for the health heartbeat, newest first. */
export async function recentRuns(db: Database, limit = 200) {
  return db
    .select({
      agent: agentRuns.agent,
      status: agentRuns.status,
      startedAt: agentRuns.startedAt,
      finishedAt: agentRuns.finishedAt,
    })
    .from(agentRuns)
    .orderBy(desc(agentRuns.startedAt))
    .limit(limit)
}

/** Delete events past the 90-day retention window (SPEC.md §Event log). */
export async function pruneEvents(db: Database, days = 90): Promise<number> {
  const result = await db.delete(events).where(sql`${events.ts} < now() - make_interval(days => ${days})`)
  return Number((result as unknown as { count?: number }).count ?? 0)
}
