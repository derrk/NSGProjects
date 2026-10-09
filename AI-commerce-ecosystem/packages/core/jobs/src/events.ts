/**
 * The internal event contract (SPEC.md §Orchestrator).
 *
 * These schemas are the ONLY place event payload shapes are defined.
 *
 * Keep them transform-free: Inngest 4 requires an event schema's input and output
 * types to match, so `.default()` and `z.coerce.*` are compile errors here with a
 * fairly opaque message. Use `.optional()` and apply defaults in the handler.
 */

import { eventType } from 'inngest'
import * as z from 'zod'

export const taskCreated = eventType('task.created', {
  schema: z.object({
    taskId: z.string(),
    divisionId: z.string(),
    agentId: z.string().nullable(),
    source: z.string(),
  }),
})

export const taskRetry = eventType('task.retry', {
  schema: z.object({ taskId: z.string(), divisionId: z.string() }),
})

/** What the approval gate puts on the wire for every decision it makes. */
const approvalPayload = z.object({
  approvalId: z.string(),
  divisionId: z.string(),
  kind: z.string(),
  category: z.string(),
  refTable: z.string(),
  refId: z.string(),
  taskId: z.string().nullable(),
  payload: z.unknown(),
  actor: z.string(),
  ts: z.string(),
})

export const approvalRequested = eventType('approval.requested', { schema: approvalPayload })

export const approvalDecided = eventType('approval.decided', {
  schema: approvalPayload.extend({ decision: z.string() }),
})

/** Manual "Run now" from a station drawer. */
export const agentManual = eventType('agent.manual', {
  schema: z.object({
    agentId: z.string(),
    divisionId: z.string(),
    actor: z.string(),
    input: z.unknown(),
  }),
})

export const systemPaused = eventType('system.paused', {
  schema: z.object({ paused: z.boolean(), actor: z.string(), ts: z.string() }),
})

export const coreEvents = {
  taskCreated,
  taskRetry,
  approvalRequested,
  approvalDecided,
  agentManual,
  systemPaused,
}
