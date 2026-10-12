/**
 * The pet division, written into the database.
 *
 * The Dry Run screen proves the pipeline works; this makes it visible everywhere else.
 * Treasury, Archives, the order floor and the margin views all read from tables, and
 * until something is in those tables the commerce layer only exists on one page.
 *
 * Everything inserted here is fictional and says so. Every ledger row is sourced
 * `simulated:`, which is what the Treasury screen reads to mark it — so these figures
 * cannot be mistaken for money that moved, including by someone who arrives at the
 * dashboard without reading this file.
 *
 *   pnpm --filter @acf/web seed:pet
 *
 * Idempotent: re-running it leaves an existing division alone.
 */

import { createDivision, reconcileDivisionAgents, registerModules } from '@acf/core/modules'
import { createDatabase, ledger } from '@acf/db'
import { runMigrations } from '@acf/db/migrate'
import {
  agentStore,
  approvalRuleSeedStore,
  divisionStore,
  eventSink,
  moduleStore,
} from '@acf/jobs'
import {
  POD_MIGRATIONS,
  channelListings,
  niches,
  orderLines,
  orders,
  products,
  supplierOrders,
  suppliers,
} from '@acf/pod/schema'

import { MODULES } from '../lib/modules'

const DIVISION_SLUG = 'pet-goods'

/** Fixed, so re-seeding produces the same figures and a screenshot stays comparable. */
const PLACED_AT = new Date('2026-10-07T15:20:00Z')
const SHIPPED_AT = new Date('2026-10-08T09:05:00Z')

const FICTION = 'Fictional demo data. No source was consulted and nothing was sold.'

async function main() {
  await runMigrations({ moduleMigrations: [POD_MIGRATIONS] })
  const db = createDatabase()

  const deps = {
    modules: moduleStore(db),
    divisions: divisionStore(db),
    agents: agentStore(db),
    rules: approvalRuleSeedStore(db),
    events: eventSink(db),
  }

  await registerModules(MODULES, deps)

  const existing = await deps.divisions.findBySlug(DIVISION_SLUG)
  if (existing) {
    const mod = MODULES.find((m) => m.name === 'pod')!
    const added = await reconcileDivisionAgents(existing, mod, deps)
    console.log(
      `division "${DIVISION_SLUG}" already exists; left alone` +
        (added.length > 0 ? `, added ${added.length} agent(s)` : ''),
    )
    return
  }

  const { division, agents } = await createDivision(
    {
      name: 'Paw Order',
      slug: DIVISION_SLUG,
      moduleName: 'pod',
      activate: true,
      config: {
        productTypes: ['poster'],
        channels: ['etsy', 'shopify'],
        maxFulfillmentCostCents: 3000,
      },
    },
    MODULES,
    deps,
  )

  const d = division.id

  /* Research ------------------------------------------------------- */
  await db.insert(niches).values({
    divisionId: d,
    name: 'Pet owners who treat the pet as family',
    keywords: ['custom pet portrait', 'pet hair remover', 'dog mom gift', 'pet memorial'],
    audience: 'Usually not the pet owner — a partner or adult child buying a gift',
    season: 'christmas-2026',
    score: 84,
    rationale:
      'Personalised portraits sell year-round and spike in November. Practical pet goods ' +
      'convert better on an own-brand storefront than on a marketplace. ' +
      FICTION,
    status: 'approved',
    actor: 'operator',
  })

  /* Supplier -------------------------------------------------------- */
  const [printify] = await db
    .insert(suppliers)
    .values({
      divisionId: d,
      name: 'Printify (US)',
      kind: 'pod',
      disclosureName: 'Printify (US)',
      shipsFrom: 'United States',
      shipDaysMin: 3,
      shipDaysMax: 8,
      returnsPolicy: 'Reprint on defect, no returns on personalised items.',
      // Null on purpose: nobody has confirmed these against a real account, and a
      // date here would say someone had.
      dataConfirmedAt: null,
      approved: true,
      notes: FICTION,
      actor: 'operator',
    })
    .returning()

  const [petSupplier] = await db
    .insert(suppliers)
    .values({
      divisionId: d,
      name: 'Demo pet-goods supplier',
      kind: 'dropship',
      shipsFrom: 'CN',
      shipDaysMin: 7,
      shipDaysMax: 21,
      returnsPolicy: '30-day window on unopened items.',
      dataConfirmedAt: null,
      approved: true,
      notes: `${FICTION} Samples have NOT been inspected; nothing should go live on this.`,
      actor: 'operator',
    })
    .returning()

  /* Products -------------------------------------------------------- */
  const [poster] = await db
    .insert(products)
    .values({
      divisionId: d,
      type: 'poster',
      title: 'Custom Pet Portrait Poster — Hand-Illustrated From Your Photo',
      description:
        'Send a photo of your pet and we illustrate it by hand. Printed on heavyweight ' +
        'matte paper. Made for us by Printify (US).',
      tags: ['pet portrait', 'custom dog art', 'cat lover gift', 'pet memorial'],
      priceCents: 2999,
      costCents: 1630,
      status: 'published',
      publishedAt: PLACED_AT,
      actor: 'operator',
    })
    .returning()

  const [remover] = await db
    .insert(products)
    .values({
      divisionId: d,
      type: 'other',
      title: 'Reusable Pet Hair Remover',
      description:
        'Lifts hair from upholstery and bedding without tape or refills. Ships from our ' +
        'supplier; allow 7–21 days.',
      tags: ['pet hair', 'cleaning', 'dog', 'cat'],
      priceCents: 1899,
      costCents: 600,
      status: 'published',
      publishedAt: PLACED_AT,
      actor: 'operator',
    })
    .returning()

  /* Channel listings ------------------------------------------------- */
  await db.insert(channelListings).values([
    {
      divisionId: d,
      productId: poster!.id,
      channel: 'etsy',
      fulfillment: 'pod',
      supplierId: printify!.id,
      // Simulated ids, and no URL. A plausible etsy.com link here is how someone
      // concludes the listing exists.
      externalListingId: 'DEMO-ETSY-0001',
      externalUrl: null,
      originalDesign: true,
      personalized: true,
      aiAssisted: true,
      provenanceNote: 'Illustrated from the buyer’s photo with AI assistance, finished by hand.',
      productionPartner: 'Printify (US)',
      shipsFrom: 'United States',
      status: 'published',
      publishedAt: PLACED_AT,
      actor: 'operator',
    },
    {
      divisionId: d,
      productId: remover!.id,
      channel: 'shopify',
      fulfillment: 'dropship',
      supplierId: petSupplier!.id,
      externalListingId: 'DEMO-SHOP-0001',
      externalUrl: null,
      originalDesign: false,
      personalized: false,
      aiAssisted: false,
      shipsFrom: 'CN',
      status: 'published',
      publishedAt: PLACED_AT,
      actor: 'operator',
    },
  ])

  /* Orders ----------------------------------------------------------- */
  const [etsyOrder] = await db
    .insert(orders)
    .values({
      divisionId: d,
      shopifyOrderId: 'DEMO-ETSY-ORDER-1',
      orderNumber: '3001',
      customerEmail: 'buyer@example.test',
      totalCents: 2999,
      costCents: 1630,
      // Held, not fulfilled: the buyer typed something and nobody has read it.
      status: 'needs_review',
      issueNotes: 'Personalised order awaiting proof review.',
      placedAt: PLACED_AT,
      actor: 'system',
    })
    .returning()

  const [shopOrder] = await db
    .insert(orders)
    .values({
      divisionId: d,
      shopifyOrderId: 'DEMO-SHOP-ORDER-1',
      orderNumber: '1001',
      customerEmail: 'buyer2@example.test',
      totalCents: 1899,
      costCents: 600,
      status: 'shipped',
      trackingNumber: 'DEMO9400100000000000',
      placedAt: PLACED_AT,
      shippedAt: SHIPPED_AT,
      actor: 'system',
    })
    .returning()

  const [posterLine] = await db
    .insert(orderLines)
    .values({
      divisionId: d,
      orderId: etsyOrder!.id,
      channel: 'etsy',
      channelOrderId: 'DEMO-ETSY-ORDER-1',
      channelLineItemId: 'DEMO-ETSY-ORDER-1-1',
      productId: poster!.id,
      sku: 'pet-portrait-poster-a2',
      quantity: 1,
      unitPriceCents: 2999,
      personalization: { petName: 'Biscuit', note: 'The one with the chewed ear' },
      personalized: true,
      // Unreviewed on purpose: this is the row that puts an item in the queue.
      personalizationReviewedAt: null,
      actor: 'system',
    })
    .returning()

  const [removerLine] = await db
    .insert(orderLines)
    .values({
      divisionId: d,
      orderId: shopOrder!.id,
      channel: 'shopify',
      channelOrderId: 'DEMO-SHOP-ORDER-1',
      channelLineItemId: 'DEMO-SHOP-ORDER-1-1',
      productId: remover!.id,
      sku: 'pet-hair-remover-v1',
      quantity: 1,
      unitPriceCents: 1899,
      personalized: false,
      actor: 'system',
    })
    .returning()

  const [removerSupplierOrder] = await db
    .insert(supplierOrders)
    .values({
      divisionId: d,
      orderLineId: removerLine!.id,
      supplierId: petSupplier!.id,
      externalId: 'DEMO-SUP-0001',
      status: 'shipped',
      // What the supplier actually charged, which is 90c above the quote. The drift is
      // deliberate: a demo where the invoice always matches the quote leaves the
      // estimate-versus-verified split looking like bookkeeping.
      costCents: 690,
      submittedAt: PLACED_AT,
      trackingNumber: 'DEMO9400100000000000',
      shippedAt: SHIPPED_AT,
      actor: 'system',
    })
    .returning()

  /* Ledger ------------------------------------------------------------ *
   * Signed by effect on the company, and every row sourced `simulated:` so
   * Treasury marks it as such without anyone having to remember a flag.
   * -------------------------------------------------------------------- */
  await db.insert(ledger).values([
    {
      divisionId: d,
      kind: 'revenue',
      amountCents: 2999,
      source: 'simulated:etsy',
      description: 'Order 3001 — custom pet portrait poster (DEMO)',
      refTable: 'pod.orders',
      refId: etsyOrder!.id,
      occurredAt: PLACED_AT,
    },
    {
      divisionId: d,
      kind: 'cogs',
      amountCents: -1630,
      source: 'simulated:printify-catalogue',
      description: 'Estimated print and ship cost, never invoiced (DEMO)',
      refTable: 'pod.order_lines',
      refId: posterLine!.id,
      occurredAt: PLACED_AT,
    },
    {
      divisionId: d,
      kind: 'revenue',
      amountCents: 1899,
      source: 'simulated:shopify',
      description: 'Order 1001 — reusable pet hair remover (DEMO)',
      refTable: 'pod.orders',
      refId: shopOrder!.id,
      occurredAt: PLACED_AT,
    },
    {
      divisionId: d,
      kind: 'cogs',
      amountCents: -690,
      source: 'simulated:supplier-invoice',
      description: 'Supplier charge DEMO-SUP-0001, 90c above quote (DEMO)',
      refTable: 'pod.supplier_orders',
      // The supplier order's own id, not the order line's. Both are random uuids, so
      // pointing at the wrong one looked fine and failed only when followed — and
      // following a cost-basis reference is the entire point of the ledger.
      refId: removerSupplierOrder!.id,
      occurredAt: SHIPPED_AT,
    },
  ])

  await deps.events.emit({
    divisionId: d,
    kind: 'pod.demo_seeded',
    level: 'warn',
    message:
      'Paw Order seeded with FICTIONAL data: 2 products, 2 orders, 4 ledger rows. ' +
      'Nothing was sold and no money moved.',
    refTable: 'divisions',
    refId: d,
  })

  console.log(
    `seeded "${division.name}" (${DIVISION_SLUG}) with ${agents.length} agents, ` +
      '2 suppliers, 2 products, 2 channel listings, 2 orders, 4 ledger rows — all fictional',
  )
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('pet seed failed:', err)
    process.exit(1)
  })
