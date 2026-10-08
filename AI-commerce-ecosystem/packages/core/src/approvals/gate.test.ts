import { beforeEach, describe, expect, it } from 'vitest'

import { gateHarness, type GateHarness } from '../../test/fakes.js'
import { decideApproval, requestApproval } from './gate.js'
import {
  AlreadyDecidedError,
  ApprovalNotFoundError,
  type ApprovalRequest,
  type GateDeps,
} from './types.js'

let h: GateHarness
let deps: GateDeps

beforeEach(() => {
  h = gateHarness()
  deps = h
})

function conceptRequest(over: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    kind: 'concept',
    category: 'nurses',
    refId: 'concept_1',
    shopId: 'shop_1',
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
  it('writes a pending approval row and emits approval.requested', async () => {
    const out = await requestApproval(conceptRequest(), deps)

    expect(out.status).toBe('pending')
    expect(out.approval.decision).toBe('pending')
    expect(out.approval.autoDecided).toBe(false)
    expect(out.approval.createdAt).toEqual(h.clock.now())
    expect(h.approvals.all()).toHaveLength(1)
    expect(h.bus.names()).toEqual(['approval.requested'])
    expect(h.bus.find('approval.requested')!.data).toMatchObject({
      approvalId: out.approval.id,
      kind: 'concept',
      refId: 'concept_1',
    })
  })

  it('does not resume the pipeline while the item is pending', async () => {
    await requestApproval(conceptRequest(), deps)
    expect(h.bus.names()).not.toContain('concept.approved')
  })

  it('is idempotent on (kind, refId) so an orchestrator retry cannot double-queue', async () => {
    const first = await requestApproval(conceptRequest(), deps)
    const second = await requestApproval(conceptRequest(), deps)

    expect(second.status).toBe('duplicate')
    expect(second.approval.id).toBe(first.approval.id)
    expect(h.approvals.all()).toHaveLength(1)
    // The duplicate must not re-notify, or the inbox would show it twice.
    expect(h.bus.names()).toEqual(['approval.requested'])
  })

  it('lets a previously rejected ref be proposed again', async () => {
    const first = await requestApproval(conceptRequest(), deps)
    await decideApproval({ approvalId: first.approval.id, decision: 'rejected', decidedBy: 'operator' }, deps)

    const second = await requestApproval(conceptRequest(), deps)

    expect(second.status).toBe('pending')
    expect(second.approval.id).not.toBe(first.approval.id)
  })

  it('pends by default when the category has no rule row yet', async () => {
    const out = await requestApproval(conceptRequest({ category: 'brand-new-niche' }), deps)
    expect(out.status).toBe('pending')
  })

  it('pends when the category exists but has not graduated', async () => {
    h.rules.seed({ kind: 'concept', category: 'nurses', approvedCount: 5, autoEnabled: false })
    const out = await requestApproval(conceptRequest(), deps)
    expect(out.status).toBe('pending')
  })

  describe('once a category has graduated', () => {
    beforeEach(() => {
      graduate(h, { kind: 'concept', category: 'nurses' })
    })

    it('auto-approves and resumes the pipeline without touching the inbox', async () => {
      const out = await requestApproval(conceptRequest(), deps)

      expect(out.status).toBe('auto_approved')
      expect(out.approval.decision).toBe('approved')
      expect(out.approval.autoDecided).toBe(true)
      expect(out.approval.decidedBy).toBe('system')
      expect(out.approval.decidedAt).toEqual(h.clock.now())
      expect(h.bus.names()).toEqual(['concept.approved'])
      expect(h.bus.names()).not.toContain('approval.requested')
    })

    it('still writes an audit row and an event for the auto decision', async () => {
      await requestApproval(conceptRequest(), deps)

      expect(h.approvals.all()).toHaveLength(1)
      expect(h.events.kinds()).toContain('approval.auto_approved')
    })

    it('does not count its own auto decision toward the graduation counters', async () => {
      await requestApproval(conceptRequest(), deps)

      const rule = await h.rules.get('concept', 'nurses')
      // Counters must reflect operator judgement only. If auto-approvals counted, a
      // graduated bucket would drive its own approval rate to 100% and could never be
      // re-evaluated against real operator opinion.
      expect(rule).toMatchObject({ approvedCount: 20, rejectedCount: 0, editedCount: 0 })
    })

    it('only auto-approves the category that graduated', async () => {
      const out = await requestApproval(conceptRequest({ category: 'teachers', refId: 'concept_2' }), deps)
      expect(out.status).toBe('pending')
    })
  })
})

describe('requestApproval never-auto list', () => {
  it('sends a refund reply to the operator even in a graduated category', async () => {
    graduate(h, { kind: 'reply', category: 'refund' })

    const out = await requestApproval(
      {
        kind: 'reply',
        category: 'refund',
        refId: 'msg_1',
        summary: 'Refund request',
        payload: { intent: 'refund', replyBody: 'Sorry about that, refunding now.' },
        requestedBy: 'agent:support',
      },
      deps,
    )

    expect(out.status).toBe('pending')
    expect(h.events.byKind('approval.never_auto')[0]?.message).toMatch(/refund/i)
  })

  it.each([
    ['complaint', 'complaint'],
    ['custom', 'custom'],
  ])('sends a %s reply to the operator even in a graduated category', async (intent) => {
    graduate(h, { kind: 'reply', category: intent })

    const out = await requestApproval(
      {
        kind: 'reply',
        category: intent,
        refId: `msg_${intent}`,
        summary: 'Escalation',
        payload: { intent, replyBody: 'Thanks for reaching out.' },
        requestedBy: 'agent:support',
      },
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
      {
        kind: 'reply',
        category: 'shipping_eta',
        refId: 'msg_2',
        summary: 'Where is my order',
        payload: { intent: 'shipping_eta', customerMessage, replyBody: 'It ships in 3 days.' },
        requestedBy: 'agent:support',
      },
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
      {
        kind: 'reply',
        category: 'shipping_eta',
        refId: `msg_${replyBody.length}`,
        summary: 'Shipping question',
        payload: { intent: 'shipping_eta', customerMessage: 'When will it arrive?', replyBody },
        requestedBy: 'agent:support',
      },
      deps,
    )

    expect(out.status).toBe('pending')
  })

  it('still auto-sends an ordinary shipping reply with no December promise', async () => {
    graduate(h, { kind: 'reply', category: 'shipping_eta' })

    const out = await requestApproval(
      {
        kind: 'reply',
        category: 'shipping_eta',
        refId: 'msg_3',
        summary: 'Shipping question',
        payload: {
          intent: 'shipping_eta',
          customerMessage: 'Any update on my order?',
          replyBody: 'Your order is in production and tracking will follow once it ships.',
        },
        requestedBy: 'agent:support',
      },
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

  it('never auto-approves a price change above 15%', async () => {
    graduate(h, { kind: 'price_change', category: 'mug' })

    const out = await requestApproval(
      {
        kind: 'price_change',
        category: 'mug',
        refId: 'prod_1',
        summary: 'Raise mug price',
        payload: { pctChange: 22 },
        requestedBy: 'agent:finance',
      },
      deps,
    )

    expect(out.status).toBe('pending')
  })

  it('treats a large price CUT as needing approval too', async () => {
    graduate(h, { kind: 'price_change', category: 'mug' })

    const out = await requestApproval(
      {
        kind: 'price_change',
        category: 'mug',
        refId: 'prod_2',
        summary: 'Discount',
        payload: { pctChange: -40 },
        requestedBy: 'agent:finance',
      },
      deps,
    )

    expect(out.status).toBe('pending')
  })

  it('fails safe when the price change percentage is missing', async () => {
    graduate(h, { kind: 'price_change', category: 'mug' })

    const out = await requestApproval(
      {
        kind: 'price_change',
        category: 'mug',
        refId: 'prod_3',
        summary: 'Price change',
        payload: {},
        requestedBy: 'agent:finance',
      },
      deps,
    )

    expect(out.status).toBe('pending')
  })

  it('allows a small price change to auto-approve', async () => {
    graduate(h, { kind: 'price_change', category: 'mug' })

    const out = await requestApproval(
      {
        kind: 'price_change',
        category: 'mug',
        refId: 'prod_4',
        summary: 'Trim price',
        payload: { pctChange: 4 },
        requestedBy: 'agent:finance',
      },
      deps,
    )

    expect(out.status).toBe('auto_approved')
  })

  it('never auto-approves a new shop proposal', async () => {
    graduate(h, { kind: 'shop_proposal', category: 'hobby' })

    const out = await requestApproval(
      {
        kind: 'shop_proposal',
        category: 'hobby',
        refId: 'proposal_1',
        summary: 'Open "Trail & Timber" for hiking gifts',
        payload: { name: 'Trail & Timber', fulfillment: 'pod' },
        requestedBy: 'agent:strategist',
      },
      deps,
    )

    expect(out.status).toBe('pending')
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
      { approvalId: row.id, decision: 'approved', decidedBy: 'operator' },
      deps,
    )

    expect(result.approval.decision).toBe('approved')
    expect(result.approval.decidedBy).toBe('operator')
    expect(result.approval.decidedAt).toEqual(h.clock.now())
    expect(result.approval.autoDecided).toBe(false)
    expect(h.bus.names()).toEqual(['concept.approved'])
    expect(h.bus.find('concept.approved')!.data).toMatchObject({ refId: 'concept_1' })
  })

  it('rejects and emits the rejection event instead', async () => {
    const row = await pending()

    await decideApproval({ approvalId: row.id, decision: 'rejected', decidedBy: 'operator' }, deps)

    expect(h.bus.names()).toEqual(['concept.rejected'])
    expect(h.bus.names()).not.toContain('concept.approved')
  })

  it('treats an edit as an approval of the edited payload', async () => {
    const row = await pending()
    const editPayload = { title: 'Operator rewrote this' }

    const result = await decideApproval(
      { approvalId: row.id, decision: 'edited', decidedBy: 'operator', editPayload },
      deps,
    )

    expect(result.approval.decision).toBe('edited')
    expect(result.approval.editPayload).toEqual(editPayload)
    // An edit still moves the pipeline forward, carrying the operator's version.
    expect(h.bus.names()).toEqual(['concept.approved'])
    expect(h.bus.find('concept.approved')!.data).toMatchObject({ payload: editPayload })
  })

  it('refuses an edit decision with no edited payload', async () => {
    const row = await pending()

    await expect(
      decideApproval({ approvalId: row.id, decision: 'edited', decidedBy: 'operator' }, deps),
    ).rejects.toThrow(/editPayload/i)
  })

  it('refuses to decide the same approval twice', async () => {
    const row = await pending()
    await decideApproval({ approvalId: row.id, decision: 'approved', decidedBy: 'operator' }, deps)

    await expect(
      decideApproval({ approvalId: row.id, decision: 'rejected', decidedBy: 'operator' }, deps),
    ).rejects.toBeInstanceOf(AlreadyDecidedError)
  })

  it('does not emit a second event when a double decision is refused', async () => {
    const row = await pending()
    await decideApproval({ approvalId: row.id, decision: 'approved', decidedBy: 'operator' }, deps)
    h.bus.sent.length = 0

    await decideApproval({ approvalId: row.id, decision: 'approved', decidedBy: 'operator' }, deps).catch(
      () => {},
    )

    expect(h.bus.sent).toHaveLength(0)
  })

  it('throws for an unknown approval id', async () => {
    await expect(
      decideApproval({ approvalId: 'nope', decision: 'approved', decidedBy: 'operator' }, deps),
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
        decidedBy: 'operator',
        ...(decision === 'edited' ? { editPayload: { edited: true } } : {}),
      },
      deps,
    )
  }

  it('counts an approval, a rejection and an edit in separate buckets', async () => {
    await decide('approved', 'c1')
    await decide('rejected', 'c2')
    await decide('edited', 'c3')

    expect(await h.rules.get('concept', 'nurses')).toMatchObject({
      approvedCount: 1,
      rejectedCount: 1,
      editedCount: 1,
    })
  })

  it('creates the rule row on first decision with the kind default threshold', async () => {
    await decide('approved', 'c1')

    expect(await h.rules.get('concept', 'nurses')).toMatchObject({
      threshold: 20,
      requiredRate: 0.95,
      autoEnabled: false,
    })
  })

  it('holds designs to a 50-item threshold rather than 20', async () => {
    const out = await requestApproval(
      conceptRequest({ kind: 'design', category: 'flat-vector', refId: 'd1' }),
      deps,
    )
    await decideApproval({ approvalId: out.approval.id, decision: 'approved', decidedBy: 'operator' }, deps)

    expect(await h.rules.get('design', 'flat-vector')).toMatchObject({ threshold: 50 })
  })

  it('does not graduate below the threshold even at a perfect rate', async () => {
    h.rules.seed({ kind: 'concept', category: 'nurses', approvedCount: 18 })
    await decide('approved', 'c1')

    expect(await h.rules.get('concept', 'nurses')).toMatchObject({
      approvedCount: 19,
      autoEnabled: false,
    })
  })

  it('graduates the category at the threshold when the rate is high enough', async () => {
    h.rules.seed({ kind: 'concept', category: 'nurses', approvedCount: 19 })
    await decide('approved', 'c1')

    expect(await h.rules.get('concept', 'nurses')).toMatchObject({
      approvedCount: 20,
      autoEnabled: true,
    })
    expect(h.events.kinds()).toContain('approval.graduated')
  })

  it('does not graduate at the threshold when the approval rate is below 95%', async () => {
    // 18 approved + 1 rejected = 19 decided; this approval makes 20 at 19/20 = 95%...
    // but an edit is not a clean approval, so 18/20 = 90% must not graduate.
    h.rules.seed({ kind: 'concept', category: 'nurses', approvedCount: 18, rejectedCount: 1 })
    await decide('edited', 'c1')

    expect(await h.rules.get('concept', 'nurses')).toMatchObject({
      approvedCount: 18,
      editedCount: 1,
      autoEnabled: false,
    })
  })

  it('counts an edit against the approval rate', async () => {
    h.rules.seed({ kind: 'concept', category: 'nurses', approvedCount: 19 })
    await decide('edited', 'c1')

    // 19 approved of 20 decided = 95%, which clears the bar.
    expect(await h.rules.get('concept', 'nurses')).toMatchObject({ autoEnabled: true })
  })

  it('disables autonomy and resets the counters when a graduated category is rejected', async () => {
    h.rules.seed({
      kind: 'reply',
      category: 'shipping_eta',
      approvedCount: 40,
      autoEnabled: true,
    })

    // A never-auto item still reaches the inbox in a graduated category, so the
    // operator can still reject there — this is how autonomy gets revoked.
    const out = await requestApproval(
      {
        kind: 'reply',
        category: 'shipping_eta',
        refId: 'msg_9',
        summary: 'Angry customer',
        payload: { intent: 'shipping_eta', customerMessage: 'It arrived damaged', replyBody: 'Sorry!' },
        requestedBy: 'agent:support',
      },
      deps,
    )
    expect(out.status).toBe('pending')

    await decideApproval({ approvalId: out.approval.id, decision: 'rejected', decidedBy: 'operator' }, deps)

    expect(await h.rules.get('reply', 'shipping_eta')).toMatchObject({
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
      {
        kind: 'reply',
        category: 'shipping_eta',
        refId: 'msg_10',
        summary: 'Damage report',
        payload: { intent: 'shipping_eta', customerMessage: 'broken', replyBody: 'Sorry!' },
        requestedBy: 'agent:support',
      },
      deps,
    )
    await decideApproval({ approvalId: out.approval.id, decision: 'rejected', decidedBy: 'operator' }, deps)

    expect(await h.rules.get('reply', 'tracking')).toMatchObject({ autoEnabled: true })
  })
})
