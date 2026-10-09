/**
 * An offline Shopify.
 *
 * Shopify is the permissive one: it is the operator's own store, so resale is fine
 * and the platform does not police what is sold there. The constraints that bite on
 * Shopify are operational rather than editorial — a handle collision silently
 * rewrites your URL, and selling stock you do not have is a refund rather than a
 * sale. Those are the two this models.
 */

import {
  ChannelError,
  type ChannelListing,
  type ChannelListingDraft,
  type ChannelOrder,
  type PublishAuthorization,
  type SalesChannel,
  type ShipmentInfo,
  type ShipmentResult,
} from './types'

const NOTE =
  'Simulated. No product exists in any Shopify store, nothing is purchasable, and ' +
  'no money has moved.'

/** Shopify derives a URL handle from the title; collisions get a numeric suffix. */
export function toHandle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 255)
}

interface DemoProductRow extends ChannelListing {
  handle: string
  draft: ChannelListingDraft
  inventory: number
}

export interface DemoShopifyChannel extends SalesChannel {
  readonly products: Map<string, DemoProductRow>
  seedOrder(order: Omit<ChannelOrder, 'channel' | 'provenance'>): void
  readonly shipments: Array<{ channelOrderId: string; shipment: ShipmentInfo }>
}

export function createDemoShopifyChannel(): DemoShopifyChannel {
  const products = new Map<string, DemoProductRow>()
  const handles = new Set<string>()
  const orders: ChannelOrder[] = []
  const shipments: Array<{ channelOrderId: string; shipment: ShipmentInfo }> = []
  let seq = 0

  function uniqueHandle(title: string): string {
    const base = toHandle(title) || 'product'
    if (!handles.has(base)) return base
    let n = 1
    while (handles.has(`${base}-${n}`)) n += 1
    return `${base}-${n}`
  }

  return {
    key: 'shopify',
    provenance: 'simulated',
    products,
    shipments,

    async createDraft(draft) {
      if (!draft.title.trim()) {
        throw new ChannelError('A product needs a title.', 'shopify', 'title.empty')
      }
      if (draft.priceCents <= 0) {
        throw new ChannelError('A product needs a price above zero.', 'shopify', 'price.invalid')
      }
      if (!draft.sku.trim()) {
        // Shopify tolerates a blank SKU. This system does not: the SKU is how an
        // order line is matched back to what it costs us.
        throw new ChannelError(
          'A product needs a SKU. Without one an order cannot be costed.',
          'shopify',
          'sku.missing',
        )
      }

      if (draft.quantity < 0) {
        // Stored unchecked, a negative quantity meant a product was born already
        // oversold, and the publish guard reported it as out of stock rather than as
        // nonsense someone typed.
        throw new ChannelError(
          `Quantity cannot be negative (got ${draft.quantity}).`,
          'shopify',
          'quantity.invalid',
        )
      }

      seq += 1
      const externalId = `DEMO-SHOP-${String(seq).padStart(4, '0')}`
      const handle = uniqueHandle(draft.title)
      handles.add(handle)

      const row: DemoProductRow = {
        channel: 'shopify',
        externalId,
        sku: draft.sku,
        url: null,
        state: 'draft',
        provenance: 'simulated',
        simulatedNote: NOTE,
        handle,
        draft,
        inventory: draft.quantity,
        approvalIds: [],
      }
      products.set(externalId, row)
      return { ...row }
    },

    async publish(externalId, auth: PublishAuthorization) {
      const row = products.get(externalId)
      if (!row) throw new ChannelError(`No product ${externalId}.`, 'shopify', 'product.not_found')
      if (!auth?.approvalId?.trim()) {
        throw new ChannelError(
          'Publishing to Shopify requires an approval id.',
          'shopify',
          'approval.missing',
        )
      }
      // Appended, not replaced: a second distinct approval that publishes the same
      // product must leave a trace, or the inbox records a decision nothing cites.
      if (!row.approvalIds.includes(auth.approvalId)) row.approvalIds.push(auth.approvalId)
      if (row.state === 'active') return { ...row, approvalIds: [...row.approvalIds] }

      /*
       * A dropshipped product goes live with whatever stock the supplier confirmed.
       * Publishing at zero means every visitor lands on a sold-out page, which is
       * worse than not publishing: it spends the traffic and converts none of it.
       */
      if (row.inventory <= 0) {
        throw new ChannelError(
          'This product has no inventory. Publishing it would sell nothing and spend the traffic.',
          'shopify',
          'inventory.empty',
        )
      }

      row.state = 'active'
      return { ...row, approvalIds: [...row.approvalIds] }
    },

    async getListing(externalId) {
      const row = products.get(externalId)
      return row ? { ...row } : null
    },

    async listOrders(since) {
      return orders.filter((o) => o.placedAt >= since).map((o) => ({ ...o }))
    },

    async reportShipment(channelOrderId, shipment) {
      const known = orders.some((o) => o.channelOrderId === channelOrderId)
      if (!known) {
        throw new ChannelError(`No order ${channelOrderId}.`, 'shopify', 'order.not_found')
      }
      shipments.push({ channelOrderId, shipment })
      return {
        channel: 'shopify',
        channelOrderId,
        notifiedBuyer: false,
        provenance: 'simulated',
        simulatedNote: NOTE,
      }
    },

    seedOrder(order) {
      orders.push({ ...order, channel: 'shopify', provenance: 'simulated' })

      /*
       * Stock actually moves when something sells.
       *
       * The header above claims overselling is one of the two things this adapter
       * models, and it was not: inventory was a frozen snapshot of whatever the
       * draft was created with, so a product with 1 in stock could sell 50 and still
       * report 1 — and the empty-stock publish guard could never fire again, because
       * the number it reads could not reach zero. Allowed to go negative on purpose:
       * that is what overselling is, and a floor at zero would hide it.
       */
      for (const line of order.lines) {
        if (!line.sku) continue
        for (const product of products.values()) {
          if (product.sku === line.sku) product.inventory -= line.quantity
        }
      }
    },
  }
}
