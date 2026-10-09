/**
 * The archives: searchable institutional memory, and the Markdown export.
 *
 * Nothing new is stored here. Everything the system did is already in `tasks`,
 * `agent_runs`, `events`, `approvals` and `agent_memory`; this assembles the record of
 * one task from those. That is what makes a task record reconstructible rather than a
 * summary someone wrote down — and a summary is the thing you cannot audit.
 */

import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'

import {
  agentMemory,
  agentRuns,
  agents,
  approvals,
  divisions,
  events,
  tasks,
  type Database,
} from '@acf/db'

export interface ArchiveSearchResult {
  taskId: string
  title: string
  status: string
  divisionId: string
  divisionName: string
  agentName: string | null
  source: string
  createdAt: Date
  finishedAt: Date | null
}

export interface ArchiveSearchOptions {
  query?: string
  divisionId?: string
  status?: string
  limit?: number
}

/**
 * Find tasks.
 *
 * Searches the task title, its input, and the summaries of any approvals it produced.
 * That last one matters: the operator remembers "the nurse mug one", which is text
 * that lives on the approval, not on the task.
 */
export async function searchArchive(
  db: Database,
  options: ArchiveSearchOptions = {},
): Promise<ArchiveSearchResult[]> {
  const limit = options.limit ?? 50
  const q = options.query?.trim()

  const conditions = []
  if (options.divisionId) conditions.push(eq(tasks.divisionId, options.divisionId))
  if (options.status) conditions.push(sql`${tasks.status}::text = ${options.status}`)

  if (q) {
    const like = `%${q}%`
    conditions.push(
      or(
        ilike(tasks.title, like),
        sql`${tasks.input}::text ILIKE ${like}`,
        sql`EXISTS (SELECT 1 FROM approvals a WHERE a.task_id = ${tasks.id} AND a.summary ILIKE ${like})`,
      ),
    )
  }

  const rows = await db
    .select({
      taskId: tasks.id,
      title: tasks.title,
      status: tasks.status,
      divisionId: tasks.divisionId,
      divisionName: divisions.name,
      agentName: agents.name,
      source: tasks.source,
      createdAt: tasks.createdAt,
      finishedAt: tasks.finishedAt,
    })
    .from(tasks)
    .innerJoin(divisions, eq(tasks.divisionId, divisions.id))
    .leftJoin(agents, eq(tasks.agentId, agents.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(tasks.createdAt))
    .limit(limit)

  return rows as ArchiveSearchResult[]
}

export interface TaskArchiveRecord {
  task: typeof tasks.$inferSelect
  divisionName: string
  agentName: string | null
  runs: Array<typeof agentRuns.$inferSelect>
  approvals: Array<typeof approvals.$inferSelect>
  events: Array<typeof events.$inferSelect>
  memories: Array<typeof agentMemory.$inferSelect>
}

/** Everything that happened under one task. */
export async function loadTaskRecord(
  db: Database,
  taskId: string,
): Promise<TaskArchiveRecord | null> {
  const [row] = await db
    .select({ task: tasks, divisionName: divisions.name, agentName: agents.name })
    .from(tasks)
    .innerJoin(divisions, eq(tasks.divisionId, divisions.id))
    .leftJoin(agents, eq(tasks.agentId, agents.id))
    .where(eq(tasks.id, taskId))
    .limit(1)

  if (!row) return null

  const [runRows, approvalRows, memoryRows] = await Promise.all([
    db.select().from(agentRuns).where(eq(agentRuns.taskId, taskId)).orderBy(agentRuns.startedAt),
    db.select().from(approvals).where(eq(approvals.taskId, taskId)).orderBy(approvals.createdAt),
    db.select().from(agentMemory).where(eq(agentMemory.taskId, taskId)),
  ])

  // Events reference whatever they were about, so gather every id in this task's
  // chain rather than only the task's own.
  const refIds = [
    taskId,
    ...runRows.map((r) => r.id),
    ...approvalRows.map((a) => a.id),
    ...approvalRows.map((a) => a.refId),
  ]

  const eventRows = await db
    .select()
    .from(events)
    .where(inArray(events.refId, refIds))
    .orderBy(events.ts)

  return {
    task: row.task,
    divisionName: row.divisionName,
    agentName: row.agentName,
    runs: runRows,
    approvals: approvalRows,
    events: eventRows,
    memories: memoryRows,
  }
}

function fence(value: unknown): string {
  return ['```json', JSON.stringify(value ?? null, null, 2), '```'].join('\n')
}

function when(d: Date | null | undefined): string {
  return d ? new Date(d).toISOString() : '—'
}

/**
 * One task as Markdown, for an Obsidian vault or anywhere else.
 *
 * Front matter first so a vault can index it, then the chain in the order it
 * happened: what was asked, what ran, what it cost, what the operator decided, and
 * what the agent chose to keep.
 *
 * Note the cost caveat it prints. Every number in the run table is an ESTIMATE from a
 * price table; the export says so, because a figure copied into someone's notes
 * outlives the context that would have told them.
 */
export function taskRecordToMarkdown(record: TaskArchiveRecord): string {
  const { task } = record
  const lines: string[] = []

  lines.push('---')
  lines.push(`id: ${task.id}`)
  lines.push(`title: ${JSON.stringify(task.title)}`)
  lines.push(`division: ${JSON.stringify(record.divisionName)}`)
  lines.push(`agent: ${JSON.stringify(record.agentName ?? 'unassigned')}`)
  lines.push(`status: ${task.status}`)
  lines.push(`source: ${task.source}`)
  lines.push(`created: ${when(task.createdAt)}`)
  lines.push(`finished: ${when(task.finishedAt)}`)
  lines.push('tags: [acf, task]')
  lines.push('---')
  lines.push('')
  lines.push(`# ${task.title}`)
  lines.push('')
  lines.push(
    `**${record.divisionName}** · ${record.agentName ?? 'unassigned'} · ` +
      `${task.status} · started by ${task.source}`,
  )
  lines.push('')

  lines.push('## Input')
  lines.push(fence(task.input))
  lines.push('')

  if (task.output !== null && task.output !== undefined) {
    lines.push('## Output')
    lines.push(fence(task.output))
    lines.push('')
  }

  if (task.error) {
    lines.push('## Error')
    lines.push('```')
    lines.push(task.error)
    lines.push('```')
    lines.push('')
  }

  lines.push('## Runs')
  if (record.runs.length === 0) {
    lines.push('_none_')
  } else {
    lines.push('| started | status | attempts | tokens in | tokens out | est. cost (cents) |')
    lines.push('| --- | --- | --- | --- | --- | --- |')
    for (const r of record.runs) {
      lines.push(
        `| ${when(r.startedAt)} | ${r.status} | ${r.attempts} | ${r.tokensIn} | ` +
          `${r.tokensOut} | ${Number(r.costCents).toFixed(4)} |`,
      )
    }
    lines.push('')
    lines.push(
      '> Cost is an ESTIMATE from a model price table, not a billed amount. Verified ' +
        'spend comes from a provider invoice or an imported transaction.',
    )
  }
  lines.push('')

  lines.push('## Approvals')
  if (record.approvals.length === 0) {
    lines.push('_none_')
  } else {
    for (const a of record.approvals) {
      lines.push(`### ${a.kind} / ${a.category} — ${a.decision}`)
      lines.push('')
      lines.push(`- summary: ${a.summary}`)
      lines.push(`- reference: \`${a.refTable}\` \`${a.refId}\``)
      lines.push(`- requested by: ${a.requestedBy}`)
      lines.push(`- decided by: ${a.decidedBy ?? '—'} at ${when(a.decidedAt)}`)
      lines.push(`- decided automatically: ${a.autoDecided ? 'yes' : 'no'}`)
      lines.push('')
      lines.push('Payload:')
      lines.push(fence(a.payload))
      if (a.editPayload) {
        lines.push('')
        lines.push("Operator's edit:")
        lines.push(fence(a.editPayload))
      }
      lines.push('')
    }
  }

  lines.push('## What the agent kept')
  if (record.memories.length === 0) {
    lines.push('_nothing_')
  } else {
    for (const m of record.memories) {
      lines.push(`- **${m.kind}** (importance ${m.importance}): ${m.content}`)
    }
  }
  lines.push('')

  lines.push('## Event log')
  if (record.events.length === 0) {
    lines.push('_none recorded against this task_')
  } else {
    for (const e of record.events) {
      lines.push(`- \`${when(e.ts)}\` **${e.kind}** (${e.level}) — ${e.message}`)
    }
  }
  lines.push('')

  return lines.join('\n')
}
