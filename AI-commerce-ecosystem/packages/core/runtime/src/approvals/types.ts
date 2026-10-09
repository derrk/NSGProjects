/**
 * Approval gate domain types.
 *
 * `requestApproval` is the only way an agent causes a side effect (SPEC.md
 * §Orchestrator, tasks and approvals). Everything it touches is a port, so the gate
 * can be tested without a database, a scheduler or a network.
 */

/**
 * Plain string, not an enum.
 *
 * A kind must be registered in `modules.approval_kinds`, so a new module adds its own
 * kinds without a core migration. The inbox renders that module's card for a known
 * kind and a generic JSON card for anything else.
 */
export type ApprovalKind = string

export type Decision = 'pending' | 'approved' | 'rejected' | 'edited'

/** Who caused a state change: `agent:<id>`, `user:<id>`, or the system itself. */
export type Actor = string

export interface ApprovalRow {
  id: string
  divisionId: string
  kind: ApprovalKind
  /**
   * The graduated-autonomy bucket within this kind, e.g. the design style, the reply
   * intent, the product type. Supplied by the caller: the gate deliberately does not
   * parse payloads to work it out.
   */
  category: string
  /** What this is about, as a table name plus id rather than a foreign key. */
  refTable: string
  refId: string
  summary: string
  payload: unknown
  decision: Decision
  /** True when the gate decided this without showing it to the operator. */
  autoDecided: boolean
  editPayload: unknown | null
  /** The task to unblock once this is decided. */
  taskId: string | null
  requestedBy: Actor
  decidedBy: Actor | null
  createdAt: Date
  decidedAt: Date | null
}

/**
 * Graduated-autonomy counters for one (division, kind, category) bucket.
 *
 * Only operator decisions are counted. See `updateCounters` for why.
 */
export interface ApprovalRule {
  divisionId: string
  kind: ApprovalKind
  category: string
  approvedCount: number
  rejectedCount: number
  /**
   * Operator edits are tracked apart from rejections: an edit means the output was
   * close but not shippable, which is still evidence the operator is needed. It counts
   * against the approval rate without being a rejection.
   */
  editedCount: number
  autoEnabled: boolean
  /** Decisions required before a bucket may graduate. 20 by default, 50 for designs. */
  thresholdCount: number
  /** Approval rate required to graduate, as a fraction. 0.95 by default. */
  thresholdRate: number
  /**
   * Absolute. Set by a module (`neverAuto` on its approval kind) or by the operator.
   * Checked before graduation, so a category that has earned autonomy still cannot
   * auto-run this.
   */
  neverAuto: boolean
}

export interface ApprovalRequest {
  divisionId: string
  kind: ApprovalKind
  category: string
  refTable: string
  refId: string
  summary: string
  payload: unknown
  requestedBy: Actor
  /** The task to block while this waits. */
  taskId?: string | null
}

export type ApprovalOutcome =
  | { status: 'pending'; approval: ApprovalRow }
  /** The bucket has graduated; the gate decided without the operator. */
  | { status: 'auto_approved'; approval: ApprovalRow }
  /** An identical live request already exists; the existing row comes back untouched. */
  | { status: 'duplicate'; approval: ApprovalRow }

export interface DecisionInput {
  approvalId: string
  decision: Exclude<Decision, 'pending'>
  decidedBy: Actor
  /** Required when `decision` is `edited`: the payload that should actually ship. */
  editPayload?: unknown
}

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
  /** A live (non-rejected) request for this reference, for idempotency. */
  findByRef(
    divisionId: string,
    kind: ApprovalKind,
    refTable: string,
    refId: string,
  ): Promise<ApprovalRow | null>
  insert(row: ApprovalRow): Promise<ApprovalRow>
  findById(id: string): Promise<ApprovalRow | null>
  update(id: string, patch: Partial<ApprovalRow>): Promise<ApprovalRow>
}

export interface RuleStore {
  get(divisionId: string, kind: ApprovalKind, category: string): Promise<ApprovalRule | null>
  upsert(rule: ApprovalRule): Promise<ApprovalRule>
}

/** Append-only audit log; the floor subscribes to it. */
export interface EventSink {
  emit(event: {
    divisionId?: string | null
    agentId?: string | null
    station?: string | null
    kind: string
    level: 'info' | 'warn' | 'error'
    message: string
    refTable?: string
    refId?: string
  }): Promise<void>
}

/** Inngest. Emitting an event is what resumes a blocked task. */
export interface EventBus {
  send(name: string, data: Record<string, unknown>): Promise<void>
}

/** Marks a task blocked while its approval waits, and unblocks it on a decision. */
export interface TaskGate {
  block(taskId: string, approvalId: string): Promise<void>
}

/**
 * The per-division daily spend cap.
 *
 * Enforced here rather than in a prompt, because a prompt is a request and this is a
 * rule (SPEC.md §Orchestrator → Approval gate).
 */
export interface SpendGuard {
  /** A reason the division may not act, or null to allow. */
  check(divisionId: string): Promise<string | null>
}

export interface Clock {
  now(): Date
}

export type IdGenerator = () => string

export interface GateDeps {
  approvals: ApprovalStore
  rules: RuleStore
  events: EventSink
  bus: EventBus
  clock: Clock
  newId: IdGenerator
  tasks?: TaskGate
  spendGuard?: SpendGuard
}

/**
 * Default graduation thresholds per kind.
 *
 * Designs are held to a higher bar than everything else (SPEC.md §Module 1): a bad
 * listing is embarrassing, a bad design is a takedown.
 */
export const DEFAULT_THRESHOLDS: Record<string, number> = {
  design: 50,
}

export const DEFAULT_THRESHOLD_COUNT = 20
export const DEFAULT_THRESHOLD_RATE = 0.95

export function thresholdFor(kind: ApprovalKind): number {
  return DEFAULT_THRESHOLDS[kind] ?? DEFAULT_THRESHOLD_COUNT
}
