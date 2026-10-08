/**
 * In-memory implementations of every port the approval gate and the agent run wrapper
 * depend on. These let the whole orchestration contract be tested with no database,
 * no scheduler, no network and no clock.
 */

import type {
  ApprovalKind,
  ApprovalRow,
  ApprovalRule,
  ApprovalStore,
  Clock,
  EventBus,
  EventSink,
  RuleStore,
} from '../src/approvals/types.js'
import type { AgentRunRecord, AgentRunStore, Sleeper } from '../src/runtime/types.js'

export interface RecordedEvent {
  agent: string
  kind: string
  level: 'info' | 'warn' | 'error'
  message: string
  refTable?: string
  refId?: string
}

export class FakeEventSink implements EventSink {
  readonly events: RecordedEvent[] = []

  async emit(event: RecordedEvent): Promise<void> {
    this.events.push(event)
  }

  kinds(): string[] {
    return this.events.map((e) => e.kind)
  }

  byKind(kind: string): RecordedEvent[] {
    return this.events.filter((e) => e.kind === kind)
  }
}

export class FakeEventBus implements EventBus {
  readonly sent: Array<{ name: string; data: Record<string, unknown> }> = []

  async send(name: string, data: Record<string, unknown>): Promise<void> {
    this.sent.push({ name, data })
  }

  names(): string[] {
    return this.sent.map((s) => s.name)
  }

  find(name: string) {
    return this.sent.find((s) => s.name === name)
  }
}

export class FakeApprovalStore implements ApprovalStore {
  readonly rows = new Map<string, ApprovalRow>()

  async findByRef(kind: ApprovalKind, refId: string): Promise<ApprovalRow | null> {
    for (const row of this.rows.values()) {
      // A rejected request may legitimately be re-proposed later (e.g. a redesigned
      // concept reusing the same ref); anything else is a duplicate.
      if (row.kind === kind && row.refId === refId && row.decision !== 'rejected') {
        return row
      }
    }
    return null
  }

  async insert(row: ApprovalRow): Promise<ApprovalRow> {
    if (this.rows.has(row.id)) throw new Error(`duplicate approval id ${row.id}`)
    this.rows.set(row.id, { ...row })
    return { ...row }
  }

  async findById(id: string): Promise<ApprovalRow | null> {
    const row = this.rows.get(id)
    return row ? { ...row } : null
  }

  async update(id: string, patch: Partial<ApprovalRow>): Promise<ApprovalRow> {
    const row = this.rows.get(id)
    if (!row) throw new Error(`approval ${id} not found`)
    const next = { ...row, ...patch }
    this.rows.set(id, next)
    return { ...next }
  }

  all(): ApprovalRow[] {
    return [...this.rows.values()]
  }
}

export class FakeRuleStore implements RuleStore {
  readonly rules = new Map<string, ApprovalRule>()

  private key(kind: ApprovalKind, category: string) {
    return `${kind}::${category}`
  }

  async get(kind: ApprovalKind, category: string): Promise<ApprovalRule | null> {
    const rule = this.rules.get(this.key(kind, category))
    return rule ? { ...rule } : null
  }

  async upsert(rule: ApprovalRule): Promise<ApprovalRule> {
    this.rules.set(this.key(rule.kind, rule.category), { ...rule })
    return { ...rule }
  }

  /** Test convenience: seed a bucket in a known state. */
  seed(partial: Partial<ApprovalRule> & Pick<ApprovalRule, 'kind' | 'category'>): ApprovalRule {
    const rule: ApprovalRule = {
      approvedCount: 0,
      rejectedCount: 0,
      editedCount: 0,
      autoEnabled: false,
      threshold: 20,
      requiredRate: 0.95,
      ...partial,
    }
    this.rules.set(this.key(rule.kind, rule.category), rule)
    return rule
  }
}

export class FakeAgentRunStore implements AgentRunStore {
  readonly runs = new Map<string, AgentRunRecord>()
  private seq = 0

  async start(record: Omit<AgentRunRecord, 'id'>): Promise<AgentRunRecord> {
    const id = `run_${++this.seq}`
    const row: AgentRunRecord = { ...record, id }
    this.runs.set(id, row)
    return { ...row }
  }

  async finish(id: string, patch: Partial<AgentRunRecord>): Promise<AgentRunRecord> {
    const row = this.runs.get(id)
    if (!row) throw new Error(`agent run ${id} not found`)
    const next = { ...row, ...patch }
    this.runs.set(id, next)
    return { ...next }
  }

  only(): AgentRunRecord {
    const all = [...this.runs.values()]
    if (all.length !== 1) throw new Error(`expected exactly 1 run, found ${all.length}`)
    return all[0]!
  }

  all(): AgentRunRecord[] {
    return [...this.runs.values()]
  }
}

/** A clock that only moves when a test moves it. */
export class FakeClock implements Clock {
  constructor(private current = new Date('2026-10-09T06:00:00.000Z')) {}

  now(): Date {
    return new Date(this.current)
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms)
  }
}

/**
 * Records how long the code under test asked to sleep, without actually sleeping, and
 * advances the supplied clock so elapsed-time accounting stays consistent.
 */
export class FakeSleeper implements Sleeper {
  readonly slept: number[] = []

  constructor(private readonly clock?: FakeClock) {}

  async sleep(ms: number): Promise<void> {
    this.slept.push(ms)
    this.clock?.advance(ms)
  }

  get total(): number {
    return this.slept.reduce((a, b) => a + b, 0)
  }
}

/** Deterministic id generator: id_1, id_2, ... */
export function fakeIds(prefix = 'id'): () => string {
  let n = 0
  return () => `${prefix}_${++n}`
}

/** Deterministic stand-in for Math.random, so jitter is reproducible. */
export function fixedRandom(value = 0.5): () => number {
  return () => value
}

export interface GateHarness {
  approvals: FakeApprovalStore
  rules: FakeRuleStore
  events: FakeEventSink
  bus: FakeEventBus
  clock: FakeClock
  newId: () => string
}

export function gateHarness(): GateHarness {
  return {
    approvals: new FakeApprovalStore(),
    rules: new FakeRuleStore(),
    events: new FakeEventSink(),
    bus: new FakeEventBus(),
    clock: new FakeClock(),
    newId: fakeIds('apr'),
  }
}
