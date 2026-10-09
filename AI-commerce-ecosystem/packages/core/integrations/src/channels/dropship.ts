/**
 * A dropship supplier.
 *
 * The separation that earns this file: a quote is an estimate and an invoice is a
 * fact, and dropshipping is the business where confusing the two loses money
 * quietly. A supplier's listed price excludes the shipping surcharge to half the
 * destinations, and their "7 day delivery" is a dispatch time, not an arrival. A
 * margin model built on quotes alone reads healthy right up until the first
 * month's statement.
 *
 * So `quote` returns `estimated` and `placeOrder` returns `verified`, and nothing
 * in this interface lets a caller get a verified number without an order existing.
 */

export type CostProvenance = 'estimated' | 'verified'

export interface SupplierDestination {
  countryCode: string
  postalCode?: string | null
}

export interface SupplierQuote {
  supplierSku: string
  itemCostCents: number
  shippingCostCents: number
  currency: string
  /** Always `estimated`. A quote is not an invoice. */
  provenance: 'estimated'
  /**
   * Dispatch-to-door, as a range. A single number invites someone to print it on a
   * listing, and the wide end is the one that generates the support ticket.
   */
  leadTimeDaysMin: number
  leadTimeDaysMax: number
  /** What the figures were read off, and when. */
  source: string
  inStock: boolean
}

export interface SupplierOrderLine {
  supplierSku: string
  quantity: number
}

export interface PlaceSupplierOrderInput {
  /** Our order id. The supplier echoes it, which is how duplicates are caught. */
  referenceId: string
  lines: SupplierOrderLine[]
  destination: SupplierDestination
  shippingName: string
  shippingAddress: string
}

export interface SupplierOrder {
  supplierOrderId: string
  referenceId: string
  status: 'accepted' | 'in_production' | 'shipped' | 'cancelled'
  /** What we were actually charged. Only exists once an order does. */
  chargedItemCostCents: number
  chargedShippingCostCents: number
  provenance: CostProvenance
  tracking?: { carrier: string; trackingNumber: string } | null
  simulatedNote?: string
}

export interface DropshipSupplier {
  readonly key: string
  readonly label: string
  readonly provenance: 'live' | 'simulated'

  quote(supplierSku: string, destination: SupplierDestination): Promise<SupplierQuote | null>
  placeOrder(input: PlaceSupplierOrderInput): Promise<SupplierOrder>
  getOrder(supplierOrderId: string): Promise<SupplierOrder | null>
}

export class SupplierError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = 'SupplierError'
  }
}

export interface DemoSupplierCatalogItem {
  supplierSku: string
  title: string
  itemCostCents: number
  /** Keyed by country code, falling back to `*`. */
  shippingCostCents: Record<string, number>
  leadTimeDaysMin: number
  leadTimeDaysMax: number
  inStock: boolean
}

export interface DemoDropshipSupplier extends DropshipSupplier {
  readonly orders: Map<string, SupplierOrder>
  /** Make the next placed order come back dearer than quoted. */
  setCostDrift(cents: number): void
  advance(
    supplierOrderId: string,
    status: SupplierOrder['status'],
    tracking?: { carrier: string; trackingNumber: string },
  ): void
}

const NOTE = 'Simulated. No order was placed with any supplier and nothing was charged.'

/**
 * An offline supplier.
 *
 * `costDrift` exists because the real version of this always drifts — a surcharge,
 * a currency move, a price rise the catalogue has not caught up with. A demo where
 * the invoice always equals the quote teaches the pipeline something false, and the
 * estimate-versus-verified split would never be exercised.
 */
export function createDemoDropshipSupplier(
  catalog: DemoSupplierCatalogItem[],
  options: { key?: string; label?: string } = {},
): DemoDropshipSupplier {
  const bySku = new Map(catalog.map((c) => [c.supplierSku, c]))
  const orders = new Map<string, SupplierOrder>()
  const byReference = new Map<string, string>()
  let costDrift = 0
  let seq = 0

  const shippingFor = (item: DemoSupplierCatalogItem, destination: SupplierDestination): number =>
    item.shippingCostCents[destination.countryCode] ?? item.shippingCostCents['*'] ?? 0

  return {
    key: options.key ?? 'demo-supplier',
    label: options.label ?? 'Demo supplier',
    provenance: 'simulated',
    orders,

    setCostDrift(cents) {
      costDrift = cents
    },

    async quote(supplierSku, destination) {
      const item = bySku.get(supplierSku)
      if (!item) return null
      return {
        supplierSku,
        itemCostCents: item.itemCostCents,
        shippingCostCents: shippingFor(item, destination),
        currency: 'USD',
        provenance: 'estimated',
        leadTimeDaysMin: item.leadTimeDaysMin,
        leadTimeDaysMax: item.leadTimeDaysMax,
        source: 'Fictional demo catalogue. These are no supplier’s real prices.',
        inStock: item.inStock,
      }
    },

    async placeOrder(input) {
      if (input.lines.length === 0) {
        throw new SupplierError('An order needs at least one line.', 'lines.empty')
      }

      // Idempotent on our own reference. A retried submit must not order twice —
      // the duplicate here is a second parcel and a second charge.
      const seen = byReference.get(input.referenceId)
      if (seen) return { ...orders.get(seen)! }

      let item = 0
      let shipping = 0
      for (const line of input.lines) {
        const catalogItem = bySku.get(line.supplierSku)
        if (!catalogItem) {
          throw new SupplierError(`Unknown SKU ${line.supplierSku}.`, 'sku.unknown')
        }
        if (!catalogItem.inStock) {
          throw new SupplierError(`${line.supplierSku} is out of stock.`, 'sku.out_of_stock')
        }
        item += catalogItem.itemCostCents * line.quantity
        shipping += shippingFor(catalogItem, input.destination)
      }

      seq += 1
      const supplierOrderId = `DEMO-SUP-${String(seq).padStart(4, '0')}`
      const order: SupplierOrder = {
        supplierOrderId,
        referenceId: input.referenceId,
        status: 'accepted',
        chargedItemCostCents: item + costDrift,
        chargedShippingCostCents: shipping,
        provenance: 'verified',
        tracking: null,
        simulatedNote: NOTE,
      }
      orders.set(supplierOrderId, order)
      byReference.set(input.referenceId, supplierOrderId)
      return { ...order }
    },

    async getOrder(supplierOrderId) {
      const order = orders.get(supplierOrderId)
      return order ? { ...order } : null
    },

    advance(supplierOrderId, status, tracking) {
      const order = orders.get(supplierOrderId)
      if (!order) throw new SupplierError(`No order ${supplierOrderId}.`, 'order.not_found')
      order.status = status
      if (tracking) order.tracking = tracking
    },
  }
}
