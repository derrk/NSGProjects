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
  approvalId: string | null
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
        approvalId: null,
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
      if (row.state === 'active') return { ...row }

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
      row.approvalId = auth.approvalId
      return { ...row }
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
    },
  }
}
