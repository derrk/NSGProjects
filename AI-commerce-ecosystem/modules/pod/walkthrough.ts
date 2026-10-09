/**
 * The pet-niche walkthrough: one poster on Etsy, one gadget on Shopify, end to end.
 *
 * This is the brief's first milestone made executable. Research, review, draft,
 * approval, publish, order, fulfilment, tracking, support draft, margin report —
 * every step, in order, against demo adapters, with no credentials and no database.
 *
 * It is also the only honest way to answer "does the pipeline work?". A screenshot
 * proves a screen rendered. This runs the chain and returns what each step actually
 * produced, so a step that silently stopped working fails a test instead of looking
 * fine in a demo.
 *
 * Everything it touches is fictional and labelled DEMO. The research figures were
 * invented for this file. They are not market data and nothing should be priced off
 * them.
 */

import {
  createDemoDropshipSupplier,
  createDemoEtsyChannel,
  createDemoShopifyChannel,
  type ChannelListingDraft,
  type DemoDropshipSupplier,
  type DemoEtsyChannel,
  type DemoShopifyChannel,
} from '@acf/integrations/channels'

import { checkListing, mayRouteOrder, type RuleViolation } from './channel-rules'
import {
  defaultEtsyAssumptions,
  defaultShopifyAssumptions,
  marginReport,
  orderEconomics,
  type MarginReportRow,
} from './economics'

/** Every figure below is invented. Nothing here is market data. */
export const DEMO_LABEL = 'DEMO — fictional, not market data'

export interface WalkthroughStep {
  key: string
  /** Which room of the station this step belongs to. */
  room: 'research' | 'factory' | 'publishing' | 'orders' | 'comms' | 'treasury'
  title: string
  /** What happened, in the operator's words. */
  detail: string
  /** Whether a human had to act. The brief wants these impossible to miss. */
  humanGate: boolean
  provenance: 'simulated' | 'estimated' | 'verified'
  /** Anything worth showing as a figure or a quote. */
  facts?: Array<{ label: string; value: string }>
}

export interface WalkthroughResult {
  steps: WalkthroughStep[]
  /** The per-SKU report the Finance analyst would produce. */
  margins: MarginReportRow[]
  /** The support reply that was written and NOT sent. */
  supportDraft: { to: string; subject: string; body: string; sent: false }
  /** Rule findings surfaced along the way, including non-blocking ones. */
  findings: RuleViolation[]
}

/* ------------------------------------------------------------------ *
 * Fictional research. Invented for this walkthrough.
 * ------------------------------------------------------------------ */

export const DEMO_RESEARCH = {
  niche: 'Pet owners who treat the pet as family',
  label: DEMO_LABEL,
  findings: [
    'Personalised pet portraits sell year-round on Etsy and spike hard in November.',
    'The buyer is usually not the pet owner; it is a partner or adult child buying a gift.',
    'Practical pet goods — hair removal, grooming, feeding — convert better on an own-brand storefront than on a marketplace.',
  ],
  // Invented. A real scout would attach a URL and a retrieval date to each of these.
  estimatedMonthlySearches: { 'custom pet portrait': 74_000, 'pet hair remover': 110_000 },
  source: 'Fictional. No source was consulted; this is seed data for the walkthrough.',
} as const

const ETSY_SKU = 'pet-portrait-poster-a2'
const SHOPIFY_SKU = 'pet-hair-remover-v1'
const SUPPLIER_SKU = 'PHR-001'

const DEMO_CATALOG = [
  {
    supplierSku: SUPPLIER_SKU,
    title: 'Reusable pet hair remover roller',
    itemCostCents: 420,
    shippingCostCents: { US: 180, '*': 640 },
    leadTimeDaysMin: 7,
    leadTimeDaysMax: 21,
    inStock: true,
  },
]

/** The Printify-side cost of the poster. Estimated: no print order was ever placed. */
const POSTER_PRINT_COST_CENTS = 1180
const POSTER_SHIP_COST_CENTS = 450

export interface WalkthroughDeps {
  etsy?: DemoEtsyChannel
  shopify?: DemoShopifyChannel
  supplier?: DemoDropshipSupplier
  /**
   * Stands in for the approval inbox.
   *
   * Injected rather than stubbed inline so the walkthrough cannot accidentally
   * approve its own work: something outside it has to hand back an id.
   */
  approve: (request: { what: string; why: string }) => Promise<{ approvalId: string; approvedBy: string }>
  /** Fixed, because a walkthrough that moves with the clock is not reproducible. */
  now?: Date
}

function etsyDraft(): ChannelListingDraft {
  return {
    sku: ETSY_SKU,
    title: 'Custom Pet Portrait Poster — Hand-Illustrated From Your Photo',
    description:
      'Send a photo of your pet and we illustrate it by hand. Printed on heavyweight ' +
      'matte paper. Made for us by Printify (US).',
    priceCents: 2999,
    quantity: 25,
    tags: ['pet portrait', 'custom dog art', 'cat lover gift', 'pet memorial'],
    imageUrls: ['demo://pet-portrait-mockup.png'],
    fulfillment: 'pod',
    productionPartner: 'Printify (US)',
    shipsFrom: 'United States',
    personalization: {
      enabled: true,
      instructions: 'Your pet’s name, and anything you want us to notice in the photo.',
      required: true,
      maxLength: 256,
    },
  }
}

function shopifyDraft(): ChannelListingDraft {
  return {
    sku: SHOPIFY_SKU,
    title: 'Reusable Pet Hair Remover',
    description:
      'Lifts hair from upholstery and bedding without tape or refills. Ships from our ' +
      'supplier; allow 7–21 days.',
    priceCents: 1899,
    quantity: 40,
    tags: ['pet hair', 'cleaning'],
    imageUrls: ['demo://pet-hair-remover.png'],
    fulfillment: 'dropship',
    shipsFrom: 'CN',
  }
}

/**
 * Run the whole chain.
 *
 * Sequential on purpose. The order is the point: nothing publishes before an
 * approval, nothing ships before a supplier confirms, and no margin is reported
 * before a cost is known.
 */
export async function runPetNicheWalkthrough(deps: WalkthroughDeps): Promise<WalkthroughResult> {
  const etsy = deps.etsy ?? createDemoEtsyChannel()
  const shopify = deps.shopify ?? createDemoShopifyChannel()
  const supplier =
    deps.supplier ??
    createDemoDropshipSupplier(DEMO_CATALOG, { key: 'demo-pet', label: 'Demo pet-goods supplier' })
  const now = deps.now ?? new Date('2026-10-09T12:00:00Z')

  const steps: WalkthroughStep[] = []
  const findings: RuleViolation[] = []
  const step = (s: WalkthroughStep) => steps.push(s)

  /* 1. Research ---------------------------------------------------- */
  step({
    key: 'research',
    room: 'research',
    title: 'Scout reports on the pet niche',
    detail:
      `${DEMO_RESEARCH.niche}. ` +
      'Two products follow from it: something personal that only works on a marketplace, ' +
      'and something practical that does better on our own storefront.',
    humanGate: false,
    provenance: 'simulated',
    facts: [
      { label: 'Label', value: DEMO_LABEL },
      { label: 'Source', value: DEMO_RESEARCH.source },
      ...DEMO_RESEARCH.findings.map((f, i) => ({ label: `Finding ${i + 1}`, value: f })),
    ],
  })

  /* 2. Channel review ---------------------------------------------- */
  const posterCandidate = {
    channel: 'etsy' as const,
    fulfillment: 'pod' as const,
    originalDesign: true,
    personalized: true,
    productionPartner: 'Printify (US)',
    shipsFrom: 'United States',
    aiAssisted: true,
    provenanceNote: 'Illustrated from the buyer’s photo with AI assistance, finished by hand.',
  }
  const removerCandidate = {
    channel: 'shopify' as const,
    fulfillment: 'dropship' as const,
    originalDesign: false,
    personalized: false,
    shipsFrom: 'CN',
  }
  // The same gadget, checked against Etsy, to show why it is not going there.
  const removerOnEtsy = { ...removerCandidate, channel: 'etsy' as const }

  findings.push(...checkListing(posterCandidate), ...checkListing(removerCandidate))
  const etsyRefusal = checkListing(removerOnEtsy).find((p) => p.severity === 'blocking')

  step({
    key: 'channel-review',
    room: 'research',
    title: 'Each product is assigned the channel it is allowed on',
    detail:
      'The poster is original and buyer-personalised, so Etsy is open to it. The hair ' +
      'remover is ordinary resale, which Etsy does not allow, so it goes on Shopify.',
    humanGate: false,
    provenance: 'simulated',
    facts: [
      { label: 'Poster → Etsy', value: 'no blocking rule' },
      { label: 'Remover → Etsy', value: etsyRefusal?.message ?? 'allowed' },
      { label: 'Remover → Shopify', value: 'allowed' },
    ],
  })

  /* 3. Supplier review --------------------------------------------- */
  const quote = await supplier.quote(SUPPLIER_SKU, { countryCode: 'US' })
  if (!quote) throw new Error(`Demo supplier does not carry ${SUPPLIER_SKU}.`)

  step({
    key: 'supplier-review',
    room: 'research',
    title: 'Supplier quotes the gadget',
    detail:
      'A quote, not an invoice. Every margin computed from this is an estimate until ' +
      'a real order comes back with what we were actually charged.',
    humanGate: false,
    provenance: 'estimated',
    facts: [
      { label: 'Item', value: `$${(quote.itemCostCents / 100).toFixed(2)}` },
      { label: 'Shipping to US', value: `$${(quote.shippingCostCents / 100).toFixed(2)}` },
      { label: 'Lead time', value: `${quote.leadTimeDaysMin}–${quote.leadTimeDaysMax} days` },
      { label: 'Source', value: quote.source },
    ],
  })

  /* 4. Drafts ------------------------------------------------------- */
  const posterListing = await etsy.createDraft(etsyDraft())
  const removerListing = await shopify.createDraft(shopifyDraft())

  step({
    key: 'drafts',
    room: 'factory',
    title: 'Both listings drafted, neither visible',
    detail:
      'Draft state on both channels. Neither has a URL, because neither exists anywhere ' +
      'a buyer could reach.',
    humanGate: false,
    provenance: 'simulated',
    facts: [
      { label: 'Etsy draft', value: `${posterListing.externalId} (${posterListing.state})` },
      { label: 'Shopify draft', value: `${removerListing.externalId} (${removerListing.state})` },
      { label: 'Public URL', value: 'none — nothing is published' },
    ],
  })

  /* 5. Human approval ----------------------------------------------- */
  const posterApproval = await deps.approve({
    what: `Publish "${etsyDraft().title}" to Etsy at $29.99`,
    why: 'Creating a public marketplace listing.',
  })
  const removerApproval = await deps.approve({
    what: `Publish "${shopifyDraft().title}" to Shopify at $18.99`,
    why: 'Creating a public storefront product.',
  })

  step({
    key: 'approval',
    room: 'publishing',
    title: 'A human approves each listing',
    detail:
      'Both channel adapters refuse to publish without an approval id. This is a ' +
      'required argument, not a prompt instruction, so no agent can route around it.',
    humanGate: true,
    provenance: 'simulated',
    facts: [
      { label: 'Poster', value: `${posterApproval.approvalId} by ${posterApproval.approvedBy}` },
      { label: 'Remover', value: `${removerApproval.approvalId} by ${removerApproval.approvedBy}` },
    ],
  })

  /* 6. Simulated publish --------------------------------------------- */
  const posterLive = await etsy.publish(posterListing.externalId, posterApproval)
  const removerLive = await shopify.publish(removerListing.externalId, removerApproval)

  step({
    key: 'publish',
    room: 'publishing',
    title: 'Simulated publish',
    detail:
      'Both listings are now active in the demo adapters and nowhere else. No listing ' +
      'exists on Etsy, no product exists in any Shopify store, and no fees were charged.',
    humanGate: false,
    provenance: 'simulated',
    facts: [
      { label: 'Etsy', value: `${posterLive.state} — ${posterLive.simulatedNote}` },
      { label: 'Shopify', value: `${removerLive.state} — ${removerLive.simulatedNote}` },
    ],
  })

  /* 7. Simulated orders ----------------------------------------------- */
  const placedAt = new Date(now.getTime() - 60 * 60 * 1000)
  etsy.seedOrder({
    channelOrderId: 'DEMO-ETSY-ORDER-1',
    orderNumber: '3001',
    customerEmail: 'buyer@example.test',
    totalCents: 2999,
    paid: true,
    hasValidAddress: true,
    placedAt,
    lines: [
      {
        channelLineItemId: 'DEMO-ETSY-ORDER-1-1',
        sku: ETSY_SKU,
        quantity: 1,
        unitPriceCents: 2999,
        personalized: true,
        personalization: { petName: 'Biscuit', note: 'The one with the chewed ear' },
      },
    ],
  })
  shopify.seedOrder({
    channelOrderId: 'DEMO-SHOP-ORDER-1',
    orderNumber: '1001',
    customerEmail: 'buyer2@example.test',
    totalCents: 1899,
    paid: true,
    hasValidAddress: true,
    placedAt,
    lines: [
      {
        channelLineItemId: 'DEMO-SHOP-ORDER-1-1',
        sku: SHOPIFY_SKU,
        quantity: 1,
        unitPriceCents: 1899,
        personalized: false,
      },
    ],
  })

  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const etsyOrders = await etsy.listOrders(since)
  const shopifyOrders = await shopify.listOrders(since)

  step({
    key: 'orders',
    room: 'orders',
    title: 'Two simulated orders arrive',
    detail: 'One personalised poster, one gadget. Both paid, both with a valid address.',
    humanGate: false,
    provenance: 'simulated',
    facts: [
      { label: 'Etsy', value: `${etsyOrders.length} order, personalised: Biscuit` },
      { label: 'Shopify', value: `${shopifyOrders.length} order` },
    ],
  })

  /* 8. Routing ---------------------------------------------------------- */
  const posterRouting = mayRouteOrder({
    personalized: true,
    personalizationReviewed: false,
    skuApproved: true,
    paid: true,
    hasValidAddress: true,
    fulfillmentCostCents: POSTER_PRINT_COST_CENTS + POSTER_SHIP_COST_CENTS,
    maxFulfillmentCostCents: 3000,
  })
  const removerRouting = mayRouteOrder({
    personalized: false,
    personalizationReviewed: false,
    skuApproved: true,
    paid: true,
    hasValidAddress: true,
    fulfillmentCostCents: quote.itemCostCents + quote.shippingCostCents,
    maxFulfillmentCostCents: 3000,
  })

  step({
    key: 'routing',
    room: 'orders',
    title: 'The personalised order stops; the other goes through',
    detail:
      'The poster carries buyer-supplied text and waits for a human to read it. Sending ' +
      'that to a printer unreviewed is how a shop prints a typo onto something it cannot ' +
      'take back.',
    humanGate: true,
    provenance: 'simulated',
    facts: [
      {
        label: 'Poster',
        value: posterRouting.route ? 'routed' : `held — ${posterRouting.reason}`,
      },
      {
        label: 'Remover',
        value: removerRouting.route ? 'routed to supplier' : `held — ${removerRouting.reason}`,
      },
    ],
  })

  /* 9. Fulfilment ---------------------------------------------------------- */
  /*
   * The routing decision above is obeyed, not merely printed.
   *
   * An earlier version rendered "held — fulfilment would cost more than the ceiling"
   * and then placed the supplier order on the next line regardless. A walkthrough
   * that shows a gate refusing something and then does it anyway teaches the reader
   * the gate is decorative, which is the opposite of what this file exists to
   * demonstrate — and it is reachable, because `deps.supplier` is injectable and a
   * dearer catalogue trips the ceiling.
   */
  const quotedTotal = quote.itemCostCents + quote.shippingCostCents
  const supplierOrder = removerRouting.route
    ? await supplier.placeOrder({
        referenceId: 'DEMO-SHOP-ORDER-1',
        lines: [{ supplierSku: SUPPLIER_SKU, quantity: 1 }],
        destination: { countryCode: 'US' },
        shippingName: 'A Buyer',
        shippingAddress: '1 Example Street, Austin TX',
      })
    : null

  if (!supplierOrder) {
    step({
      key: 'fulfilment',
      room: 'orders',
      title: 'Nothing was sent to the supplier',
      detail:
        `The routing gate held this order — ${removerRouting.route ? '' : removerRouting.reason}. ` +
        'No supplier order was placed, so there is no charge to report and no cost that ' +
        'has moved from estimated to verified.',
      humanGate: true,
      provenance: 'simulated',
      facts: [
        { label: 'Quoted', value: `$${(quotedTotal / 100).toFixed(2)} (estimated)` },
        { label: 'Charged', value: 'nothing — no order was placed' },
      ],
    })
  } else {
    const chargedTotal =
      supplierOrder.chargedItemCostCents + supplierOrder.chargedShippingCostCents

    step({
      key: 'fulfilment',
      room: 'orders',
      title: 'Supplier order placed, and now the cost is a fact',
      detail:
        (chargedTotal === quotedTotal
          ? 'The invoice matched the quote this time. It will not always. '
          : `The invoice came back ${chargedTotal > quotedTotal ? 'higher' : 'lower'} than the quote. ` +
            'This is why the two are tracked separately. ') +
        // Carried, not dropped. "verified" here means the demo supplier reported a
        // charge, not that anyone was charged — and the fulfilment step was the one
        // place that stated the first without the second.
        supplierOrder.simulatedNote,
      humanGate: false,
      provenance: 'verified',
      facts: [
        { label: 'Quoted', value: `$${(quotedTotal / 100).toFixed(2)} (estimated)` },
        {
          label: 'Charged',
          value: `$${(chargedTotal / 100).toFixed(2)} (verified against the supplier’s own reply — which is simulated)`,
        },
        { label: 'Supplier order', value: supplierOrder.supplierOrderId },
        { label: 'Status', value: supplierOrder.status },
        { label: 'Reality', value: supplierOrder.simulatedNote ?? 'simulated' },
      ],
    })
  }

  /* 10. Tracking ------------------------------------------------------------ */
  // Nothing was ordered, so nothing can be tracked. A tracking number invented to
  // keep the walkthrough tidy is the single worst thing this file could contain.
  const tracking = supplierOrder
    ? await (async () => {
        supplier.advance(supplierOrder.supplierOrderId, 'shipped', {
          carrier: 'USPS',
          trackingNumber: 'DEMO9400100000000000',
        })
        const shipped = (await supplier.getOrder(supplierOrder.supplierOrderId))!
        const shipment = await shopify.reportShipment('DEMO-SHOP-ORDER-1', {
          carrier: shipped.tracking!.carrier,
          trackingNumber: shipped.tracking!.trackingNumber,
        })
        return { shipped, shipment }
      })()
    : null

  step({
    key: 'tracking',
    room: 'orders',
    title: tracking ? 'Tracking recorded; the buyer was not told' : 'No tracking, because nothing shipped',
    detail: tracking
      ? 'The shipment is recorded against the order. notifiedBuyer is false because in ' +
        'demo mode no email left this machine — the support draft below assumes the ' +
        'customer has heard nothing.'
      : 'The order was held before it reached the supplier, so there is no shipment and ' +
        'no tracking number. Inventing one to keep the walkthrough tidy is the single ' +
        'worst thing this file could do.',
    humanGate: false,
    provenance: 'simulated',
    facts: tracking
      ? [
          { label: 'Carrier', value: tracking.shipped.tracking!.carrier },
          { label: 'Tracking', value: tracking.shipped.tracking!.trackingNumber },
          { label: 'Buyer notified', value: String(tracking.shipment.notifiedBuyer) },
        ]
      : [{ label: 'Tracking', value: 'none — the order never reached a supplier' }],
  })

  /* 11. Support draft -------------------------------------------------------- */
  /*
   * Written from what happened, not from the happy path.
   *
   * The grounding checks in agents/support refuse a reply that claims an order
   * shipped when the record has no shipping date. A walkthrough whose own sample
   * draft would fail that check is demonstrating the wrong thing.
   */
  const supportDraft = tracking
    ? {
        to: 'buyer2@example.test',
        subject: 'Your pet hair remover is on its way (order 1001)',
        body:
          'Hi,\n\n' +
          `Your order has shipped. USPS tracking: ${tracking.shipped.tracking!.trackingNumber}.\n\n` +
          `It ships from our supplier, so allow ${quote.leadTimeDaysMin}–${quote.leadTimeDaysMax} ` +
          'days for it to reach you. Tracking can take a day or two to start updating.\n\n' +
          'Reply to this message if anything looks wrong and a person will pick it up.\n\n' +
          '— Support',
        sent: false as const,
      }
    : {
        to: 'buyer2@example.test',
        subject: 'About your order (order 1001)',
        body:
          'Hi,\n\n' +
          'Your order is on hold with us and has not been sent to our supplier yet. ' +
          'There is no tracking number because nothing has shipped.\n\n' +
          'Someone here is looking at it and will reply.\n\n' +
          '— Support',
        sent: false as const,
      }

  step({
    key: 'support-draft',
    room: 'comms',
    title: 'Support reply drafted, not sent',
    detail:
      'send_email has no send path in this system at all. The draft is filed for a ' +
      'human to read, change and send. The lead time in it is the quoted range, not ' +
      'the optimistic end of it.',
    humanGate: true,
    provenance: 'simulated',
    facts: [
      { label: 'To', value: supportDraft.to },
      { label: 'Subject', value: supportDraft.subject },
      { label: 'Sent', value: 'no — nothing has ever been sent from this system' },
    ],
  })

  /* 12. Margin report --------------------------------------------------------- */
  const posterEconomics = orderEconomics({
    itemPriceCents: 2999,
    shippingChargedCents: 0,
    itemCostCents: POSTER_PRINT_COST_CENTS,
    shippingCostCents: POSTER_SHIP_COST_CENTS,
    assumptions: defaultEtsyAssumptions(),
  })
  /*
   * Costed from the invoice when there is one, and from the quote when there is not
   * — with the row's provenance following, rather than staying `verified` because
   * the happy path usually produces an invoice.
   */
  const removerEconomics = orderEconomics({
    itemPriceCents: 1899,
    shippingChargedCents: 0,
    itemCostCents: supplierOrder?.chargedItemCostCents ?? quote.itemCostCents,
    shippingCostCents: supplierOrder?.chargedShippingCostCents ?? quote.shippingCostCents,
    assumptions: defaultShopifyAssumptions(),
  })

  const margins = marginReport([
    {
      sku: ETSY_SKU,
      revenueCents: posterEconomics.revenueCents,
      contributionCents: posterEconomics.contributionCents,
      // Estimated, not verified: no print order was placed, so the poster's cost is
      // still a catalogue figure rather than something we were charged.
      provenance: 'estimated',
    },
    {
      sku: SHOPIFY_SKU,
      revenueCents: removerEconomics.revenueCents,
      contributionCents: removerEconomics.contributionCents,
      provenance: supplierOrder ? 'verified' : 'estimated',
    },
  ])

  step({
    key: 'margins',
    room: 'treasury',
    title: 'Margin report, with each row marked for how much it can be trusted',
    detail:
      (supplierOrder
        ? 'The gadget row is verified — we know what the supplier charged. '
        : 'The gadget row is estimated too: the order was held, so no supplier ever ' +
          'invoiced us and its cost is still a catalogue figure. ') +
      'The poster row is estimated, because nothing was ever printed. Ranked by ' +
      'contribution, not revenue: the bigger number is not the better product.',
    humanGate: false,
    provenance: 'estimated',
    facts: margins.map((m) => ({
      label: m.sku,
      value: `$${(m.contributionCents / 100).toFixed(2)} (${m.contributionPercent.toFixed(1)}%) — ${m.provenance}`,
    })),
  })

  return { steps, margins, supportDraft, findings }
}
