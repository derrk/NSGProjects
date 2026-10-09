'use server'

import { agents, db, tasks } from '@acf/db'
import { executeTask, inngest } from '@acf/jobs'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { resolveAgentDefinition } from '@/lib/modules'

/**
 * "Run now".
 *
 * Creates an `operator` task and runs it inline through the SAME executor the queue
 * uses, so what the operator sees when debugging is exactly what happens on a
 * schedule. Inline rather than queued on purpose: the point of this button is
 * immediate feedback, and it works whether or not the Inngest dev server is up.
 */
export async function runAgentNow(formData: FormData): Promise<void> {
  const agentId = String(formData.get('agentId') ?? '')
  if (!agentId) throw new Error('agentId is required')

  const database = db()
  const [agent] = await database.select().from(agents).where(eq(agents.id, agentId)).limit(1)
  if (!agent) throw new Error(`agent ${agentId} not found`)

  let input: unknown = {}
  const raw = String(formData.get('input') ?? '').trim()
  if (raw) {
    try {
      input = JSON.parse(raw)
    } catch {
      throw new Error('Input must be valid JSON.')
    }
  }

  const [task] = await database
    .insert(tasks)
    .values({
      divisionId: agent.divisionId,
      agentId: agent.id,
      title: `${agent.name}: run now`,
      input,
      source: 'operator',
      // Operator tasks jump the queue.
      priority: 100,
      actor: 'operator',
    })
    .returning()

  if (task) {
    await executeTask(task.id, {
      db: database,
      resolveAgent: resolveAgentDefinition,
      bus: inngest,
    })
  }

  revalidatePath('/agents')
  revalidatePath('/inbox')
  revalidatePath('/')
}

/** Pause or resume one agent. */
export async function setAgentStatus(formData: FormData): Promise<void> {
  const agentId = String(formData.get('agentId') ?? '')
  const status = String(formData.get('status') ?? '')
  if (!agentId) throw new Error('agentId is required')
  if (status !== 'active' && status !== 'paused') throw new Error(`bad status "${status}"`)

  await db()
    .update(agents)
    .set({ status, updatedAt: new Date() })
    .where(eq(agents.id, agentId))

  revalidatePath('/agents')
}
