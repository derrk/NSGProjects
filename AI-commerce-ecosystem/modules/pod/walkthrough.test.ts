import { describe, expect, it, vi } from 'vitest'

import { createDemoEtsyChannel, createDemoShopifyChannel } from '@acf/integrations/channels'

import { checkReplyGrounding } from './agents/support/grounding'
import { DEMO_LABEL, runPetNicheWalkthrough } from './walkthrough'

const approve = vi.fn(async () => ({ approvalId: 'apr_demo_1', approvedBy: 'operator' }))

async function run(over: Partial<Parameters<typeof runPetNicheWalkthrough>[0]> = {}) {
  return runPetNicheWalkthrough({ approve, ...over })
}

describe('pet-niche walkthrough', () => {
  it('runs every step the brief asks for, in order', async () => {
    const { steps } = await run()

    expect(steps.map((s) => s.key)).toEqual([
      'research',
      'channel-review',
      'supplier-review',
      'drafts',
      'approval',
      'publish',
      'orders',
      'routing',
      'fulfilment',
      'tracking',
      'support-draft',
      'margins',
    ])
  })

  it('runs with no credentials, no database and no network', async () => {
    // The whole point of the demo adapters. If this ever needs setup, the brief's
    // "runnable locally without credentials" has quietly stopped being true.
    await expect(run()).resolves.toBeDefined()
  })

  it('labels its research as fictional', async () => {
    const { steps } = await run()
    const research = steps.find((s) => s.key === 'research')!

    expect(research.facts!.some((f) => f.value === DEMO_LABEL)).toBe(true)
    expect(research.facts!.some((f) => /No source was consulted/.test(f.value))).toBe(true)
  })

  it('sends the dropshipped gadget to Shopify because Etsy refuses it', async () => {
    const { steps } = await run()
    const review = steps.find((s) => s.key === 'channel-review')!

    const refusal = review.facts!.find((f) => f.label === 'Remover → Etsy')!
    expect(refusal.value).toMatch(/does not allow ordinary resale/)
  })

  it('approves before it publishes, never after', async () => {
    const { steps } = await run()
    const approvalAt = steps.findIndex((s) => s.key === 'approval')
    const publishAt = steps.findIndex((s) => s.key === 'publish')

    expect(approvalAt).toBeLessThan(publishAt)
  })

  it('cannot publish if the approval step is skipped', async () => {
    // The ordering above is a convention; this is the thing that enforces it.
    const etsy = createDemoEtsyChannel()
    const shopify = createDemoShopifyChannel()

    await expect(
      runPetNicheWalkthrough({
        etsy,
        shopify,
        approve: async () => ({ approvalId: '', approvedBy: 'nobody' }),
      }),
    ).rejects.toThrow(/approval id/)
  })

  it('asks a human twice: once to publish, once to read the buyer’s text', async () => {
    const { steps } = await run()
    const gates = steps.filter((s) => s.humanGate).map((s) => s.key)

    expect(gates).toContain('approval')
    expect(gates).toContain('routing')
    expect(gates).toContain('support-draft')
  })

  it('holds the personalised order and routes the other', async () => {
    const { steps } = await run()
    const routing = steps.find((s) => s.key === 'routing')!

    expect(routing.facts!.find((f) => f.label === 'Poster')!.value).toMatch(/held — .*reviewed/)
    expect(routing.facts!.find((f) => f.label === 'Remover')!.value).toMatch(/routed/)
  })

  it('never claims the buyer was notified', async () => {
    const { steps, supportDraft } = await run()
    const tracking = steps.find((s) => s.key === 'tracking')!

    expect(tracking.facts!.find((f) => f.label === 'Buyer notified')!.value).toBe('false')
    expect(supportDraft.sent).toBe(false)
  })

  it('quotes the full lead-time range in the support draft, not the optimistic end', async () => {
    // "Ships in 7 days" to a customer whose parcel takes 21 is the support ticket
    // this walkthrough exists to avoid teaching the pipeline to generate.
    const { supportDraft } = await run()
    expect(supportDraft.body).toMatch(/7–21 days/)
  })

  it('reports the gadget verified and the poster estimated', async () => {
    const { margins } = await run()

    const poster = margins.find((m) => m.sku === 'pet-portrait-poster-a2')!
    const remover = margins.find((m) => m.sku === 'pet-hair-remover-v1')!

    // Nothing was printed, so the poster's cost is still a catalogue figure.
    expect(poster.provenance).toBe('estimated')
    // The supplier invoiced us, so this one we actually know.
    expect(remover.provenance).toBe('verified')
  })

  it('ranks the margin report by contribution, not by revenue', async () => {
    const { margins } = await run()
    for (let i = 1; i < margins.length; i += 1) {
      expect(margins[i - 1]!.contributionCents).toBeGreaterThanOrEqual(margins[i]!.contributionCents)
    }
  })

  it('marks every published result as simulated', async () => {
    const { steps } = await run()
    const publish = steps.find((s) => s.key === 'publish')!

    expect(publish.provenance).toBe('simulated')
    expect(publish.facts!.every((f) => /Simulated\./.test(f.value))).toBe(true)
  })

  it('shows the invoice disagreeing with the quote when the supplier drifts', async () => {
    const { createDemoDropshipSupplier } = await import('@acf/integrations/channels')
    const supplier = createDemoDropshipSupplier(
      [
        {
          supplierSku: 'PHR-001',
          title: 'Reusable pet hair remover roller',
          itemCostCents: 420,
          shippingCostCents: { US: 180, '*': 640 },
          leadTimeDaysMin: 7,
          leadTimeDaysMax: 21,
          inStock: true,
        },
      ],
      { key: 'drifty' },
    )
    supplier.setCostDrift(90)

    const { steps } = await run({ supplier })
    const fulfilment = steps.find((s) => s.key === 'fulfilment')!

    expect(fulfilment.detail).toMatch(/higher than the quote/)
    expect(fulfilment.provenance).toBe('verified')
  })

  describe('when the routing gate holds the order', () => {
    /*
     * The gate must be obeyed, not merely printed. An earlier version rendered
     * "held — fulfilment would cost more than the ceiling" and then placed the
     * supplier order on the very next line, which teaches a reader that the gate is
     * decorative — the opposite of what this walkthrough exists to show.
     */
    async function heldRun() {
      const { createDemoDropshipSupplier } = await import('@acf/integrations/channels')
      const dear = createDemoDropshipSupplier(
        [
          {
            supplierSku: 'PHR-001',
            title: 'Reusable pet hair remover roller',
            // Over the division's 3000c per-order ceiling.
            itemCostCents: 4000,
            shippingCostCents: { US: 180, '*': 640 },
            leadTimeDaysMin: 7,
            leadTimeDaysMax: 21,
            inStock: true,
          },
        ],
        { key: 'too-dear' },
      )
      return { ...(await run({ supplier: dear })), supplier: dear }
    }

    it('places no supplier order at all', async () => {
      const { steps, supplier } = await heldRun()

      expect(supplier.orders.size).toBe(0)
      const fulfilment = steps.find((s) => s.key === 'fulfilment')!
      expect(fulfilment.title).toMatch(/Nothing was sent to the supplier/)
      expect(fulfilment.facts!.find((f) => f.label === 'Charged')!.value).toMatch(/no order/)
    })

    it('invents no tracking number to keep the walkthrough tidy', async () => {
      const { steps } = await heldRun()
      const tracking = steps.find((s) => s.key === 'tracking')!

      expect(tracking.facts!.every((f) => !/\d{8,}/.test(f.value))).toBe(true)
    })

    it('drafts a reply the grounding checks would actually pass', async () => {
      /*
       * Asserted against the real checks rather than against a phrase, because a
       * phrase test is what let grounding.ts ship broken in the first place. The
       * walkthrough's own sample draft must survive the gate the walkthrough is
       * demonstrating.
       */
      const { supportDraft } = await heldRun()

      const problems = checkReplyGrounding(supportDraft.body, {
        orderNumber: '1001',
        status: 'needs_review',
        placedAt: new Date('2026-10-07'),
        shippedAt: null,
        carrier: null,
        trackingNumber: null,
        leadTimeDaysMin: 7,
        leadTimeDaysMax: 21,
        items: [],
        decidedRemedies: [],
      })

      expect(problems.filter((p) => p.severity === 'blocking')).toEqual([])
      expect(supportDraft.body).toMatch(/has not been sent to our supplier/)
    })

    it('reports the gadget margin as estimated, since nobody invoiced us', async () => {
      const { margins } = await heldRun()
      expect(margins.find((m) => m.sku === 'pet-hair-remover-v1')!.provenance).toBe('estimated')
    })
  })

  it('carries the supplier’s simulated note into the fulfilment step', async () => {
    // "verified" here means the demo supplier reported a charge, not that anyone was
    // charged. The fulfilment step was the one place stating the first without the
    // second, while the UI gave it the only green badge on the page.
    const { steps } = await run()
    const fulfilment = steps.find((s) => s.key === 'fulfilment')!

    expect(fulfilment.detail).toMatch(/Simulated\./)
    expect(fulfilment.facts!.some((f) => /simulated/i.test(f.value))).toBe(true)
  })

  it('is reproducible: two runs produce the same steps', async () => {
    // Nothing in here may read the clock. A walkthrough that moves with the day
    // cannot be asserted against.
    const a = await run()
    const b = await run()
    expect(a.steps.map((s) => s.detail)).toEqual(b.steps.map((s) => s.detail))
  })
})
