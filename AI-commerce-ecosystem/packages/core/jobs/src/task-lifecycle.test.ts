/**
 * Task lifecycle: the pure decisions, plus the SQL that enforces them against real
 * Postgres. The claim is a concurrency primitive and the completion rule is a bug
 * that only appears when two writers touch the same row, so both are tested against
 * PGlite rather than a fake.
 */

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { agents, approvals, divisions, tasks } from '@acf/db'
import { createTestDatabase, type TestDatabase } from '@acf/db/testing'

import {
  STALE_CLAIM_MINUTES,
  agentsSubscribedTo,
  claimTask,
  closeBlockedTask,
  requeueTask,
  taskBlockedOn,
  taskGate,
  taskStore,
} from './adapters'
import {
  dispatchInput,
  eventSchedule,
  resumeInput,
  shouldResumeRequester,
  type ApprovalDecisionEvent,
} from './task-lifecycle'

/* ------------------------------------------------------------------ *
 * Pure helpers
 * ------------------------------------------------------------------ */

function decisionEvent(over: Partial<ApprovalDecisionEvent> = {}): ApprovalDecisionEvent {
  return {
    approvalId: 'apr_1',
    divisionId: 'div_1',
    kind: 'design',
    category: 'hand-lettered',
    refTable: 'pod.concepts',
    refId: 'concept_1',
    taskId: 'task_1',
    decision: 'approved',
    payload: { chosenDesignId: 'd2' },
    actor: 'operator',
    ...over,
  }
}

describe('eventSchedule', () => {
  it('builds the string an agent subscribes with', () => {
    expect(eventSchedule('concept', 'approved')).toBe('event:concept.approved')
    expect(eventSchedule('design', 'rejected')).toBe('event:design.rejected')
  })
})

describe('resumeInput', () => {
  it('keeps the original input and adds the decision beside it', () => {
    const out = resumeInput({ conceptId: 'c1' }, decisionEvent()) as Record<string, unknown>
    expect(out['conceptId']).toBe('c1')
    expect(out['approval']).toMatchObject({ decision: 'approved', payload: { chosenDesignId: 'd2' } })
  })

  it('carries the operator’s edited payload, not the agent’s original', () => {
    const out = resumeInput({}, decisionEvent({ decision: 'edited', payload: { title: 'rewritten' } }))
    expect((out as { approval: { payload: unknown } }).approval.payload).toEqual({
      title: 'rewritten',
    })
  })

  it('survives a non-object input without losing it', () => {
    const out = resumeInput('just a string', decisionEvent()) as Record<string, unknown>
    expect(out['input']).toBe('just a string')
    expect(out['approval']).toBeDefined()
  })
})

describe('dispatchInput', () => {
  it('is module-agnostic: a reference and the decision, nothing else', () => {
    // Core knows an approval was about refTable/refId. It must not need to know what
    // a concept is.
    expect(dispatchInput(decisionEvent())).toEqual({
      refTable: 'pod.concepts',
      refId: 'concept_1',
      kind: 'design',
      category: 'hand-lettered',
      decision: 'approved',
      payload: { chosenDesignId: 'd2' },
    })
  })
})

describe('shouldResumeRequester', () => {
  it('does not resume by default', () => {
    // Most agents finish at the gate; re-running every requester on every decision
    // would spend a run, and sometimes money, to accomplish nothing.
    expect(shouldResumeRequester({}, 'approved')).toBe(false)
  })

  it('resumes when the agent asked to continue', () => {
    expect(shouldResumeRequester({ resumeTask: true }, 'approved')).toBe(true)
  })

  it('never resumes on a rejection, even when the agent asked', () => {
    expect(shouldResumeRequester({ resumeTask: true }, 'rejected')).toBe(false)
  })

  it('is not fooled by a truthy non-true value', () => {
    expect(shouldResumeRequester({ resumeTask: 'yes' }, 'approved')).toBe(false)
  })
})

/* ------------------------------------------------------------------ *
 * Against real SQL
 * ------------------------------------------------------------------ */

let h: TestDatabase

beforeAll(async () => {
  h = await createTestDatabase()
}, 120_000)

afterAll(async () => {
  await h.close()
})

beforeEach(async () => {
  await h.truncate()
})

async function seed() {
  const [division] = await h.db
    .insert(divisions)
    .values({ name: 'POD', slug: 'pod', type: 'pod', status: 'active' })
    .returning()
  const [agent] = await h.db
    .insert(agents)
    .values({
      divisionId: division!.id,
      name: 'Design bay',
      model: 'claude-sonnet-5-5',
      schedule: 'event:concept.approved',
    })
    .returning()
  const [task] = await h.db
    .insert(tasks)
    .values({
      divisionId: division!.id,
      agentId: agent!.id,
      title: 'Design something',
      input: { conceptId: 'c1' },
      source: 'event',
    })
    .returning()
  return { division: division!, agent: agent!, task: task! }
}

describe('claimTask', () => {
  it('claims a queued task and marks it running', async () => {
    const { task } = await seed()
    const claimed = await claimTask(h.db as never, task.id)

    expect(claimed).not.toBeNull()
    expect(claimed!.status).toBe('running')
    expect(claimed!.attempts).toBe(1)
  })

  it('lets exactly one of two racing workers win', async () => {
    const { task } = await seed()

    // Two deliveries of the same task.created event.
    const [a, b] = await Promise.all([
      claimTask(h.db as never, task.id),
      claimTask(h.db as never, task.id),
    ])

    // Without this, a redelivered event runs the agent twice and pays twice.
    expect([a, b].filter(Boolean)).toHaveLength(1)
  })

  it('refuses a task that is already running', async () => {
    const { task } = await seed()
    await claimTask(h.db as never, task.id)
    expect(await claimTask(h.db as never, task.id)).toBeNull()
  })

  it.each([['blocked'], ['done'], ['failed']])('refuses a %s task', async (status) => {
    const { task } = await seed()
    await h.db
      .update(tasks)
      .set({ status: status as 'blocked' })
      .where(eq(tasks.id, task.id))

    expect(await claimTask(h.db as never, task.id)).toBeNull()
  })

  it('takes over a task left running by a process that died', async () => {
    const { task } = await seed()
    const longAgo = new Date(Date.now() - (STALE_CLAIM_MINUTES + 5) * 60_000)
    await h.db
      .update(tasks)
      .set({ status: 'running', startedAt: longAgo })
      .where(eq(tasks.id, task.id))

    // Otherwise it stays `running` forever, invisible to the scheduler and to the
    // operator, who sees a task that looks busy and never finishes.
    expect(await claimTask(h.db as never, task.id)).not.toBeNull()
  })

  it('does not take over a task that is merely slow', async () => {
    const { task } = await seed()
    await h.db
      .update(tasks)
      .set({ status: 'running', startedAt: new Date(Date.now() - 60_000) })
      .where(eq(tasks.id, task.id))

    expect(await claimTask(h.db as never, task.id)).toBeNull()
  })

  it('returns null for a task that does not exist', async () => {
    expect(await claimTask(h.db as never, '00000000-0000-0000-0000-000000000000')).toBeNull()
  })
})

describe('completing a task', () => {
  it('marks a running task done and records its output', async () => {
    const { task } = await seed()
    await claimTask(h.db as never, task.id)
    await taskStore(h.db as never).complete(task.id, { ok: true })

    const [row] = await h.db.select().from(tasks).where(eq(tasks.id, task.id))
    expect(row).toMatchObject({ status: 'done', output: { ok: true } })
    expect(row!.finishedAt).not.toBeNull()
  })

  it('does NOT un-block a task that is waiting on an approval', async () => {
    const { division, task } = await seed()
    await claimTask(h.db as never, task.id)

    const [approval] = await h.db
      .insert(approvals)
      .values({
        divisionId: division.id,
        kind: 'design',
        category: 'hand-lettered',
        refTable: 'pod.concepts',
        refId: 'c1',
        summary: '3 variants',
        payload: {},
        requestedBy: 'agent:1',
        taskId: task.id,
      })
      .returning()

    // The gate blocks the task; the agent then returns normally and the run loop
    // calls complete() on the very same task.
    await taskGate(h.db as never).block(task.id, approval!.id)
    await taskStore(h.db as never).complete(task.id, { requested: true })

    const [row] = await h.db.select().from(tasks).where(eq(tasks.id, task.id))
    // Marking it done here would erase the block and strand the approval with
    // nothing waiting on it.
    expect(row!.status).toBe('blocked')
    // The output is still recorded.
    expect(row!.output).toEqual({ requested: true })
  })

  it('does not fail a blocked task either', async () => {
    const { task } = await seed()
    await claimTask(h.db as never, task.id)
    await h.db.update(tasks).set({ status: 'blocked' }).where(eq(tasks.id, task.id))

    await taskStore(h.db as never).fail(task.id, 'boom')

    const [row] = await h.db.select().from(tasks).where(eq(tasks.id, task.id))
    expect(row!.status).toBe('blocked')
  })

  it('fails a running task', async () => {
    const { task } = await seed()
    await claimTask(h.db as never, task.id)
    await taskStore(h.db as never).fail(task.id, 'the model refused')

    const [row] = await h.db.select().from(tasks).where(eq(tasks.id, task.id))
    expect(row).toMatchObject({ status: 'failed', error: 'the model refused' })
  })
})

describe('settling a blocked task', () => {
  async function blockedTask() {
    const { division, task } = await seed()
    const [approval] = await h.db
      .insert(approvals)
      .values({
        divisionId: division.id,
        kind: 'design',
        category: 'hand-lettered',
        refTable: 'pod.concepts',
        refId: 'c1',
        summary: 's',
        payload: {},
        requestedBy: 'agent:1',
        taskId: task.id,
      })
      .returning()
    await taskGate(h.db as never).block(task.id, approval!.id)
    return { division, task, approval: approval! }
  }

  it('finds the task waiting on an approval', async () => {
    const { task, approval } = await blockedTask()
    const found = await taskBlockedOn(h.db as never, approval.id)
    expect(found!.id).toBe(task.id)
  })

  it('requeues a task, clearing the block and carrying the new input', async () => {
    const { task } = await blockedTask()
    const row = await requeueTask(h.db as never, task.id, { resumed: true })

    expect(row).not.toBeNull()
    expect(row!.status).toBe('queued')
    expect(row!.blockedOnApprovalId).toBeNull()
    expect(row!.input).toEqual({ resumed: true })
  })

  it('will not requeue a task that is not blocked', async () => {
    const { task } = await seed()
    expect(await requeueTask(h.db as never, task.id, {})).toBeNull()
  })

  it('closes a blocked task as done, not failed', async () => {
    const { task } = await blockedTask()
    await closeBlockedTask(h.db as never, task.id)

    const [row] = await h.db.select().from(tasks).where(eq(tasks.id, task.id))
    // The task succeeded: it produced a proposal and the operator answered it.
    // "The operator said no" is not a task failure.
    expect(row!.status).toBe('done')
    expect(row!.blockedOnApprovalId).toBeNull()
  })
})

describe('agentsSubscribedTo', () => {
  it('finds the active agents listening for an event', async () => {
    const { division, agent } = await seed()
    const found = await agentsSubscribedTo(h.db as never, division.id, 'event:concept.approved')
    expect(found.map((a) => a.id)).toEqual([agent.id])
  })

  it('ignores a paused agent', async () => {
    const { division, agent } = await seed()
    await h.db.update(agents).set({ status: 'paused' }).where(eq(agents.id, agent.id))

    // A declared-but-unimplemented agent is seeded paused; dispatching to it would
    // queue work nothing can run.
    expect(await agentsSubscribedTo(h.db as never, division.id, 'event:concept.approved')).toEqual(
      [],
    )
  })

  it('ignores an agent in another division', async () => {
    await seed()
    const [other] = await h.db
      .insert(divisions)
      .values({ name: 'Cards', slug: 'cards', type: 'cards' })
      .returning()

    expect(await agentsSubscribedTo(h.db as never, other!.id, 'event:concept.approved')).toEqual([])
  })

  it('ignores an agent listening for a different event', async () => {
    const { division } = await seed()
    expect(await agentsSubscribedTo(h.db as never, division.id, 'event:design.approved')).toEqual([])
  })
})
