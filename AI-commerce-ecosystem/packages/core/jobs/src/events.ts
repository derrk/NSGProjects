/**
 * The internal event contract (SPEC.md §Inngest events).
 *
 * These schemas are the ONLY place event payload shapes are defined.
 *
 * Keep them transform-free. Inngest 4 requires an event schema's input and output
 * types to match, so `.default()` and `z.coerce.*` are compile errors here with a
 * fairly opaque message ("Transforms not supported"). Use `.optional()` and apply
 * defaults in the handler instead.
 */

import { eventType } from 'inngest'
import * as z from 'zod'

/** What the approval gate puts on the wire for every decision it makes. */
const approvalPayload = z.object({
  approvalId: z.string(),
  kind: z.string(),
  category: z.string(),
  refId: z.string(),
  shopId: z.string().nullable(),
  payload: z.unknown(),
  actor: z.string(),
  ts: z.string(),
})

export const approvalRequested = eventType('approval.requested', { schema: approvalPayload })

export const conceptApproved = eventType('concept.approved', { schema: approvalPayload })
export const conceptRejected = eventType('concept.rejected', { schema: approvalPayload })

export const designApproved = eventType('design.approved', { schema: approvalPayload })
export const designRejected = eventType('design.rejected', { schema: approvalPayload })

export const productApproved = eventType('product.approved', { schema: approvalPayload })
export const productRejected = eventType('product.rejected', { schema: approvalPayload })

export const replyApproved = eventType('reply.approved', { schema: approvalPayload })
export const replyRejected = eventType('reply.rejected', { schema: approvalPayload })

export const priceChangeApproved = eventType('price_change.approved', { schema: approvalPayload })
export const priceChangeRejected = eventType('price_change.rejected', { schema: approvalPayload })

export const shopProposalApproved = eventType('shop_proposal.approved', { schema: approvalPayload })
export const shopProposalRejected = eventType('shop_proposal.rejected', { schema: approvalPayload })

/** Manual "Run now" from a station drawer. */
export const agentManual = eventType('agent.manual', {
  schema: z.object({
    agent: z.string(),
    shopId: z.string().nullable(),
    actor: z.string(),
    ts: z.string(),
  }),
})

export const systemPaused = eventType('system.paused', {
  schema: z.object({ paused: z.boolean(), actor: z.string(), ts: z.string() }),
})

export const events = {
  approvalRequested,
  conceptApproved,
  conceptRejected,
  designApproved,
  designRejected,
  productApproved,
  productRejected,
  replyApproved,
  replyRejected,
  priceChangeApproved,
  priceChangeRejected,
  shopProposalApproved,
  shopProposalRejected,
  agentManual,
  systemPaused,
}
