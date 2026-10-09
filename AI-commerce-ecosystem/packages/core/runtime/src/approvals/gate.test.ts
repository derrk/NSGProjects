import { beforeEach, describe, expect, it } from 'vitest'

import { DIVISION, gateHarness, type GateHarness } from '../../test/fakes'
import { decideApproval, requestApproval } from './gate'
import {
  AlreadyDecidedError,
  ApprovalNotFoundError,
  type ApprovalRequest,
  type GateDeps,
} from './types'

let h: GateHarness
let deps: GateDeps

beforeEach(() => {
  h = gateHarness()
  deps = h
})

function conceptRequest(over: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    divisionId: DIVISION,
    kind: 'concept',
    category: 'nurses',
    refTable: 'pod.concepts',
    refId: 'concept_1',
    summary: 'Funny nurse mug: "Powered by caffeine and chaos"',
    payload: { title: 'Powered by caffeine and chaos', ipRisk: 'low' },
    requestedBy: 'agent:scout',
    ...over,
  }
}

/** Put a bucket in the graduated state so auto-approval is live. */
function graduate(h: GateHarness, over: Parameters<GateHarness['rules']['seed']>[0]) {
  return h.rules.seed({ approvedCount: 20, autoEnabled: true, ...over })
}

describe('requestApproval', () => {
  it('writes a pending approval and emits approval.requested', async () => {
    const out = await requestApproval(conceptRequest(), deps)

    expect(out.status).toBe('pending')
    expect(out.approval).toMatchObject({
      decision: 'pending',
      autoDecided: false,
      divisionId: DIVISION,
      refTable: 'pod.concepts',
    })
    expect(h.approvals.all()).toHaveLength(1)
    expect(h.bus.names()).toEqual(['approval.requested'])
  })

  it('does not resume the pipeline while the item is pending', async () => {
    await requestApproval(conceptRequest(), deps)
    expect(h.bus.names()).not.toContain('concept.approved')
  })

  it('blocks the task that is waiting on it', async () => {
    const out = await requestApproval(conceptRequest({ taskId: 'task_7' }), deps)

    expect(h.tasks.blocked).toEqual([{ taskId: 'task_7', approvalId: out.approval.id }])
  })

  it('is idempotent on the reference, so a retried run cannot double-queue', async () => {
    const first = await requestApproval(conceptRequest(), deps)
    const second = await requestApproval(conceptRequest(), deps)

    expect(second.status).toBe('duplicate')
    expect(second.approval.id).toBe(first.approval.id)
    expect(h.approvals.all()).toHaveLength(1)
    expect(h.bus.names()).toEqual(['approval.requested'])
  })

  it('scopes idempotency to the division', async () => {
    await requestApproval(conceptRequest(), deps)
    const other = await requestApproval(conceptRequest({ divisionId: 'div_other' }), deps)

    // Two divisions proposing the same ref id are two different proposals.
    expect(other.status).toBe('pending')
    expect(h.approvals.all()).toHaveLength(2)
  })

  it('lets a previously rejected reference be proposed again', async () => {
    const first = await requestApproval(conceptRequest(), deps)
    await decideApproval(
      { approvalId: first.approval.id, decision: 'rejected', decidedBy: 'user:1' },
      deps,
    )

    const second = await requestApproval(conceptRequest(), deps)
    expect(second.status).toBe('pending')
    expect(second.approval.id).not.toBe(first.approval.id)
  })

  it('pends by default when the category has no rule row yet', async () => {
    const out = await requestApproval(conceptRequest({ category: 'brand-new' }), deps)
    expect(out.status).toBe('pending')
  })

  describe('once a category has graduated', () => {
    beforeEach(() => {
      graduate(h, { kind: 'concept', category: 'nurses' })
    })

    it('auto-approves and resumes the pipeline without touching the inbox', async () => {
      const out = await requestApproval(conceptRequest(), deps)

      expect(out.status).toBe('auto_approved')
      expect(out.approval).toMatchObject({
        decision: 'approved',
        autoDecided: true,
        decidedBy: 'system',
      })
      expect(h.bus.names()).toEqual(['concept.approved'])
      expect(h.bus.names()).not.toContain('approval.requested')
    })

    it('does not block the task when it decides on the spot', async () => {
      await requestApproval(conceptRequest({ taskId: 'task_7' }), deps)
      expect(h.tasks.blocked).toEqual([])
    })

    it('still writes an audit row and an event for the auto decision', async () => {
      await requestApproval(conceptRequest(), deps)
      expect(h.approvals.all()).toHaveLength(1)
      expect(h.events.kinds()).toContain('approval.auto_approved')
    })

    it('does not count its own auto decision toward the graduation counters', async () => {
      await requestApproval(conceptRequest(), deps)

      // If auto-approvals counted, a graduated bucket would drive its own approval
      // rate to 100% and could never be re-tested against operator judgement.
      expect(await h.rules.get(DIVISION, 'concept', 'nurses')).toMatchObject({
        approvedCount: 20,
        rejectedCount: 0,
        editedCount: 0,
      })
    })

    it('only auto-approves the category that graduated', async () => {
      const out = await requestApproval(
        conceptRequest({ category: 'teachers', refId: 'concept_2' }),
        deps,
      )
      expect(out.status).toBe('pending')
    })

    it('only auto-approves in the division that graduated', async () => {
      const out = await requestApproval(
        conceptRequest({ divisionId: 'div_other', refId: 'concept_3' }),
        deps,
      )
      // Autonomy is earned per division. A second POD shop starts from zero.
      expect(out.status).toBe('pending')
    })
  })
})

describe('requestApproval never-auto rules', () => {
  it('honours the never_auto flag on the rule row', async () => {
    graduate(h, { kind: 'concept', category: 'nurses', neverAuto: true })

    const out = await requestApproval(conceptRequest(), deps)

    expect(out.status).toBe('pending')
    expect(h.events.byKind('approval.never_auto')[0]?.message).toMatch(/never_auto/)
  })

  it.each([
    ['refund', 'refunds'],
    ['purchase', 'purchases'],
    ['buy_lot', 'buying inventory'],
    ['contract', 'contracts'],
  ])('never auto-approves a %s, in any module', async (kind, phrase) => {
    graduate(h, { kind, category: 'any' })

    const out = await requestApproval(
      conceptRequest({ kind, category: 'any', refId: `ref_${kind}` }),
      deps,
    )

    expect(out.status).toBe('pending')
    expect(h.events.byKind('approval.never_auto')[0]?.message).toContain(phrase)
  })

  it.each([
    ['complaint', 'complaint'],
    ['custom', 'custom'],
  ])('sends a %s reply to the operator even in a graduated category', async (intent) => {
    graduate(h, { kind: 'reply', category: intent })

    const out = await requestApproval(
      conceptRequest({
        kind: 'reply',
        category: intent,
        refTable: 'pod.messages',
        refId: `msg_${intent}`,
        payload: { intent, replyBody: 'Thanks for reaching out.' },
      }),
      deps,
    )

    expect(out.status).toBe('pending')
  })

  it.each([
    ['a lawyer', 'I am talking to my lawyer about this.'],
    ['a chargeback', 'I will file a chargeback with my bank.'],
    ['a wrong item', 'You sent the wrong item, this is a large not a medium.'],
    ['damage', 'The mug arrived cracked.'],
  ])('escalates a shipping question that also mentions %s', async (_label, customerMessage) => {
    graduate(h, { kind: 'reply', category: 'shipping_eta' })

    const out = await requestApproval(
      conceptRequest({
        kind: 'reply',
        category: 'shipping_eta',
        refTable: 'pod.messages',
        refId: 'msg_2',
        payload: { intent: 'shipping_eta', customerMessage, replyBody: 'It ships in 3 days.' },
      }),
      deps,
    )

    expect(out.status).toBe('pending')
  })

  it.each([
    'It will arrive before Christmas.',
    'You should have it by Dec 24.',
    'Christmas delivery is guaranteed if you order today.',
    'This will ship in time for the holidays.',
  ])('blocks a draft that promises a December delivery date: %s', async (replyBody) => {
    graduate(h, { kind: 'reply', category: 'shipping_eta' })

    const out = await requestApproval(
      conceptRequest({
        kind: 'reply',
        category: 'shipping_eta',
        refTable: 'pod.messages',
        refId: `msg_${replyBody.length}`,
        payload: { intent: 'shipping_eta', customerMessage: 'When will it arrive?', replyBody },
      }),
      deps,
    )

    expect(out.status).toBe('pending')
  })

  it('still auto-sends an ordinary shipping reply with no December promise', async () => {
    graduate(h, { kind: 'reply', category: 'shipping_eta' })

    const out = await requestApproval(
      conceptRequest({
        kind: 'reply',
        category: 'shipping_eta',
        refTable: 'pod.messages',
        refId: 'msg_3',
        payload: {
          intent: 'shipping_eta',
          customerMessage: 'Any update on my order?',
          replyBody: 'Your order is in production and tracking will follow once it ships.',
        },
      }),
      deps,
    )

    expect(out.status).toBe('auto_approved')
  })

  it('never auto-approves anything flagged ip_risk=high', async () => {
    graduate(h, { kind: 'concept', category: 'nurses' })

    const out = await requestApproval(
      conceptRequest({ payload: { title: 'risky', ipRisk: 'high' } }),
      deps,
    )

    expect(out.status).toBe('pending')
  })

  it.each([
    ['above the limit', 22, 'pending'],
    ['a large cut', -40, 'pending'],
    ['within the limit', 4, 'auto_approved'],
  ])('handles a price change %s', async (_label, pctChange, expected) => {
    graduate(h, { kind: 'price_change', category: 'mug' })

    const out = await requestApproval(
      conceptRequest({
        kind: 'price_change',
        category: 'mug',
        refTable: 'pod.products',
        refId: `prod_${pctChange}`,
        payload: { pctChange },
      }),
      deps,
    )

    expect(out.status).toBe(expected)
  })

  it('fails safe when the price change percentage is missing', async () => {
    graduate(h, { kind: 'price_change', category: 'mug' })

    const out = await requestApproval(
      conceptRequest({
        kind: 'price_change',
        category: 'mug',
        refTable: 'pod.products',
        refId: 'prod_x',
        payload: {},
      }),
      deps,
    )

    expect(out.status).toBe('pending')
  })
})

describe('requestApproval spend cap', () => {
  it('stops auto-approving when the division is over its cap', async () => {
    graduate(h, { kind: 'concept', category: 'nurses' })
    deps = { ...h, spendGuard: { check: async () => 'daily spend cap of $25 reached' } }

    const out = await requestApproval(conceptRequest(), deps)

    // The cap is a rule, not a prompt instruction, so earned autonomy does not
    // override it.
    expect(out.status).toBe('pending')
    expect(h.events.byKind('approval.never_auto')[0]?.message).toMatch(/spend cap/)
  })

  it('checks the cap for the requesting division', async () => {
    const seen: string[] = []
    deps = {
      ...h,
      spendGuard: {
        check: async (divisionId) => {
          seen.push(divisionId)
          return null
        },
      },
    }

    await requestApproval(conceptRequest({ divisionId: 'div_cards' }), deps)
    expect(seen).toEqual(['div_cards'])
  })

  it('auto-approves normally when the division is under its cap', async () => {
    graduate(h, { kind: 'concept', category: 'nurses' })
    deps = { ...h, spendGuard: { check: async () => null } }

    expect((await requestApproval(conceptRequest(), deps)).status).toBe('auto_approved')
  })
})

describe('decideApproval', () => {
  async function pending(over: Partial<ApprovalRequest> = {}) {
    const out = await requestApproval(conceptRequest(over), deps)
    h.bus.sent.length = 0
    h.events.events.length = 0
    return out.approval
  }

  it('approves, stamps the decision and resumes the pipeline', async () => {
    const row = await pending()

    const result = await decideApproval(
      { approvalId: row.id, decision: 'approved', decidedBy: 'user:1' },
      deps,
    )

    expect(result.approval).toMatchObject({ decision: 'approved', decidedBy: 'user:1' })
    expect(h.bus.names()).toEqual(['concept.approved', 'approval.decided'])
  })

  it('tells the orchestrator which task to resume', async () => {
    const row = await pending({ taskId: 'task_9' })
    await decideApproval({ approvalId: row.id, decision: 'approved', decidedBy: 'user:1' }, deps)

    expect(h.bus.find('approval.decided')!.data).toMatchObject({
      taskId: 'task_9',
      decision: 'approved',
    })
  })

  it('rejects and emits the rejection event instead', async () => {
    const row = await pending()
    await decideApproval({ approvalId: row.id, decision: 'rejected', decidedBy: 'user:1' }, deps)

    expect(h.bus.names()).toContain('concept.rejected')
    expect(h.bus.names()).not.toContain('concept.approved')
  })

  it('treats an edit as an approval of the edited payload', async () => {
    const row = await pending()
    const editPayload = { title: 'Operator rewrote this' }

    const result = await decideApproval(
      { approvalId: row.id, decision: 'edited', decidedBy: 'user:1', editPayload },
      deps,
    )

    expect(result.approval.editPayload).toEqual(editPayload)
    // An edit still moves the pipeline forward, carrying the operator's version.
    expect(h.bus.find('concept.approved')!.data).toMatchObject({ payload: editPayload })
  })

  it('refuses an edit decision with no edited payload', async () => {
    const row = await pending()
    await expect(
      decideApproval({ approvalId: row.id, decision: 'edited', decidedBy: 'user:1' }, deps),
    ).rejects.toThrow(/editPayload/i)
  })

  it('refuses to decide the same approval twice', async () => {
    const row = await pending()
    await decideApproval({ approvalId: row.id, decision: 'approved', decidedBy: 'user:1' }, deps)

    await expect(
      decideApproval({ approvalId: row.id, decision: 'rejected', decidedBy: 'user:1' }, deps),
    ).rejects.toBeInstanceOf(AlreadyDecidedError)
  })

  it('does not emit a second event when a double decision is refused', async () => {
    const row = await pending()
    await decideApproval({ approvalId: row.id, decision: 'approved', decidedBy: 'user:1' }, deps)
    h.bus.sent.length = 0

    await decideApproval(
      { approvalId: row.id, decision: 'approved', decidedBy: 'user:1' },
      deps,
    ).catch(() => {})

    expect(h.bus.sent).toHaveLength(0)
  })

  it('throws for an unknown approval id', async () => {
    await expect(
      decideApproval({ approvalId: 'nope', decision: 'approved', decidedBy: 'user:1' }, deps),
    ).rejects.toBeInstanceOf(ApprovalNotFoundError)
  })
})

describe('graduated autonomy counters', () => {
  async function decide(decision: 'approved' | 'rejected' | 'edited', refId: string) {
    const out = await requestApproval(conceptRequest({ refId }), deps)
    if (out.status !== 'pending') throw new Error(`expected pending, got ${out.status}`)
    await decideApproval(
      {
        approvalId: out.approval.id,
        decision,
        decidedBy: 'user:1',
        ...(decision === 'edited' ? { editPayload: { edited: true } } : {}),
      },
      deps,
    )
  }

  it('counts an approval, a rejection and an edit in separate buckets', async () => {
    await decide('approved', 'c1')
    await decide('rejected', 'c2')
    await decide('edited', 'c3')

    expect(await h.rules.get(DIVISION, 'concept', 'nurses')).toMatchObject({
      approvedCount: 1,
      rejectedCount: 1,
      editedCount: 1,
    })
  })

  it('creates the rule row on first decision with the kind default threshold', async () => {
    await decide('approved', 'c1')

    expect(await h.rules.get(DIVISION, 'concept', 'nurses')).toMatchObject({
      thresholdCount: 20,
      thresholdRate: 0.95,
      autoEnabled: false,
    })
  })

  it('holds designs to a 50-item threshold rather than 20', async () => {
    const out = await requestApproval(
      conceptRequest({ kind: 'design', category: 'flat-vector', refId: 'd1' }),
      deps,
    )
    await decideApproval(
      { approvalId: out.approval.id, decision: 'approved', decidedBy: 'user:1' },
      deps,
    )

    // A bad listing is embarrassing; a bad design is a takedown.
    expect(await h.rules.get(DIVISION, 'design', 'flat-vector')).toMatchObject({
      thresholdCount: 50,
    })
  })

  it('does not graduate below the threshold even at a perfect rate', async () => {
    h.rules.seed({ kind: 'concept', category: 'nurses', approvedCount: 18 })
    await decide('approved', 'c1')

    expect(await h.rules.get(DIVISION, 'concept', 'nurses')).toMatchObject({
      approvedCount: 19,
      autoEnabled: false,
    })
  })

  it('graduates at the threshold when the rate is high enough', async () => {
    h.rules.seed({ kind: 'concept', category: 'nurses', approvedCount: 19 })
    await decide('approved', 'c1')

    expect(await h.rules.get(DIVISION, 'concept', 'nurses')).toMatchObject({
      approvedCount: 20,
      autoEnabled: true,
    })
    expect(h.events.kinds()).toContain('approval.graduated')
  })

  it('does not graduate at the threshold when the approval rate is below 95%', async () => {
    // 18 approved + 1 rejected + this edit = 20 decided at 18/20 = 90%.
    h.rules.seed({ kind: 'concept', category: 'nurses', approvedCount: 18, rejectedCount: 1 })
    await decide('edited', 'c1')

    expect(await h.rules.get(DIVISION, 'concept', 'nurses')).toMatchObject({
      editedCount: 1,
      autoEnabled: false,
    })
  })

  it('counts an edit against the approval rate', async () => {
    h.rules.seed({ kind: 'concept', category: 'nurses', approvedCount: 19 })
    await decide('edited', 'c1')

    // 19 approved of 20 decided = 95%, which clears the bar.
    expect(await h.rules.get(DIVISION, 'concept', 'nurses')).toMatchObject({ autoEnabled: true })
  })

  it('never graduates a bucket marked never_auto', async () => {
    h.rules.seed({ kind: 'concept', category: 'nurses', approvedCount: 19, neverAuto: true })
    await decide('approved', 'c1')

    expect(await h.rules.get(DIVISION, 'concept', 'nurses')).toMatchObject({
      approvedCount: 20,
      autoEnabled: false,
    })
  })

  it('disables autonomy and resets the counters when a graduated category is rejected', async () => {
    h.rules.seed({
      kind: 'reply',
      category: 'shipping_eta',
      approvedCount: 40,
      autoEnabled: true,
    })

    // A never-auto item still reaches the inbox in a graduated category, which is how
    // autonomy gets revoked at all.
    const out = await requestApproval(
      conceptRequest({
        kind: 'reply',
        category: 'shipping_eta',
        refTable: 'pod.messages',
        refId: 'msg_9',
        payload: { intent: 'shipping_eta', customerMessage: 'It arrived damaged', replyBody: 'Sorry!' },
      }),
      deps,
    )
    expect(out.status).toBe('pending')

    await decideApproval(
      { approvalId: out.approval.id, decision: 'rejected', decidedBy: 'user:1' },
      deps,
    )

    expect(await h.rules.get(DIVISION, 'reply', 'shipping_eta')).toMatchObject({
      autoEnabled: false,
      approvedCount: 0,
      rejectedCount: 0,
      editedCount: 0,
    })
    expect(h.events.kinds()).toContain('approval.autonomy_revoked')
  })

  it('leaves other categories alone when one is revoked', async () => {
    h.rules.seed({ kind: 'reply', category: 'shipping_eta', approvedCount: 40, autoEnabled: true })
    h.rules.seed({ kind: 'reply', category: 'tracking', approvedCount: 40, autoEnabled: true })

    const out = await requestApproval(
      conceptRequest({
        kind: 'reply',
        category: 'shipping_eta',
        refTable: 'pod.messages',
        refId: 'msg_10',
        payload: { intent: 'shipping_eta', customerMessage: 'broken', replyBody: 'Sorry!' },
      }),
      deps,
    )
    await decideApproval(
      { approvalId: out.approval.id, decision: 'rejected', decidedBy: 'user:1' },
      deps,
    )

    expect(await h.rules.get(DIVISION, 'reply', 'tracking')).toMatchObject({ autoEnabled: true })
  })
})
