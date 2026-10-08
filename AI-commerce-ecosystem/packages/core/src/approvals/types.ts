/**
 * Approval gate domain types.
 *
 * The gate is the only way an agent proposes a side effect (SPEC.md §Orchestrator).
 * Everything it touches is injected as a port so the gate can be tested without a
 * database, a scheduler or a network.
 */

/** Every kind of side effect an agent can propose. */
export type ApprovalKind =
  | 'concept'
  | 'design'
  | 'product'
  | 'reply'
  | 'price_change'
  /** New-shop recommendation from the Strategist agent. Never auto-approves. */
  | 'shop_proposal'

export type Decision = 'pending' | 'approved' | 'rejected' | 'edited'

/** Who caused a state change. Mirrors the `created_by` convention in the data model. */
export type Actor = `agent:${string}` | 'operator' | 'system'

export interface ApprovalRow {
  id: string
  shopId: string | null
  kind: ApprovalKind
  /**
   * The graduated-autonomy bucket this item belongs to, e.g. the niche type for a
   * concept, the intent for a reply, the product type for a product. Supplied by the
   * caller: the gate deliberately does not parse payloads to work it out.
   */
  category: string
  refId: string
  summary: string
  payload: unknown
  decision: Decision
  /** True when the gate decided this without showing it to the operator. */
  autoDecided: boolean
  editPayload: unknown | null
  requestedBy: Actor
  decidedBy: Actor | null
  createdAt: Date
  decidedAt: Date | null
}

/**
 * Graduated-autonomy counters for one (kind, category) bucket.
 *
 * Only operator decisions are counted. See `recordDecision` for why.
 */
export interface ApprovalRule {
  kind: ApprovalKind
  category: string
  approvedCount: number
  rejectedCount: number
  /**
   * Operator edits are tracked separately from rejections: an edit means the agent's
   * output was close but not shippable, which is still evidence that the operator is
   * needed. It counts against the approval rate without being a rejection.
   */
  editedCount: number
  autoEnabled: boolean
  /** Decisions required before a bucket may graduate. 20 by default, 50 for designs. */
  threshold: number
  /** Approval rate required to graduate, as a fraction. 0.95 by default. */
  requiredRate: number
}

export interface ApprovalRequest {
  kind: ApprovalKind
  category: string
  refId: string
  shopId?: string | null
  summary: string
  payload: unknown
  requestedBy: Actor
}

export type ApprovalOutcome =
  | { status: 'pending'; approval: ApprovalRow }
  /** The bucket has graduated; the gate decided without the operator. */
  | { status: 'auto_approved'; approval: ApprovalRow }
  /** An identical request already exists; the existing row is returned untouched. */
  | { status: 'duplicate'; approval: ApprovalRow }

export interface DecisionInput {
  approvalId: string
  decision: Exclude<Decision, 'pending'>
  decidedBy: Actor
  /** Required when `decision` is `edited`; the payload that should actually ship. */
  editPayload?: unknown
}

/** Raised when a caller tries to decide an approval that is no longer pending. */
export class AlreadyDecidedError extends Error {
  constructor(
    readonly approvalId: string,
    readonly current: Decision,
  ) {
    super(`approval ${approvalId} is already ${current}`)
    this.name = 'AlreadyDecidedError'
  }
}

export class ApprovalNotFoundError extends Error {
  constructor(readonly approvalId: string) {
    super(`approval ${approvalId} not found`)
    this.name = 'ApprovalNotFoundError'
  }
}

/* ------------------------------------------------------------------ *
 * Ports
 * ------------------------------------------------------------------ */

export interface ApprovalStore {
  /** Look up a non-rejected request for this (kind, refId), for idempotency. */
  findByRef(kind: ApprovalKind, refId: string): Promise<ApprovalRow | null>
  insert(row: ApprovalRow): Promise<ApprovalRow>
  findById(id: string): Promise<ApprovalRow | null>
  update(id: string, patch: Partial<ApprovalRow>): Promise<ApprovalRow>
}

export interface RuleStore {
  get(kind: ApprovalKind, category: string): Promise<ApprovalRule | null>
  upsert(rule: ApprovalRule): Promise<ApprovalRule>
}

/** Append-only audit log; the command center subscribes to it. */
export interface EventSink {
  emit(event: {
    agent: string
    kind: string
    level: 'info' | 'warn' | 'error'
    message: string
    refTable?: string
    refId?: string
  }): Promise<void>
}

/** Inngest. Emitting an event is what resumes a paused pipeline. */
export interface EventBus {
  send(name: string, data: Record<string, unknown>): Promise<void>
}

export interface Clock {
  now(): Date
}

export interface IdGenerator {
  (): string
}

export interface GateDeps {
  approvals: ApprovalStore
  rules: RuleStore
  events: EventSink
  bus: EventBus
  clock: Clock
  newId: IdGenerator
}

/** Default graduation thresholds. Designs are held to a higher bar (SPEC.md §Guardrails). */
export const DEFAULT_THRESHOLDS: Record<ApprovalKind, number> = {
  concept: 20,
  design: 50,
  product: 20,
  reply: 20,
  price_change: 20,
  shop_proposal: 20,
}

export const DEFAULT_REQUIRED_RATE = 0.95
