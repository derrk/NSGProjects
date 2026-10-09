/**
 * An offline Etsy.
 *
 * Worth being clear about what this is and is not. There is no live adapter yet, so
 * nothing here reaches Etsy. What it is: a place for the rest of the pipeline to run
 * end to end, enforcing the constraints Etsy really does enforce, so the shape of a
 * listing is wrong here rather than wrong there.
 *
 * The integration matrix reports Etsy as `demo`, not `manual` — this file is the
 * working simulation that distinction turns on, and an earlier version of this
 * comment said `manual`, contradicting the project's own reason for having two
 * labels. A token in the environment still cannot make it `live`, because nothing
 * here speaks to the platform.
 *
 * The limits below are the ones a listing gets rejected on. They are copied from
 * Etsy's published listing rules as of Oct 2026 and will drift; re-check them before
 * the live adapter is written.
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

/** Etsy's listing limits. Exported so a drafting agent can respect them up front. */
export const ETSY_LIMITS = {
  titleMaxLength: 140,
  maxTags: 13,
  tagMaxLength: 20,
  maxImages: 10,
  personalizationMaxLength: 1024,
} as const

const NOTE =
  'Simulated. No listing exists on Etsy, nothing is visible to any buyer, and no ' +
  'fees have been charged.'

interface DemoListingRow extends ChannelListing {
  draft: ChannelListingDraft
}

export interface DemoEtsyChannel extends SalesChannel {
  /** Everything drafted, for assertions and for the walkthrough screen. */
  readonly listings: Map<string, DemoListingRow>
  /** Orders the operator has injected to exercise fulfilment. */
  seedOrder(order: Omit<ChannelOrder, 'channel' | 'provenance'>): void
  readonly shipments: Array<{ channelOrderId: string; shipment: ShipmentInfo }>
}

export function createDemoEtsyChannel(): DemoEtsyChannel {
  const listings = new Map<string, DemoListingRow>()
  const orders: ChannelOrder[] = []
  const shipments: Array<{ channelOrderId: string; shipment: ShipmentInfo }> = []
  let seq = 0

  function validate(draft: ChannelListingDraft): void {
    const fail = (code: string, message: string) => {
      throw new ChannelError(message, 'etsy', code)
    }

    if (!draft.title.trim()) fail('title.empty', 'A listing needs a title.')
    if (draft.title.length > ETSY_LIMITS.titleMaxLength) {
      fail(
        'title.too_long',
        `Etsy titles are capped at ${ETSY_LIMITS.titleMaxLength} characters; this is ${draft.title.length}.`,
      )
    }
    if (draft.tags.length > ETSY_LIMITS.maxTags) {
      fail('tags.too_many', `Etsy allows ${ETSY_LIMITS.maxTags} tags; this has ${draft.tags.length}.`)
    }
    const longTag = draft.tags.find((t) => t.length > ETSY_LIMITS.tagMaxLength)
    if (longTag) {
      fail('tags.too_long', `Etsy tags are capped at ${ETSY_LIMITS.tagMaxLength} characters: "${longTag}".`)
    }
    if (draft.imageUrls.length === 0) fail('images.missing', 'Etsy requires at least one image.')
    if (draft.imageUrls.length > ETSY_LIMITS.maxImages) {
      fail('images.too_many', `Etsy allows ${ETSY_LIMITS.maxImages} images.`)
    }
    if (draft.priceCents <= 0) fail('price.invalid', 'An Etsy listing needs a price above zero.')

    /*
     * The two that close shops rather than returning an error.
     *
     * Etsy will accept a dropshipped listing through the API and then act on it
     * later, so refusing it here is the point: the API accepting something is not
     * the platform allowing it.
     */
    if (draft.fulfillment === 'dropship') {
      fail(
        'policy.resale',
        'Etsy does not allow ordinary resale of a supplier’s catalogue item. This belongs on Shopify.',
      )
    }
    if (draft.fulfillment === 'pod' && !draft.productionPartner?.trim()) {
      fail(
        'policy.production_partner',
        'Etsy requires the production partner to be disclosed on a print-on-demand listing.',
      )
    }

    const personalization = draft.personalization
    if (personalization?.enabled) {
      const max = personalization.maxLength ?? ETSY_LIMITS.personalizationMaxLength
      if (max > ETSY_LIMITS.personalizationMaxLength) {
        fail(
          'personalization.too_long',
          `Etsy caps buyer personalisation at ${ETSY_LIMITS.personalizationMaxLength} characters.`,
        )
      }
      if (!personalization.instructions?.trim()) {
        fail(
          'personalization.no_instructions',
          'A personalised listing needs instructions telling the buyer what to enter.',
        )
      }
    }
  }

  return {
    key: 'etsy',
    provenance: 'simulated',
    listings,
    shipments,

    async createDraft(draft) {
      validate(draft)
      seq += 1
      const externalId = `DEMO-ETSY-${String(seq).padStart(4, '0')}`
      const row: DemoListingRow = {
        channel: 'etsy',
        externalId,
        sku: draft.sku,
        // Deliberately null. A plausible-looking etsy.com URL here is precisely how
        // someone comes to believe a listing exists.
        url: null,
        state: 'draft',
        provenance: 'simulated',
        simulatedNote: NOTE,
        draft,
        approvalIds: [],
      }
      listings.set(externalId, row)
      return { ...row }
    },

    async publish(externalId, auth: PublishAuthorization) {
      const row = listings.get(externalId)
      if (!row) throw new ChannelError(`No draft ${externalId}.`, 'etsy', 'listing.not_found')
      if (!auth?.approvalId?.trim()) {
        throw new ChannelError(
          'Publishing to Etsy requires an approval id. Creating a public listing is not an ' +
            'action an agent takes on its own.',
          'etsy',
          'approval.missing',
        )
      }
      /*
       * Idempotent on the listing, but every approval that published it is recorded.
       *
       * Returning early and keeping only the FIRST approval id meant a second,
       * distinct approval — re-publishing after an edit, or a second operator
       * deciding the same listing — resolved as a success while nothing on the
       * listing cited it. The inbox then shows that approval executed-and-succeeded
       * with no trace of what it actually did.
       */
      if (!row.approvalIds.includes(auth.approvalId)) row.approvalIds.push(auth.approvalId)
      if (row.state === 'active') return { ...row, approvalIds: [...row.approvalIds] }

      row.state = 'active'
      return { ...row, approvalIds: [...row.approvalIds] }
    },

    async getListing(externalId) {
      const row = listings.get(externalId)
      return row ? { ...row } : null
    },

    async listOrders(since) {
      return orders.filter((o) => o.placedAt >= since).map((o) => ({ ...o }))
    },

    async reportShipment(channelOrderId, shipment) {
      const known = orders.some((o) => o.channelOrderId === channelOrderId)
      if (!known) {
        throw new ChannelError(`No order ${channelOrderId}.`, 'etsy', 'order.not_found')
      }
      shipments.push({ channelOrderId, shipment })
      return {
        channel: 'etsy',
        channelOrderId,
        // False, and it matters: in demo mode no buyer was emailed. Reporting true
        // here would have the support agent believe the customer already knows.
        notifiedBuyer: false,
        provenance: 'simulated',
        simulatedNote: NOTE,
      }
    },

    seedOrder(order) {
      orders.push({ ...order, channel: 'etsy', provenance: 'simulated' })
    },
  }
}
