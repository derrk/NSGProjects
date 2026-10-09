/**
 * The approval gate (SPEC.md §Orchestrator, tasks and approvals).
 *
 * `requestApproval` is the ONLY way an agent causes a side effect. It either parks the
 * proposal in the operator's inbox and blocks the task, or — once that category has
 * earned autonomy — decides it on the spot. Either way the agent's run ends there; the
 * task resumes when an event fires.
 */

import { neverAutoReason } from './never-auto'
import {
  AlreadyDecidedError,
  ApprovalNotFoundError,
  DEFAULT_THRESHOLD_RATE,
  thresholdFor,
  type ApprovalOutcome,
  type ApprovalRequest,
  type ApprovalRow,
  type ApprovalRule,
  type DecisionInput,
  type GateDeps,
} from './types'

function defaultRule(divisionId: string, kind: string, category: string): ApprovalRule {
  return {
    divisionId,
    kind,
    category,
    approvedCount: 0,
    rejectedCount: 0,
    editedCount: 0,
    autoEnabled: false,
    thresholdCount: thresholdFor(kind),
    thresholdRate: DEFAULT_THRESHOLD_RATE,
    neverAuto: false,
  }
}

function eventPayload(row: ApprovalRow, payload: unknown, actor: string, ts: Date) {
  return {
    approvalId: row.id,
    divisionId: row.divisionId,
    kind: row.kind,
    category: row.category,
    refTable: row.refTable,
    refId: row.refId,
    taskId: row.taskId,
    payload,
    actor,
    ts: ts.toISOString(),
  }
}

export async function requestApproval(
  req: ApprovalRequest,
  deps: GateDeps,
): Promise<ApprovalOutcome> {
  // A retried run must not queue the same proposal twice.
  const existing = await deps.approvals.findByRef(req.divisionId, req.kind, req.refTable, req.refId)
  if (existing) return { status: 'duplicate', approval: existing }

  const rule = await deps.rules.get(req.divisionId, req.kind, req.category)

  // Three independent reasons this cannot auto-run, checked before graduation:
  // the hard-coded platform list, the rule's own never_auto flag, and the division's
  // spend cap. All of them outrank earned autonomy.
  const blockedReasons: string[] = []
  const hardCoded = neverAutoReason(req)
  if (hardCoded) blockedReasons.push(hardCoded)
  if (rule?.neverAuto) blockedReasons.push('category is marked never_auto')
  if (deps.spendGuard) {
    const capped = await deps.spendGuard.check(req.divisionId)
    if (capped) blockedReasons.push(capped)
  }

  const graduated = rule?.autoEnabled === true
  const auto = graduated && blockedReasons.length === 0

  const now = deps.clock.now()

  const saved = await deps.approvals.insert({
    id: deps.newId(),
    divisionId: req.divisionId,
    kind: req.kind,
    category: req.category,
    refTable: req.refTable,
    refId: req.refId,
    summary: req.summary,
    payload: req.payload,
    decision: auto ? 'approved' : 'pending',
    autoDecided: auto,
    editPayload: null,
    taskId: req.taskId ?? null,
    requestedBy: req.requestedBy,
    decidedBy: auto ? 'system' : null,
    createdAt: now,
    decidedAt: auto ? now : null,
  })

  if (auto) {
    await deps.events.emit({
      divisionId: req.divisionId,
      kind: 'approval.auto_approved',
      level: 'info',
      message: `auto-approved ${req.kind} (${req.category}): ${req.summary}`,
      refTable: 'approvals',
      refId: saved.id,
    })
    await deps.bus.send(`${req.kind}.approved`, eventPayload(saved, saved.payload, 'system', now))
    return { status: 'auto_approved', approval: saved }
  }

  // Only worth surfacing when it actually overrode earned autonomy; otherwise every
  // proposal in an ungraduated category would log a "never auto" line.
  if (blockedReasons.length > 0 && graduated) {
    await deps.events.emit({
      divisionId: req.divisionId,
      kind: 'approval.never_auto',
      level: 'warn',
      message: `held for the operator despite autonomy: ${blockedReasons.join('; ')}`,
      refTable: 'approvals',
      refId: saved.id,
    })
  }

  // The task waits here. This is what makes an agent's run end at the gate.
  if (saved.taskId && deps.tasks) {
    await deps.tasks.block(saved.taskId, saved.id)
  }

  await deps.events.emit({
    divisionId: req.divisionId,
    kind: 'approval.requested',
    level: 'info',
    message: `${req.kind} awaiting approval: ${req.summary}`,
    refTable: 'approvals',
    refId: saved.id,
  })
  await deps.bus.send('approval.requested', eventPayload(saved, saved.payload, req.requestedBy, now))

  return { status: 'pending', approval: saved }
}

export interface DecisionResult {
  approval: ApprovalRow
  rule: ApprovalRule
  graduated: boolean
  autonomyRevoked: boolean
}

export async function decideApproval(
  input: DecisionInput,
  deps: GateDeps,
): Promise<DecisionResult> {
  const row = await deps.approvals.findById(input.approvalId)
  if (!row) throw new ApprovalNotFoundError(input.approvalId)
  if (row.decision !== 'pending') throw new AlreadyDecidedError(input.approvalId, row.decision)
  if (input.decision === 'edited' && input.editPayload === undefined) {
    throw new Error('editPayload is required when the decision is "edited"')
  }

  const now = deps.clock.now()
  const approval = await deps.approvals.update(row.id, {
    decision: input.decision,
    decidedBy: input.decidedBy,
    decidedAt: now,
    editPayload: input.decision === 'edited' ? input.editPayload : null,
  })

  const { rule, graduated, autonomyRevoked } = await updateCounters(approval, input.decision, deps)

  await deps.events.emit({
    divisionId: approval.divisionId,
    kind: 'approval.decided',
    level: 'info',
    message: `${approval.kind} ${input.decision} by ${input.decidedBy}: ${approval.summary}`,
    refTable: 'approvals',
    refId: approval.id,
  })

  if (graduated) {
    await deps.events.emit({
      divisionId: approval.divisionId,
      kind: 'approval.graduated',
      level: 'info',
      message: `${rule.kind}/${rule.category} earned auto-approval (${rule.approvedCount}/${rule.thresholdCount})`,
      refTable: 'approval_rules',
      refId: `${rule.kind}:${rule.category}`,
    })
  }
  if (autonomyRevoked) {
    await deps.events.emit({
      divisionId: approval.divisionId,
      kind: 'approval.autonomy_revoked',
      level: 'warn',
      message: `${rule.kind}/${rule.category} lost auto-approval after a rejection; counters reset`,
      refTable: 'approval_rules',
      refId: `${rule.kind}:${rule.category}`,
    })
  }

  // An edit ships the operator's version, not the agent's.
  const shipped = input.decision === 'edited' ? input.editPayload : approval.payload
  const eventName =
    input.decision === 'rejected' ? `${approval.kind}.rejected` : `${approval.kind}.approved`

  await deps.bus.send(eventName, eventPayload(approval, shipped, input.decidedBy, now))
  // The orchestrator listens for this to resume the blocked task with the decision.
  await deps.bus.send('approval.decided', {
    ...eventPayload(approval, shipped, input.decidedBy, now),
    decision: input.decision,
  })

  return { approval, rule, graduated, autonomyRevoked }
}

/**
 * Move the graduated-autonomy counters for this bucket.
 *
 * Only decisions a human made are counted. A bucket that approved its own work would
 * hold its rate at 100% forever and could never be re-tested against real operator
 * judgement.
 */
async function updateCounters(
  approval: ApprovalRow,
  decision: Exclude<DecisionInput['decision'], never>,
  deps: GateDeps,
): Promise<{ rule: ApprovalRule; graduated: boolean; autonomyRevoked: boolean }> {
  const current =
    (await deps.rules.get(approval.divisionId, approval.kind, approval.category)) ??
    defaultRule(approval.divisionId, approval.kind, approval.category)

  if (approval.autoDecided) {
    return { rule: current, graduated: false, autonomyRevoked: false }
  }

  const next: ApprovalRule = { ...current }
  if (decision === 'approved') next.approvedCount += 1
  else if (decision === 'rejected') next.rejectedCount += 1
  else next.editedCount += 1

  let graduated = false
  let autonomyRevoked = false

  if (decision === 'rejected' && current.autoEnabled) {
    // One bad decision in the auto era pulls the whole category back under review.
    next.autoEnabled = false
    next.approvedCount = 0
    next.rejectedCount = 0
    next.editedCount = 0
    autonomyRevoked = true
  } else if (!next.autoEnabled && !next.neverAuto) {
    const decided = next.approvedCount + next.rejectedCount + next.editedCount
    if (decided >= next.thresholdCount && next.approvedCount / decided >= next.thresholdRate) {
      next.autoEnabled = true
      graduated = true
    }
  }

  const rule = await deps.rules.upsert(next)
  return { rule, graduated, autonomyRevoked }
}
