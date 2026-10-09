/**
 * Decisions about a task's life that are worth testing without a database.
 *
 * The SQL that enforces them lives in adapters.ts; the reasoning lives here.
 */

/** How an agent subscribes to a domain event, e.g. `event:concept.approved`. */
export function eventSchedule(kind: string, decision: 'approved' | 'rejected'): string {
  return `event:${kind}.${decision}`
}

export interface ApprovalDecisionEvent {
  approvalId: string
  divisionId: string
  kind: string
  category: string
  refTable: string
  refId: string
  taskId: string | null
  decision: string
  payload: unknown
  actor: string
}

/**
 * What the resumed task sees.
 *
 * The original input is preserved and the decision is added alongside it, so an agent
 * that continues after approval can tell what the operator actually chose — including
 * an edited payload, which is the operator's version rather than the agent's.
 */
export function resumeInput(originalInput: unknown, decision: ApprovalDecisionEvent): unknown {
  const base =
    typeof originalInput === 'object' && originalInput !== null && !Array.isArray(originalInput)
      ? (originalInput as Record<string, unknown>)
      : { input: originalInput }

  return {
    ...base,
    approval: {
      approvalId: decision.approvalId,
      kind: decision.kind,
      category: decision.category,
      decision: decision.decision,
      payload: decision.payload,
      decidedBy: decision.actor,
    },
  }
}

/**
 * The input a freshly dispatched, event-triggered task starts with.
 *
 * Deliberately module-agnostic: core knows an approval was about `refTable`/`refId`
 * and nothing else. The agent reads what it needs.
 */
export function dispatchInput(decision: ApprovalDecisionEvent): Record<string, unknown> {
  return {
    refTable: decision.refTable,
    refId: decision.refId,
    kind: decision.kind,
    category: decision.category,
    decision: decision.decision,
    payload: decision.payload,
  }
}

/**
 * Should the task that requested this approval run again?
 *
 * Only when the agent asked it to. Most agents finish at the gate — the Designer's
 * work is done once three variants are waiting, and what happens next is a DIFFERENT
 * agent reacting to `design.approved`. Re-running every requester on every decision
 * would spend a run, and sometimes real money, to accomplish nothing.
 *
 * An agent that genuinely continues its own work after approval — create a product,
 * wait, then publish it — sets `resumeTask` when it requests.
 */
export function shouldResumeRequester(
  approvalPayload: unknown,
  decision: string,
): boolean {
  if (decision === 'rejected') return false
  if (typeof approvalPayload !== 'object' || approvalPayload === null) return false
  return (approvalPayload as { resumeTask?: unknown }).resumeTask === true
}
