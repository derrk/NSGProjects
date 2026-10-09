import { describe, expect, it } from 'vitest'

import {
  createDemoDropshipSupplier,
  createDemoEtsyChannel,
  createDemoShopifyChannel,
  ETSY_LIMITS,
  toHandle,
  type ChannelListingDraft,
} from './index'

const AUTH = { approvalId: 'apr_123', approvedBy: 'derrik' }

function etsyDraft(over: Partial<ChannelListingDraft> = {}): ChannelListingDraft {
  return {
    sku: 'pet-poster-a2',
    title: 'Custom Pet Portrait Poster',
    description: 'Hand-illustrated from your photo.',
    priceCents: 2999,
    quantity: 25,
    tags: ['pet portrait', 'dog gift'],
    imageUrls: ['https://example.test/a.png'],
    fulfillment: 'pod',
    productionPartner: 'Printify (US)',
    shipsFrom: 'United States',
    personalization: { enabled: true, instructions: 'Pet name', required: true },
    ...over,
  }
}

function shopifyDraft(over: Partial<ChannelListingDraft> = {}): ChannelListingDraft {
  return {
    sku: 'pet-hair-remover',
    title: 'Reusable Pet Hair Remover',
    description: 'Lifts hair from upholstery without sticky tape.',
    priceCents: 1899,
    quantity: 40,
    tags: ['pet hair'],
    imageUrls: ['https://example.test/b.png'],
    fulfillment: 'dropship',
    ...over,
  }
}

describe('demo Etsy channel', () => {
  it('never reports a result as live', async () => {
    const etsy = createDemoEtsyChannel()
    const listing = await etsy.createDraft(etsyDraft())
    expect(listing.provenance).toBe('simulated')
    expect(listing.simulatedNote).toMatch(/No listing exists on Etsy/)
  })

  it('gives a drafted listing no URL at all', async () => {
    // A plausible etsy.com link is precisely how someone concludes the listing is up.
    const etsy = createDemoEtsyChannel()
    const listing = await etsy.createDraft(etsyDraft())
    expect(listing.url).toBeNull()
  })

  it('creates it as a draft, never active', async () => {
    const etsy = createDemoEtsyChannel()
    expect((await etsy.createDraft(etsyDraft())).state).toBe('draft')
  })

  it('refuses to publish without an approval id', async () => {
    const etsy = createDemoEtsyChannel()
    const listing = await etsy.createDraft(etsyDraft())

    await expect(
      etsy.publish(listing.externalId, { approvalId: '  ', approvedBy: 'agent' }),
    ).rejects.toThrow(/requires an approval id/)
    expect((await etsy.getListing(listing.externalId))!.state).toBe('draft')
  })

  it('publishes once, and a redelivered approval changes nothing', async () => {
    const etsy = createDemoEtsyChannel()
    const listing = await etsy.createDraft(etsyDraft())

    const first = await etsy.publish(listing.externalId, AUTH)
    const second = await etsy.publish(listing.externalId, AUTH)

    expect(first.state).toBe('active')
    expect(second.externalId).toBe(first.externalId)
    expect(etsy.listings.size).toBe(1)
  })

  it('records every approval that published it, not just the first', async () => {
    /*
     * Returning early and keeping only the first id meant a second, distinct
     * approval resolved as a success while nothing on the listing cited it — so the
     * inbox showed that approval executed-and-succeeded with no trace of what it did.
     */
    const etsy = createDemoEtsyChannel()
    const listing = await etsy.createDraft(etsyDraft())

    await etsy.publish(listing.externalId, AUTH)
    const second = await etsy.publish(listing.externalId, {
      approvalId: 'apr_999',
      approvedBy: 'another-operator',
    })

    expect(second.approvalIds).toEqual(['apr_123', 'apr_999'])
    expect(etsy.listings.size).toBe(1)
  })

  it('does not record the same approval twice on a redelivery', async () => {
    const etsy = createDemoEtsyChannel()
    const listing = await etsy.createDraft(etsyDraft())

    await etsy.publish(listing.externalId, AUTH)
    const again = await etsy.publish(listing.externalId, AUTH)

    expect(again.approvalIds).toEqual(['apr_123'])
  })

  it('refuses a dropshipped listing outright', async () => {
    // Etsy's API would accept this and act on the shop later. Refusing here is why
    // the adapter exists rather than a thin HTTP wrapper.
    const etsy = createDemoEtsyChannel()
    await expect(etsy.createDraft(etsyDraft({ fulfillment: 'dropship' }))).rejects.toThrow(
      /does not allow ordinary resale/,
    )
  })

  it('refuses a print-on-demand listing with no production partner', async () => {
    const etsy = createDemoEtsyChannel()
    await expect(etsy.createDraft(etsyDraft({ productionPartner: '' }))).rejects.toThrow(
      /production partner/,
    )
  })

  it('enforces the limits a listing is rejected on', async () => {
    const etsy = createDemoEtsyChannel()

    await expect(etsy.createDraft(etsyDraft({ title: 'x'.repeat(141) }))).rejects.toThrow(/140/)
    await expect(
      etsy.createDraft(etsyDraft({ tags: Array.from({ length: 14 }, (_, i) => `t${i}`) })),
    ).rejects.toThrow(/13 tags/)
    await expect(etsy.createDraft(etsyDraft({ tags: ['x'.repeat(21)] }))).rejects.toThrow(/20/)
    await expect(etsy.createDraft(etsyDraft({ imageUrls: [] }))).rejects.toThrow(/at least one image/)
  })

  it('will not open a personalisation box with nothing written on it', async () => {
    const etsy = createDemoEtsyChannel()
    await expect(
      etsy.createDraft(etsyDraft({ personalization: { enabled: true, instructions: '' } })),
    ).rejects.toThrow(/instructions/)
  })

  it('caps personalisation at what Etsy accepts', async () => {
    const etsy = createDemoEtsyChannel()
    await expect(
      etsy.createDraft(
        etsyDraft({
          personalization: {
            enabled: true,
            instructions: 'Pet name',
            maxLength: ETSY_LIMITS.personalizationMaxLength + 1,
          },
        }),
      ),
    ).rejects.toThrow(/1024/)
  })

  it('says plainly that no buyer was notified of a shipment', async () => {
    const etsy = createDemoEtsyChannel()
    etsy.seedOrder({
      channelOrderId: 'E-1',
      orderNumber: '1001',
      customerEmail: 'buyer@example.test',
      totalCents: 2999,
      paid: true,
      hasValidAddress: true,
      placedAt: new Date('2026-10-01'),
      lines: [
        { channelLineItemId: 'E-1-1', sku: 'pet-poster-a2', quantity: 1, unitPriceCents: 2999 },
      ],
    })

    const result = await etsy.reportShipment('E-1', {
      carrier: 'USPS',
      trackingNumber: '9400111899223',
    })

    // The support drafter reads this. True here would have it write to a customer
    // who has heard nothing.
    expect(result.notifiedBuyer).toBe(false)
    expect(result.provenance).toBe('simulated')
  })

  it('will not report a shipment against an order it has never seen', async () => {
    const etsy = createDemoEtsyChannel()
    await expect(
      etsy.reportShipment('nope', { untracked: true, reason: 'letter post' }),
    ).rejects.toThrow(/No order/)
  })

  it('returns only orders placed since the watermark', async () => {
    const etsy = createDemoEtsyChannel()
    const base = {
      orderNumber: null,
      customerEmail: null,
      totalCents: 1000,
      paid: true,
      hasValidAddress: true,
      lines: [],
    }
    etsy.seedOrder({ ...base, channelOrderId: 'old', placedAt: new Date('2026-09-01') })
    etsy.seedOrder({ ...base, channelOrderId: 'new', placedAt: new Date('2026-10-05') })

    const since = await etsy.listOrders(new Date('2026-10-01'))
    expect(since.map((o) => o.channelOrderId)).toEqual(['new'])
  })
})

describe('demo Shopify channel', () => {
  it('allows the dropshipped item Etsy refused', async () => {
    const shopify = createDemoShopifyChannel()
    const product = await shopify.createDraft(shopifyDraft())
    expect(product.state).toBe('draft')
    expect(product.provenance).toBe('simulated')
  })

  it('requires a SKU, which Shopify itself does not', async () => {
    // Without one an order line cannot be matched to what it costs us, so every
    // margin figure for it would be a guess.
    const shopify = createDemoShopifyChannel()
    await expect(shopify.createDraft(shopifyDraft({ sku: '' }))).rejects.toThrow(/cannot be costed/)
  })

  it('suffixes a colliding handle rather than overwriting', async () => {
    const shopify = createDemoShopifyChannel()
    await shopify.createDraft(shopifyDraft({ sku: 'a' }))
    await shopify.createDraft(shopifyDraft({ sku: 'b' }))

    const handles = [...shopify.products.values()].map((p) => p.handle)
    expect(handles).toEqual(['reusable-pet-hair-remover', 'reusable-pet-hair-remover-1'])
  })

  it('decrements stock when something sells', async () => {
    /*
     * The header claims overselling is one of the two things this adapter models, and
     * it was not: inventory was a frozen snapshot, so a product with 1 in stock could
     * sell 50 and still report 1 — and the empty-stock publish guard could never fire
     * again, because the number it reads could not reach zero.
     */
    const shopify = createDemoShopifyChannel()
    const product = await shopify.createDraft(shopifyDraft({ quantity: 10 }))

    shopify.seedOrder({
      channelOrderId: 'S-1',
      orderNumber: '1',
      customerEmail: null,
      totalCents: 1899,
      paid: true,
      hasValidAddress: true,
      placedAt: new Date('2026-10-05'),
      lines: [
        { channelLineItemId: 'S-1-1', sku: 'pet-hair-remover', quantity: 3, unitPriceCents: 1899 },
      ],
    })

    expect(shopify.products.get(product.externalId)!.inventory).toBe(7)
  })

  it('lets stock go negative, because that is what overselling is', async () => {
    const shopify = createDemoShopifyChannel()
    const product = await shopify.createDraft(shopifyDraft({ quantity: 1 }))

    shopify.seedOrder({
      channelOrderId: 'S-2',
      orderNumber: '2',
      customerEmail: null,
      totalCents: 1899,
      paid: true,
      hasValidAddress: true,
      placedAt: new Date('2026-10-05'),
      lines: [
        { channelLineItemId: 'S-2-1', sku: 'pet-hair-remover', quantity: 50, unitPriceCents: 1899 },
      ],
    })

    // A floor at zero would hide the thing worth seeing.
    expect(shopify.products.get(product.externalId)!.inventory).toBe(-49)
  })

  it('refuses a negative quantity rather than storing it', async () => {
    // Stored unchecked, a product was born already oversold and the publish guard
    // reported it as out of stock rather than as nonsense someone typed.
    const shopify = createDemoShopifyChannel()
    await expect(shopify.createDraft(shopifyDraft({ quantity: -5 }))).rejects.toThrow(
      /cannot be negative/,
    )
  })

  it('refuses to publish a product with no stock', async () => {
    const shopify = createDemoShopifyChannel()
    const product = await shopify.createDraft(shopifyDraft({ quantity: 0 }))
    await expect(shopify.publish(product.externalId, AUTH)).rejects.toThrow(/no inventory/)
  })

  it('refuses to publish without an approval id', async () => {
    const shopify = createDemoShopifyChannel()
    const product = await shopify.createDraft(shopifyDraft())
    await expect(
      shopify.publish(product.externalId, { approvalId: '', approvedBy: 'agent' }),
    ).rejects.toThrow(/approval id/)
  })
})

describe('toHandle', () => {
  it('matches how Shopify derives a URL from a title', () => {
    expect(toHandle('Reusable Pet Hair Remover!')).toBe('reusable-pet-hair-remover')
    expect(toHandle('  --Dog & Cat--  ')).toBe('dog-cat')
  })

  it('returns an empty handle for a title of pure punctuation', () => {
    // The name used to say the opposite of what this asserts. toHandle genuinely
    // returns ''; the non-empty fallback lives in uniqueHandle, and is tested below.
    expect(toHandle('!!!')).toBe('')
  })
})

describe('Shopify handle fallback', () => {
  it('gives a punctuation-only title a real handle rather than a blank one', async () => {
    /*
     * The fallback nothing exercised. Change `toHandle(title) || 'product'` to
     * `|| ''` and every test used to still pass, while a punctuation-titled product
     * silently got a blank handle and the collision suffixing started keying on the
     * empty string.
     */
    const shopify = createDemoShopifyChannel()
    await shopify.createDraft(shopifyDraft({ title: '!!!', sku: 'a' }))
    await shopify.createDraft(shopifyDraft({ title: '???', sku: 'b' }))

    const handles = [...shopify.products.values()].map((p) => p.handle)
    expect(handles).toEqual(['product', 'product-1'])
  })
})

describe('demo dropship supplier', () => {
  const catalog = [
    {
      supplierSku: 'PHR-001',
      title: 'Pet hair remover',
      itemCostCents: 420,
      shippingCostCents: { US: 180, '*': 640 },
      leadTimeDaysMin: 7,
      leadTimeDaysMax: 21,
      inStock: true,
    },
    {
      supplierSku: 'GONE-9',
      title: 'Discontinued',
      itemCostCents: 100,
      shippingCostCents: { '*': 100 },
      leadTimeDaysMin: 7,
      leadTimeDaysMax: 21,
      inStock: false,
    },
  ]

  it('marks a quote as an estimate, always', async () => {
    const supplier = createDemoDropshipSupplier(catalog)
    const quote = (await supplier.quote('PHR-001', { countryCode: 'US' }))!
    expect(quote.provenance).toBe('estimated')
  })

  it('quotes a lead time as a range, not a single number', async () => {
    // A single number ends up printed on a listing, and the wide end is the one
    // that generates the support ticket.
    const supplier = createDemoDropshipSupplier(catalog)
    const quote = (await supplier.quote('PHR-001', { countryCode: 'US' }))!
    expect(quote.leadTimeDaysMax).toBeGreaterThan(quote.leadTimeDaysMin)
  })

  it('charges more to ship outside the supplier’s home country', async () => {
    const supplier = createDemoDropshipSupplier(catalog)
    const home = (await supplier.quote('PHR-001', { countryCode: 'US' }))!
    const away = (await supplier.quote('PHR-001', { countryCode: 'AU' }))!
    expect(away.shippingCostCents).toBeGreaterThan(home.shippingCostCents)
  })

  it('returns null for a SKU it does not carry', async () => {
    const supplier = createDemoDropshipSupplier(catalog)
    expect(await supplier.quote('nope', { countryCode: 'US' })).toBeNull()
  })

  it('marks what an order actually cost as verified', async () => {
    const supplier = createDemoDropshipSupplier(catalog)
    const order = await supplier.placeOrder({
      referenceId: 'ord-1',
      lines: [{ supplierSku: 'PHR-001', quantity: 2 }],
      destination: { countryCode: 'US' },
      shippingName: 'A Buyer',
      shippingAddress: '1 Example St',
    })

    expect(order.provenance).toBe('verified')
    expect(order.chargedItemCostCents).toBe(840)
  })

  it('reports an invoice that differs from the quote', async () => {
    // The real thing drifts. A demo where it never does would leave the
    // estimate-versus-verified split untested in the only place it matters.
    const supplier = createDemoDropshipSupplier(catalog)
    const quote = (await supplier.quote('PHR-001', { countryCode: 'US' }))!
    supplier.setCostDrift(75)

    const order = await supplier.placeOrder({
      referenceId: 'ord-drift',
      lines: [{ supplierSku: 'PHR-001', quantity: 1 }],
      destination: { countryCode: 'US' },
      shippingName: 'A Buyer',
      shippingAddress: '1 Example St',
    })

    expect(order.chargedItemCostCents).toBe(quote.itemCostCents + 75)
  })

  it('does not order twice for one reference', async () => {
    // The duplicate here is a second parcel and a second charge.
    const supplier = createDemoDropshipSupplier(catalog)
    const input = {
      referenceId: 'ord-2',
      lines: [{ supplierSku: 'PHR-001', quantity: 1 }],
      destination: { countryCode: 'US' },
      shippingName: 'A Buyer',
      shippingAddress: '1 Example St',
    }

    const first = await supplier.placeOrder(input)
    const second = await supplier.placeOrder(input)

    expect(second.supplierOrderId).toBe(first.supplierOrderId)
    expect(supplier.orders.size).toBe(1)
  })

  it('refuses an out-of-stock SKU rather than accepting and failing later', async () => {
    const supplier = createDemoDropshipSupplier(catalog)
    await expect(
      supplier.placeOrder({
        referenceId: 'ord-3',
        lines: [{ supplierSku: 'GONE-9', quantity: 1 }],
        destination: { countryCode: 'US' },
        shippingName: 'A Buyer',
        shippingAddress: '1 Example St',
      }),
    ).rejects.toThrow(/out of stock/)
    expect(supplier.orders.size).toBe(0)
  })

  it('carries tracking once the supplier ships', async () => {
    const supplier = createDemoDropshipSupplier(catalog)
    const order = await supplier.placeOrder({
      referenceId: 'ord-4',
      lines: [{ supplierSku: 'PHR-001', quantity: 1 }],
      destination: { countryCode: 'US' },
      shippingName: 'A Buyer',
      shippingAddress: '1 Example St',
    })

    expect(order.tracking).toBeNull()
    supplier.advance(order.supplierOrderId, 'shipped', { carrier: 'USPS', trackingNumber: '94001' })

    const fresh = (await supplier.getOrder(order.supplierOrderId))!
    expect(fresh.status).toBe('shipped')
    expect(fresh.tracking).toEqual({ carrier: 'USPS', trackingNumber: '94001' })
  })
})
