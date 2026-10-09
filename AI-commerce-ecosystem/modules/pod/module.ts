/**
 * Division one: the print-on-demand store (SPEC.md §Module 1).
 *
 * Everything the core needs to know about this division is declared here. The floor
 * renders its stations, the inbox renders its approval kinds, the registry seeds its
 * agents, and the scheduler reads their schedules — none of which required a line of
 * core code to know what a mug is.
 *
 * The Designer and Store ops have runners and are seeded active. The Trend scout,
 * Support deck, Supply scout and Counting house are declared so their stations
 * appear on the floor, but are seeded PAUSED: the scheduler must not queue work
 * that nothing can run yet. Each of those four already has its decision logic
 * built and tested in its own directory — grounding.ts, score.ts, report.ts — so
 * what is missing is the model wiring, not the judgement.
 */

import type { ModuleDefinition } from '@acf/core/modules'

import { designerAgentSpec } from './agents/designer/index'
import { financeAgentSpec } from './agents/finance/index'
import { storeOpsAgentSpec } from './agents/store-ops/index'
import { supplierScoutAgentSpec } from './agents/supplier-scout/index'
import { supportAgentSpec } from './agents/support/index'

export { createDesignerAgent, designerAgentSpec } from './agents/designer/index'
export { createStoreOpsAgent, storeOpsAgentSpec } from './agents/store-ops/index'
export * from './agents/finance/index'
export * from './agents/supplier-scout/index'
export * from './agents/support/index'
export * from './pricing'
export * from './channel-rules'
export * from './economics'
export * from './fulfillment'
export * from './publish'
export * from './integrations'
export * from './walkthrough'
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
    { key: 'supply_depot', label: 'Supply depot', agentKey: 'supplier_scout', counter: 'pod.suppliers_reviewed' },
    { key: 'counting_house', label: 'Counting house', agentKey: 'finance', counter: 'pod.reports_filed' },
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
    {
      kind: 'personalization_proof',
      label: 'Personalised proof',
      // Buyer-supplied text or images going to a printer unreviewed is unrecoverable
      // once it is on a mug, so this never graduates to automatic.
      neverAuto: true,
    },
    {
      kind: 'supplier',
      label: 'Supplier',
      // Choosing who makes and ships your goods is not a decision an agent earns.
      neverAuto: true,
    },
    {
      kind: 'sample_order',
      label: 'Paid sample',
      // Spends real money with an outside party.
      neverAuto: true,
    },
  ],

  agents: [
    designerAgentSpec,
    storeOpsAgentSpec,

    {
      key: 'scout',
      defaultName: 'Trend scout',
      purpose:
        'Find seasonal gift niches worth selling into, and write what is actually selling inside them as evidence.',
      description: 'Researches niches and proposes concepts. Week 4.',
      defaultModel: 'claude-sonnet-5-5',
      defaultSchedule: 'TZ=America/Chicago 0 6 * * *',
      defaultTools: ['web_search', 'fetch_page', 'opportunities.create', 'memory.recall'],
      defaultStatus: 'paused',
      systemPrompt: `You are the Trend scout for a print-on-demand gift shop.

You gather EVIDENCE, not opinions. For each niche you report what is already selling, where you saw it, what it costs, and what signal suggests demand. Another agent decides what to do about it; your job is to be right about the facts and honest about the gaps.

Score each niche on demand signal, competition, giftability and IP safety, and say which of those you are least sure about.

Reject outright any concept referencing a brand, character, sports team, celebrity, song lyric or movie quote, and never describe a design as being in the style of a living artist.`,
    },

    supportAgentSpec,
    supplierScoutAgentSpec,
    financeAgentSpec,
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
