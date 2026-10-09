'use server'

import { agents, db, divisions, tasks } from '@acf/db'
import { executeTask, inngest } from '@acf/jobs'
import { and, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { resolveAgentDefinition } from '@/lib/modules'

/**
 * Agent keys that accept a free-text idea as their task input.
 *
 * A module adds itself here by naming its agent with one of these keys. Keeping it an
 * explicit list beats guessing from an input schema: being wrong means an agent is
 * handed work it cannot read.
 */
const IDEA_AGENT_KEYS = new Set(['intake', 'research', 'researcher', 'scout', 'strategist'])

export interface IdeaState {
  error?: string
  ok?: string
  taskId?: string
}

/**
 * The research desk: drop in an idea, get a record and a decision to make.
 *
 * Step one of the demo workflow. It runs inline so the operator sees the result
 * immediately, through the same executor the queue uses.
 */
export async function submitIdea(_prev: IdeaState, formData: FormData): Promise<IdeaState> {
  const title = String(formData.get('title') ?? '').trim()
  const summary = String(formData.get('summary') ?? '').trim()
  const divisionId = String(formData.get('divisionId') ?? '').trim()

  if (!title) return { error: 'Give the idea a name.' }
  if (!divisionId) return { error: 'Pick which division should look at it.' }

  const database = db()

  /*
   * Route only to an agent that can actually take an idea.
   *
   * There is no fallback to "any active agent" on purpose. Handing a free-text idea
   * to, say, the Designer gets you a cheerful "recorded it" while the agent quietly
   * ignores the text and does something unrelated — which is worse than a refusal,
   * because it looks like it worked.
   */
  const active = await database
    .select()
    .from(agents)
    .where(and(eq(agents.divisionId, divisionId), eq(agents.status, 'active')))

  const target = active.find((a) => IDEA_AGENT_KEYS.has(a.moduleAgentKey))
  if (!target) {
    const names = active.map((a) => a.name).join(', ') || 'none'
    return {
      error:
        `No agent in this division takes free-text ideas (it has: ${names}). ` +
        'A division built from the generic blueprint has an Intake agent that does.',
    }
  }

  const [task] = await database
    .insert(tasks)
    .values({
      divisionId,
      agentId: target.id,
      title: `Idea: ${title}`,
      input: { title, summary },
      source: 'operator',
      priority: 100,
      actor: 'operator',
    })
    .returning()

  if (!task) return { error: 'Could not queue the idea.' }

  const result = await executeTask(task.id, {
    db: database,
    resolveAgent: resolveAgentDefinition,
    bus: inngest,
  })

  revalidatePath('/')
  revalidatePath('/inbox')
  revalidatePath('/archives')

  if (result.status !== 'ok') {
    return { error: `${target.name} could not take it: ${result.reason}`, taskId: task.id }
  }
  return { ok: `${target.name} recorded it. It is waiting in Quarantine.`, taskId: task.id }
}

/**
 * The pause switch.
 *
 * Pauses or resumes every division at once. The scheduler checks division status on
 * each tick, so this takes effect within one tick rather than needing a deploy.
 */
export async function setAllDivisionsPaused(formData: FormData): Promise<void> {
  const paused = String(formData.get('paused') ?? '') === 'true'

  await db()
    .update(divisions)
    .set({ status: paused ? 'paused' : 'active', updatedAt: new Date() })
    .where(sql`${divisions.status} IN ('active', 'paused')`)

  revalidatePath('/')
  revalidatePath('/divisions')
  revalidatePath('/agents')
}
