/**
 * Core tools that read and write the shared knowledge layer.
 *
 * These are the ones every module gets for free, and the reason a new division can do
 * useful work before it has a single table of its own.
 */

import { and, eq, ilike } from 'drizzle-orm'
import * as z from 'zod'

import type { ToolSpec } from '@acf/core/tools'
import { entities, opportunities, ledger, tasks, agents, type Database } from '@acf/db'

import { memoryStore } from '../memory'

const json = (schema: z.ZodType) => z.toJSONSchema(schema) as Record<string, unknown>

/* ------------------------------------------------------------------ *
 * entities
 * ------------------------------------------------------------------ */

const entityTypes = ['customer', 'lead', 'supplier', 'listing', 'inventory_item', 'asset'] as const

const entityUpsertInput = z.object({
  type: z
    .enum(entityTypes)
    .describe(`One of: ${entityTypes.join(', ')}.`),
  name: z.string().describe('What this is called. Used to match an existing record.'),
  externalIds: z
    .record(z.string(), z.string())
    .optional()
    .describe('Ids in other systems, e.g. {"shopify":"123"}.'),
  attributes: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Anything else worth keeping about it.'),
})

export function createEntityUpsertTool(db: Database): ToolSpec<z.infer<typeof entityUpsertInput>, unknown> {
  return {
    name: 'entities.upsert',
    description:
      'Record a customer, lead, supplier, listing, inventory item or asset in the shared ' +
      'knowledge layer, or update one that already exists with the same name and type. ' +
      'Scoped to your division.',
    inputSchema: entityUpsertInput,
    jsonSchema: json(entityUpsertInput),

    async handler(input, ctx) {
      const existing = await db
        .select()
        .from(entities)
        .where(
          and(
            eq(entities.divisionId, ctx.divisionId),
            eq(entities.type, input.type),
            eq(entities.name, input.name),
          ),
        )
        .limit(1)

      if (existing[0]) {
        const [updated] = await db
          .update(entities)
          .set({
            // Merged rather than replaced: a tool call that knows one new id should
            // not erase the ids another call already found.
            externalIds: { ...(existing[0].externalIds as object), ...(input.externalIds ?? {}) },
            attributes: { ...(existing[0].attributes as object), ...(input.attributes ?? {}) },
            updatedAt: new Date(),
          })
          .where(eq(entities.id, existing[0].id))
          .returning()
        return { id: updated!.id, created: false }
      }

      const [created] = await db
        .insert(entities)
        .values({
          divisionId: ctx.divisionId,
          type: input.type,
          name: input.name,
          externalIds: input.externalIds ?? {},
          attributes: input.attributes ?? {},
          actor: `agent:${ctx.agentId}`,
        })
        .returning()

      return { id: created!.id, created: true }
    },
  }
}

const entitySearchInput = z.object({
  query: z.string().describe('Text to look for in the name.'),
  type: z.enum(entityTypes).optional().describe('Narrow to one type.'),
  limit: z.number().optional().describe('How many to return. Default 20.'),
})

export function createEntitySearchTool(db: Database): ToolSpec<z.infer<typeof entitySearchInput>, unknown> {
  return {
    name: 'entities.search',
    description:
      'Find records in the shared knowledge layer by name. Returns only your ' +
      "division's records unless this agent is granted cross-division access.",
    inputSchema: entitySearchInput,
    jsonSchema: json(entitySearchInput),

    async handler(input, ctx) {
      const scope = ctx.crossDivision ? undefined : eq(entities.divisionId, ctx.divisionId)
      const conditions = [scope, ilike(entities.name, `%${input.query}%`)].filter(Boolean)
      if (input.type) conditions.push(eq(entities.type, input.type))

      const rows = await db
        .select({
          id: entities.id,
          type: entities.type,
          name: entities.name,
          externalIds: entities.externalIds,
          attributes: entities.attributes,
        })
        .from(entities)
        .where(and(...conditions))
        .limit(Math.min(input.limit ?? 20, 100))

      return { results: rows, count: rows.length }
    },
  }
}

/* ------------------------------------------------------------------ *
 * opportunities
 * ------------------------------------------------------------------ */

const opportunityInput = z.object({
  title: z.string().describe('Short name for the opportunity.'),
  summary: z.string().describe('What it is, who it is for, and why it might be worth doing.'),
  url: z.string().optional().describe('Where you found it, if anywhere.'),
  estProfitCents: z.number().optional().describe('Estimated profit in CENTS, not dollars.'),
  confidence: z.number().optional().describe('0 to 1. How sure are you? Be honest.'),
  risk: z.enum(['low', 'med', 'high']).optional().describe('One of: low, med, high.'),
  hoursRequired: z.number().optional().describe('Rough hours of human work to pursue it.'),
  evidence: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('What the estimate rests on: sources, figures, dates.'),
})

/**
 * Score = expected profit x confidence / (hours x risk weight).
 *
 * One formula for every division, so a card lot and an agency lead can be ranked
 * against each other on the Company screen. Deliberately crude: it is a sort order
 * for a human to read, not a valuation.
 */
export function scoreOpportunity(input: {
  estProfitCents?: number | null | undefined
  confidence?: number | null | undefined
  hoursRequired?: number | null | undefined
  risk?: 'low' | 'med' | 'high' | null | undefined
}): number {
  const profit = input.estProfitCents ?? 0
  const confidence = input.confidence ?? 0.5
  // Never divide by zero, and never let "no estimate" look like "free".
  const hours = Math.max(input.hoursRequired ?? 4, 0.25)
  const riskWeight = { low: 1, med: 2, high: 4 }[input.risk ?? 'med']
  return (profit * confidence) / (hours * riskWeight)
}

export function createOpportunityTool(
  db: Database,
): ToolSpec<z.infer<typeof opportunityInput>, unknown> {
  return {
    name: 'opportunities.create',
    description:
      'Record something worth money that a human should decide about. Scored against ' +
      'every other opportunity in the company by one shared formula, so give honest ' +
      'numbers — an inflated estimate just outranks better ideas.',
    inputSchema: opportunityInput,
    jsonSchema: json(opportunityInput),

    async handler(input, ctx) {
      const score = scoreOpportunity(input)
      const [row] = await db
        .insert(opportunities)
        .values({
          divisionId: ctx.divisionId,
          source: `agent:${ctx.agentName}`,
          title: input.title,
          summary: input.summary,
          url: input.url ?? null,
          estProfitCents: input.estProfitCents ?? null,
          confidence: input.confidence ?? 0.5,
          risk: input.risk ?? 'med',
          hoursRequired: input.hoursRequired ?? null,
          score,
          evidence: input.evidence ?? {},
          evaluatedBy: ctx.agentName,
          actor: `agent:${ctx.agentId}`,
        })
        .returning()

      return { id: row!.id, score }
    },
  }
}

/* ------------------------------------------------------------------ *
 * tasks
 * ------------------------------------------------------------------ */

const taskInput = z.object({
  title: z.string().describe('What needs doing.'),
  input: z.record(z.string(), z.unknown()).optional().describe('Everything the agent will need.'),
  agentName: z
    .string()
    .optional()
    .describe('Which agent should do it. Defaults to whoever is free.'),
  priority: z.number().optional().describe('Higher runs first. Default 0.'),
})

export function createTaskTool(db: Database): ToolSpec<z.infer<typeof taskInput>, unknown> {
  return {
    name: 'tasks.create',
    description:
      'Queue work for yourself or another agent in your division. Use this to break a ' +
      'big job into pieces rather than doing everything in one run.',
    inputSchema: taskInput,
    jsonSchema: json(taskInput),

    async handler(input, ctx) {
      let agentId: string | null = null
      if (input.agentName) {
        const [found] = await db
          .select({ id: agents.id })
          .from(agents)
          .where(and(eq(agents.divisionId, ctx.divisionId), eq(agents.name, input.agentName)))
          .limit(1)
        if (!found) {
          // Cross-division task creation needs a grant, and naming a stranger is more
          // likely a mistake than an attempt.
          throw new Error(
            `no agent named "${input.agentName}" in this division. Leave it out to queue it unassigned.`,
          )
        }
        agentId = found.id
      }

      const [row] = await db
        .insert(tasks)
        .values({
          divisionId: ctx.divisionId,
          agentId,
          parentTaskId: ctx.taskId,
          title: input.title,
          input: input.input ?? {},
          source: 'agent',
          priority: input.priority ?? 0,
          actor: `agent:${ctx.agentId}`,
        })
        .returning()

      return { taskId: row!.id, assignedTo: input.agentName ?? null }
    },
  }
}

/* ------------------------------------------------------------------ *
 * ledger
 * ------------------------------------------------------------------ */

const ledgerInput = z.object({
  kind: z
    .enum(['revenue', 'cogs', 'expense', 'asset', 'liability'])
    .describe('One of: revenue, cogs, expense, asset, liability. You cannot post api_cost.'),
  amountCents: z
    .number()
    .describe(
      'Signed, in CENTS. Revenue is positive; cogs, expense and liability are NEGATIVE. ' +
        'A refund is negative revenue, not a positive expense.',
    ),
  source: z.string().describe('Where this came from, e.g. "invoice:stripe" or "manual".'),
  description: z.string().optional(),
  refTable: z.string().optional(),
  refId: z.string().optional(),
})

export function createLedgerTool(db: Database): ToolSpec<z.infer<typeof ledgerInput>, unknown> {
  return {
    name: 'ledger.post',
    description:
      'Record money in the append-only ledger. Amounts are signed by their effect on the ' +
      'company. You cannot edit or delete an entry — post a correcting entry instead, ' +
      'which is what makes these figures auditable.',
    inputSchema: ledgerInput,
    jsonSchema: json(ledgerInput),

    async handler(input, ctx) {
      // api_cost is written by the runtime from measured token usage. Letting an agent
      // post it would mix a model's guess in with the metered figure.
      if ((input.kind as string) === 'api_cost') {
        throw new Error('api_cost is recorded by the runtime, not by an agent')
      }

      const [row] = await db
        .insert(ledger)
        .values({
          divisionId: ctx.divisionId,
          kind: input.kind,
          amountCents: input.amountCents,
          source: input.source,
          description: input.description ?? null,
          refTable: input.refTable ?? null,
          refId: input.refId ?? null,
          actor: `agent:${ctx.agentId}`,
        })
        .returning()

      await ctx.log(
        'ledger.posted',
        `${input.kind} ${(input.amountCents / 100).toFixed(2)} from ${input.source}`,
        { refTable: 'ledger', refId: row!.id },
      )
      return { id: row!.id }
    },
  }
}

/* ------------------------------------------------------------------ *
 * memory
 * ------------------------------------------------------------------ */

const memoryRecallInput = z.object({
  query: z.string().describe('What you are trying to remember.'),
  limit: z.number().optional().describe('How many entries. Default 8.'),
})

export function createMemoryRecallTool(
  db: Database,
): ToolSpec<z.infer<typeof memoryRecallInput>, unknown> {
  return {
    name: 'memory.recall',
    description:
      'Look up what you have learned before. The runtime already loads your most ' +
      'relevant memories at the start of every run, so use this only when you need ' +
      'something it did not bring.',
    inputSchema: memoryRecallInput,
    jsonSchema: json(memoryRecallInput),

    async handler(input, ctx) {
      const entries = await memoryStore(db).recall({
        agentId: ctx.agentId,
        divisionId: ctx.divisionId,
        query: input.query,
        limit: Math.min(input.limit ?? 8, 25),
        lessonLimit: 3,
      })
      return {
        entries: entries.map((e) => ({ kind: e.kind, content: e.content, importance: e.importance })),
      }
    },
  }
}

const memoryWriteInput = z.object({
  kind: z
    .enum(['decision', 'result', 'lesson', 'fact'])
    .describe('One of: decision, result, lesson, fact.'),
  content: z.string().describe('One self-contained sentence. It must make sense months later.'),
  importance: z.number().optional().describe('0 to 1. Below 0.2 is pruned after 60 days.'),
})

export function createMemoryWriteTool(
  db: Database,
): ToolSpec<z.infer<typeof memoryWriteInput>, unknown> {
  return {
    name: 'memory.write',
    description:
      'Keep something for next time. Write what you learned, not what you did — the run ' +
      'history already records what you did.',
    inputSchema: memoryWriteInput,
    jsonSchema: json(memoryWriteInput),

    async handler(input, ctx) {
      await memoryStore(db).write({
        agentId: ctx.agentId,
        divisionId: ctx.divisionId,
        taskId: ctx.taskId,
        entries: [
          { kind: input.kind, content: input.content, importance: input.importance ?? 0.5 },
        ],
      })
      return { stored: true }
    },
  }
}

/* ------------------------------------------------------------------ *
 * notify_operator
 * ------------------------------------------------------------------ */

const notifyInput = z.object({
  message: z.string().describe('What the operator needs to know. One or two sentences.'),
  level: z.enum(['info', 'warn', 'error']).optional().describe('How urgent. Default info.'),
})

export function createNotifyTool(db: Database): ToolSpec<z.infer<typeof notifyInput>, unknown> {
  return {
    name: 'notify_operator',
    description:
      'Tell the operator something. This is not a way to ask permission — anything that ' +
      'spends money or leaves the company goes through requestApproval instead.',
    inputSchema: notifyInput,
    jsonSchema: json(notifyInput),

    async handler(input, ctx) {
      await ctx.log('agent.notice', input.message, { level: input.level ?? 'info' })
      return { delivered: true }
    },
  }
}

/** Every knowledge-layer tool, wired to one database. */
export function knowledgeTools(db: Database): ToolSpec[] {
  return [
    createEntityUpsertTool(db) as ToolSpec,
    createEntitySearchTool(db) as ToolSpec,
    createOpportunityTool(db) as ToolSpec,
    createTaskTool(db) as ToolSpec,
    createLedgerTool(db) as ToolSpec,
    createMemoryRecallTool(db) as ToolSpec,
    createMemoryWriteTool(db) as ToolSpec,
    createNotifyTool(db) as ToolSpec,
  ]
}
