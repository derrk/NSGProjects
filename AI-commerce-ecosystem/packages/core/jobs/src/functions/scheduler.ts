import { db, tasks } from '@acf/db'
import { and, isNotNull, sql } from 'drizzle-orm'
import { cron } from 'inngest'

import { eventSink, pausedDivisionIds, scheduledAgents } from '../adapters'
import { inngest } from '../client'
import { dueAgents } from '../due'

/**
 * `scheduler.tick` — every 5 minutes (SPEC.md §Core jobs).
 *
 * Reads `agents.schedule` from the registry and creates a task for each agent that is
 * due. No module defines a cron; this one job serves every division, which is why
 * adding a division adds no infrastructure.
 */
export const schedulerTick = inngest.createFunction(
  {
    id: 'scheduler-tick',
    triggers: [cron('*/5 * * * *')],
    retries: 2,
    // One tick at a time. Two overlapping ticks would both see the same agents as due
    // and queue the work twice.
    concurrency: [{ scope: 'fn', limit: 1 }],
  },
  async ({ step }) => {
    const created = await step.run('queue-due-agents', async () => {
      const database = db()
      const [agents, paused] = await Promise.all([
        scheduledAgents(database),
        pausedDivisionIds(database),
      ])

      // An agent with work already queued, running or blocked is behind; queueing
      // more would stack runs on it.
      const busy = await database
        .select({ agentId: tasks.agentId })
        .from(tasks)
        .where(
          and(
            isNotNull(tasks.agentId),
            sql`${tasks.status} IN ('queued', 'running', 'blocked')`,
          ),
        )

      const due = dueAgents(
        agents.map((a) => ({
          id: a.id,
          divisionId: a.divisionId,
          name: a.name,
          schedule: a.schedule,
          lastRunAt: a.lastRunAt ? new Date(a.lastRunAt) : null,
        })),
        new Date(),
        {
          pausedDivisionIds: paused,
          busyAgentIds: busy.map((b) => b.agentId).filter((id): id is string => id !== null),
        },
      )

      const rows = await Promise.all(
        due.map(async ({ agent, reason }) => {
          const [task] = await database
            .insert(tasks)
            .values({
              divisionId: agent.divisionId,
              agentId: agent.id,
              title: `${agent.name}: scheduled run`,
              input: {},
              source: 'schedule',
              actor: 'system',
            })
            .returning()
          return { task: task!, agent, reason }
        }),
      )

      const sink = eventSink(database)
      for (const { task, agent, reason } of rows) {
        await sink.emit({
          divisionId: agent.divisionId,
          agentId: agent.id,
          kind: 'task.created',
          level: 'info',
          message: `queued ${agent.name} (${reason})`,
          refTable: 'tasks',
          refId: task.id,
        })
      }

      return rows.map((r) => ({
        taskId: r.task.id,
        divisionId: r.agent.divisionId,
        agentId: r.agent.id,
      }))
    })

    // Emitted outside the step so a retry of the step cannot double-send them.
    if (created.length > 0) {
      await step.sendEvent(
        'dispatch',
        created.map((c) => ({
          name: 'task.created' as const,
          data: { ...c, source: 'schedule' },
        })),
      )
    }

    return { queued: created.length }
  },
)
