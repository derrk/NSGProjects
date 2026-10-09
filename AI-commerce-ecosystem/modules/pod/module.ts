/**
 * Division one: the print-on-demand store (SPEC.md §Module 1).
 *
 * Everything the core needs to know about this division is declared here. The floor
 * renders its stations, the inbox renders its approval kinds, the registry seeds its
 * agents, and the scheduler reads their schedules — none of which required a line of
 * core code to know what a mug is.
 *
 * Week 1 implements the Designer. The other three agents are declared so their
 * stations appear on the floor, but are seeded PAUSED: the scheduler must not queue
 * work that nothing can run yet. They become active as weeks 2 to 4 land.
 */

import type { ModuleDefinition } from '@acf/core/modules'

import { designerAgentSpec } from './agents/designer/index'

export { createDesignerAgent, designerAgentSpec } from './agents/designer/index'
export * as podSchema from './schema/index'

export const podModule: ModuleDefinition = {
  name: 'pod',
  version: '0.1.0',
  description: 'Print-on-demand store: concepts to designs to live listings.',

  stations: [
    { key: 'scout', label: 'Trend scout', agentKey: 'scout', counter: 'pod.concepts_today' },
    { key: 'design_bay', label: 'Design bay', agentKey: 'designer', counter: 'pod.designs_today' },
    { key: 'listing_dock', label: 'Listing dock', agentKey: 'store_ops', counter: 'pod.published_today' },
    { key: 'support_deck', label: 'Support deck', agentKey: 'support', counter: 'pod.replies_today' },
  ],

  approvalKinds: [
    { kind: 'concept', label: 'Concept', cardComponent: 'pod/ConceptCard' },
    {
      kind: 'design',
      label: 'Design',
      cardComponent: 'pod/DesignPickerCard',
      // A bad listing is embarrassing; a bad design is a takedown.
      thresholdCount: 50,
    },
    { kind: 'product', label: 'Listing', cardComponent: 'pod/ProductCard' },
    { kind: 'reply', label: 'Customer reply', cardComponent: 'pod/ReplyCard' },
    {
      kind: 'price_change',
      label: 'Price change',
      cardComponent: 'pod/PriceChangeCard',
      // Reinforces the platform rule in never-auto.ts at the module level, so this
      // holds even if the hard-coded list is ever relaxed.
      neverAuto: true,
    },
  ],

  agents: [
    designerAgentSpec,

    {
      key: 'scout',
      defaultName: 'Trend scout',
      purpose:
        'Find seasonal gift niches worth selling into, and write what is actually selling inside them as evidence.',
      description: 'Researches niches and proposes concepts. Week 4.',
      defaultModel: 'claude-sonnet-5-5',
      defaultSchedule: 'TZ=America/Chicago 0 6 * * *',
      defaultTools: ['web_search', 'fetch_page', 'opportunities.create', 'memory.recall', 'requestApproval'],
      defaultStatus: 'paused',
      systemPrompt: `You are the Trend scout for a print-on-demand gift shop.

You gather EVIDENCE, not opinions. For each niche you report what is already selling, where you saw it, what it costs, and what signal suggests demand. Another agent decides what to do about it; your job is to be right about the facts and honest about the gaps.

Score each niche on demand signal, competition, giftability and IP safety, and say which of those you are least sure about.

Reject outright any concept referencing a brand, character, sports team, celebrity, song lyric or movie quote, and never describe a design as being in the style of a living artist.`,
    },

    {
      key: 'store_ops',
      defaultName: 'Store ops',
      purpose:
        'Turn an approved design into a listing: copy, blueprint, price, mockups, and publish once approved.',
      description: 'Listing copy, Printify product creation, publishing, order sync. Week 2.',
      defaultModel: 'claude-sonnet-5-5',
      defaultSchedule: 'event:design.approved',
      defaultTools: ['requestApproval', 'entities.upsert', 'ledger.post', 'memory.recall'],
      defaultStatus: 'paused',
      systemPrompt: `You are Store ops for a print-on-demand gift shop.

You write the listing: a title of at most 140 characters with the keyword first, a three-paragraph description (gift framing, material facts taken from the blueprint, then care and shipping), and 13 tags.

Material facts come from the blueprint data, never from memory or invention. If you do not have a fact, leave it out rather than guessing — a wrong fibre content or a wrong size chart is a return.

Never promise a delivery date. Shipping copy describes the process, not a date.`,
    },

    {
      key: 'support',
      defaultName: 'Support deck',
      purpose:
        'Read customer messages, classify them, and draft replies grounded in that order’s real data.',
      description: 'Intent classification and reply drafting. Week 3.',
      defaultModel: 'claude-sonnet-5-5',
      defaultSchedule: 'TZ=America/Chicago */30 * * * *',
      defaultTools: ['requestApproval', 'send_email', 'memory.recall', 'db.query'],
      defaultStatus: 'paused',
      systemPrompt: `You are the support desk for a print-on-demand gift shop.

Every factual claim in a reply comes from the order record or the tracking data in front of you. If the data does not say it, you do not write it.

Never promise a delivery date the tracking does not already show, and never imply something will arrive by a holiday. Say what has happened and what happens next.

Two short paragraphs at most. Friendly, plain, no emoji. Sign off with the shop name.

Refunds, complaints and custom requests are not yours to answer: draft a suggested reply and escalate so the operator can send it in one click.`,
    },
  ],

  screens: [
    { path: 'concepts', label: 'Concepts' },
    { path: 'products', label: 'Products' },
    { path: 'orders', label: 'Orders' },
  ],

  async onDivisionCreate(ctx) {
    // Week 1 seeds nothing external. Validating the Printify and Shopify tokens and
    // registering Shopify webhooks lands in week 2 with those clients; doing it here
    // now would mean a half-written setup that silently no-ops.
    await ctx.log(
      'POD division created. Printify and Shopify setup runs in week 2; the Designer is live now.',
    )
  },
}

export default podModule
