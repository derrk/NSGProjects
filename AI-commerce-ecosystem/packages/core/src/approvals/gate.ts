/**
 * The approval gate (SPEC.md §Orchestrator).
 *
 * `requestApproval` is the ONLY way an agent proposes a side effect. It either parks
 * the proposal in the operator's inbox or — once that category has earned autonomy —
 * decides it on the spot. Either way the agent's job ends there; the pipeline resumes
 * when an event fires.
 */

import { neverAutoReason } from './never-auto'
import {
  AlreadyDecidedError,
  ApprovalNotFoundError,
  DEFAULT_REQUIRED_RATE,
  DEFAULT_THRESHOLDS,
  type ApprovalKind,
  type ApprovalOutcome,
  type ApprovalRequest,
  type ApprovalRow,
  type ApprovalRule,
  type DecisionInput,
  type GateDeps,
} from './types'

/** Strip the `agent:` prefix so events land on the right station. */
function stationOf(actor: string): string {
  return actor.startsWith('agent:') ? actor.slice('agent:'.length) : actor
}

function defaultRule(kind: ApprovalKind, category: string): ApprovalRule {
  return {
    kind,
    category,
    approvedCount: 0,
    rejectedCount: 0,
    editedCount: 0,
    autoEnabled: false,
    threshold: DEFAULT_THRESHOLDS[kind],
    requiredRate: DEFAULT_REQUIRED_RATE,
  }
}

function eventPayload(row: ApprovalRow, payload: unknown, actor: string, ts: Date) {
  return {
    approvalId: row.id,
    kind: row.kind,
    category: row.category,
    refId: row.refId,
    shopId: row.shopId,
    payload,
    actor,
    ts: ts.toISOString(),
  }
}

export async function requestApproval(req: ApprovalRequest, deps: GateDeps): Promise<ApprovalOutcome> {
  // An orchestrator retry must not queue the same proposal twice.
  const existing = await deps.approvals.findByRef(req.kind, req.refId)
  if (existing) return { status: 'duplicate', approval: existing }

  const blocked = neverAutoReason(req)
  const rule = await deps.rules.get(req.kind, req.category)
  const graduated = rule?.autoEnabled === true
  const auto = graduated && blocked === null

  const now = deps.clock.now()
  const station = stationOf(req.requestedBy)

  const saved = await deps.approvals.insert({
    id: deps.newId(),
    shopId: req.shopId ?? null,
    kind: req.kind,
    category: req.category,
    refId: req.refId,
    summary: req.summary,
    payload: req.payload,
    decision: auto ? 'approved' : 'pending',
    autoDecided: auto,
    editPayload: null,
    requestedBy: req.requestedBy,
    decidedBy: auto ? 'system' : null,
    createdAt: now,
    decidedAt: auto ? now : null,
  })

  if (auto) {
    await deps.events.emit({
      agent: station,
      kind: 'approval.auto_approved',
      level: 'info',
      message: `auto-approved ${req.kind} (${req.category}): ${req.summary}`,
      refTable: 'approvals',
      refId: saved.id,
    })
    await deps.bus.send(`${req.kind}.approved`, eventPayload(saved, saved.payload, 'system', now))
    return { status: 'auto_approved', approval: saved }
  }

  // Worth surfacing only when it actually overrode an earned autonomy — otherwise
  // every proposal in an ungraduated category would log a "never auto" line.
  if (blocked !== null && graduated) {
    await deps.events.emit({
      agent: station,
      kind: 'approval.never_auto',
      level: 'warn',
      message: `held for the operator despite autonomy: ${blocked}`,
      refTable: 'approvals',
      refId: saved.id,
    })
  }

  await deps.events.emit({
    agent: station,
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

export async function decideApproval(input: DecisionInput, deps: GateDeps): Promise<DecisionResult> {
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
    agent: 'orchestrator',
    kind: 'approval.decided',
    level: 'info',
    message: `${approval.kind} ${input.decision} by ${input.decidedBy}: ${approval.summary}`,
    refTable: 'approvals',
    refId: approval.id,
  })

  if (graduated) {
    await deps.events.emit({
      agent: 'orchestrator',
      kind: 'approval.graduated',
      level: 'info',
      message: `${rule.kind}/${rule.category} earned auto-approval (${rule.approvedCount}/${rule.threshold})`,
      refTable: 'approval_rules',
      refId: `${rule.kind}:${rule.category}`,
    })
  }
  if (autonomyRevoked) {
    await deps.events.emit({
      agent: 'orchestrator',
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

  return { approval, rule, graduated, autonomyRevoked }
}

/**
 * Move the graduated-autonomy counters for this bucket.
 *
 * Only decisions a human made are counted. A bucket that auto-approves its own work
 * would otherwise hold its approval rate at 100% forever and could never be
 * re-tested against real operator judgement.
 */
async function updateCounters(
  approval: ApprovalRow,
  decision: Exclude<DecisionInput['decision'], never>,
  deps: GateDeps,
): Promise<{ rule: ApprovalRule; graduated: boolean; autonomyRevoked: boolean }> {
  const current =
    (await deps.rules.get(approval.kind, approval.category)) ??
    defaultRule(approval.kind, approval.category)

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
    // One bad auto-era decision is enough to pull the category back under review.
    next.autoEnabled = false
    next.approvedCount = 0
    next.rejectedCount = 0
    next.editedCount = 0
    autonomyRevoked = true
  } else if (!next.autoEnabled) {
    const decided = next.approvedCount + next.rejectedCount + next.editedCount
    if (decided >= next.threshold && next.approvedCount / decided >= next.requiredRate) {
      next.autoEnabled = true
      graduated = true
    }
  }

  const rule = await deps.rules.upsert(next)
  return { rule, graduated, autonomyRevoked }
}
