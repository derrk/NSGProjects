/**
 * A sales channel, as this system uses one.
 *
 * Etsy and Shopify are different businesses wearing similar APIs. The shared shape
 * here is deliberately small: draft a listing, publish it, pull orders, report a
 * shipment. Anything either platform does that the other does not stays in its own
 * adapter rather than being flattened into a lowest common denominator that lies
 * about both.
 *
 * Two rules run through every implementation in this directory.
 *
 * `provenance` is on every result and never defaults to `live`. A caller that
 * forgets to check it sees `simulated`, which is the safe way round. The expensive
 * failure in a system like this is not a crash — it is someone reading a simulated
 * result as a real one and believing a listing exists.
 *
 * Publishing takes an approval id. Creating a marketplace listing is one of the
 * actions the brief requires a distinct human approval for, so the transport layer
 * will not carry it without a citation. A policy expressed only in a prompt is a
 * request; a required argument is a gate.
 */

export type ChannelKey = 'etsy' | 'shopify'

/** Whether a result came from the real platform. Never assume. */
export type ChannelProvenance = 'live' | 'simulated'

/** How the item is made and shipped. Mirrors the pod module's vocabulary. */
export type ChannelFulfillment = 'pod' | 'dropship' | 'in_house'

export interface PersonalizationSpec {
  enabled: boolean
  /** Shown to the buyer above the input box. */
  instructions?: string
  required?: boolean
  /** Etsy caps buyer-entered personalisation. */
  maxLength?: number
}

export interface ChannelListingDraft {
  sku: string
  title: string
  description: string
  priceCents: number
  quantity: number
  tags: string[]
  imageUrls: string[]
  fulfillment: ChannelFulfillment
  /** Etsy requires this disclosed for anything made by someone else. */
  productionPartner?: string | null
  shipsFrom?: string | null
  personalization?: PersonalizationSpec | null
}

export interface ChannelListing {
  channel: ChannelKey
  externalId: string
  sku: string
  /** Null when there is no page to visit — which is always true in demo mode. */
  url: string | null
  state: 'draft' | 'active' | 'inactive'
  provenance: ChannelProvenance
  /**
   * Every approval that published this listing, in order.
   *
   * A list rather than one id, because re-publishing after an edit and a second
   * operator deciding the same listing are both real, and both produce an approval
   * the inbox records as executed. Keeping only the first meant those later
   * approvals showed as succeeded with nothing citing them.
   */
  approvalIds: string[]
  /** Present on every simulated result, in the operator's words. */
  simulatedNote?: string
}

/** Cited when publishing. Without one the call does not happen. */
export interface PublishAuthorization {
  approvalId: string
  /** Who approved it, for the trail the listing is published under. */
  approvedBy: string
}

export interface ChannelOrderLine {
  channelLineItemId: string
  sku: string | null
  quantity: number
  unitPriceCents: number
  personalization?: Record<string, unknown> | null
  personalized?: boolean
}

/** Shaped to feed the pod module's `ingestOrder` without translation. */
export interface ChannelOrder {
  channel: ChannelKey
  channelOrderId: string
  orderNumber: string | null
  customerEmail: string | null
  totalCents: number
  paid: boolean
  hasValidAddress: boolean
  placedAt: Date
  lines: ChannelOrderLine[]
  provenance: ChannelProvenance
}

/**
 * Shipment detail.
 *
 * Untracked is a case, not an omission. A shipment reported with a blank tracking
 * number is how a buyer is told their parcel is moving when nothing has moved, so
 * the absence of tracking has to be stated rather than left empty.
 */
export type ShipmentInfo =
  | { carrier: string; trackingNumber: string; trackingUrl?: string | null }
  | { untracked: true; reason: string }

export interface ShipmentResult {
  channel: ChannelKey
  channelOrderId: string
  notifiedBuyer: boolean
  provenance: ChannelProvenance
  simulatedNote?: string
}

export interface SalesChannel {
  readonly key: ChannelKey
  readonly provenance: ChannelProvenance

  /** Create the listing in a non-public state. Never publishes. */
  createDraft(draft: ChannelListingDraft): Promise<ChannelListing>

  /** Make it visible to buyers. Requires a cited approval. */
  publish(externalId: string, auth: PublishAuthorization): Promise<ChannelListing>

  getListing(externalId: string): Promise<ChannelListing | null>

  /** Orders placed since `since`. */
  listOrders(since: Date): Promise<ChannelOrder[]>

  /** Tell the channel it shipped, which is what notifies the buyer. */
  reportShipment(channelOrderId: string, shipment: ShipmentInfo): Promise<ShipmentResult>
}

export class ChannelError extends Error {
  constructor(
    message: string,
    readonly channel: ChannelKey,
    readonly code: string,
  ) {
    super(message)
    this.name = 'ChannelError'
  }
}
