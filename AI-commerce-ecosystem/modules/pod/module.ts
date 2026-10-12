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

import { conceptBenchAgentSpec } from './agents/concept-bench/index'
import { designerAgentSpec } from './agents/designer/index'
import { POD_COUNTER_NAMES } from './counters'
import { financeAgentSpec } from './agents/finance/index'
import { scoutAgentSpec } from './agents/scout/index'
import { publisherAgentSpec } from './agents/publisher/index'
import { storeOpsAgentSpec } from './agents/store-ops/index'
import { supplierScoutAgentSpec } from './agents/supplier-scout/index'
import { supportAgentSpec } from './agents/support/index'

export { createDesignerAgent, designerAgentSpec } from './agents/designer/index'
export { createStoreOpsAgent, storeOpsAgentSpec } from './agents/store-ops/index'
export * from './agents/concept-bench/index'
export * from './agents/finance/index'
export * from './agents/publisher/index'
export * from './agents/scout/index'
export * from './agents/supplier-scout/index'
export * from './agents/support/index'
export * from './pricing'
export * from './channel-rules'
export * from './economics'
export * from './fulfillment'
export * from './publish'
export * from './counters'
export * from './ip-risk'
export * from './reference-data'
export * from './integrations'
export * from './walkthrough'
export * as podSchema from './schema/index'

export const podModule: ModuleDefinition = {
  name: 'pod',
  version: '0.1.0',
  description: 'Print-on-demand store: concepts to designs to live listings.',

  stations: [
    {
      key: 'scout',
      label: 'Trend scout',
      agentKey: 'scout',
      // Niches, not concepts. This station counted concepts, which the scout does
      // not produce — so a scout that found nothing all day read as busy on the
      // strength of work the bench downstream had done.
      counter: 'pod.niches_today',
      counterLabel: 'niches today',
    },
    {
      key: 'concept_bench',
      label: 'Concept bench',
      agentKey: 'concept_bench',
      counter: 'pod.concepts_today',
      counterLabel: 'concepts today',
    },
    {
      key: 'design_bay',
      label: 'Design bay',
      agentKey: 'designer',
      counter: 'pod.designs_today',
      counterLabel: 'designs today',
    },
    {
      key: 'listing_dock',
      label: 'Listing dock',
      agentKey: 'store_ops',
      // Drafted, not published. This station counted PUBLISHED listings, which it
      // does not produce — it drafts them and the Loading bay pushes them live, so
      // a dock that drafted ten today read as zero until somebody approved them.
      counter: 'pod.products_drafted_today',
      counterLabel: 'listings drafted',
    },
    {
      key: 'loading_bay',
      label: 'Loading bay',
      agentKey: 'publisher',
      counter: 'pod.published_today',
      counterLabel: 'published today',
    },
    {
      key: 'support_deck',
      label: 'Support deck',
      agentKey: 'support',
      counter: 'pod.replies_today',
      // Drafted, never sent: this system has no send path. "replies today" on a
      // support station would otherwise read as messages that reached a customer.
      counterLabel: 'drafted today — none sent',
    },
    {
      key: 'supply_depot',
      label: 'Supply depot',
      agentKey: 'supplier_scout',
      counter: 'pod.suppliers_reviewed',
      counterLabel: 'suppliers on file',
      // The scout runs weekly, so a daily count would read zero six days in seven.
      counterIsRunningTotal: true,
    },
    {
      key: 'counting_house',
      label: 'Counting house',
      agentKey: 'finance',
      counter: 'pod.reports_filed',
      counterLabel: 'reports filed',
    },
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
    {
      kind: 'niche',
      label: 'Niche',
      cardComponent: 'pod/NicheCard',
      /*
       * This one CAN graduate, and it is the only research output in the module that
       * should. Approving a niche commits to nothing outside the system — no listing,
       * no spend, no message to anybody. It writes a row that the Designer then has
       * to clear a second gate to act on.
       *
       * The threshold is high for a reason that is not caution: the scores on a niche
       * card are a model's read of some pages, and the operator's early decisions are
       * what calibrate whether that read is worth anything. Graduating at twenty
       * would mean graduating before anyone could know.
       */
      thresholdCount: 40,
    },
    {
      kind: 'reply',
      label: 'Customer reply',
      cardComponent: 'pod/ReplyCard',
      /*
       * Never auto, while there is no send path.
       *
       * Graduating this category is worse than not graduating it. Approving a reply
       * today means a human read it and will send it themselves — `send_email` files a
       * draft and stops. Auto-approving means nobody reads it AND nobody sends it, so
       * the customer's message is silently never answered: a strictly worse outcome
       * than leaving the card in the inbox.
       *
       * It also removes the premise the support runner's prompt-injection handling
       * rested on. That runner logs a detected injection rather than escalating,
       * reasoning that escalating would hand anyone who can email the shop a switch
       * for turning the agent off — sound, but it assumed every reply is read by a
       * human. Here that becomes true rather than assumed.
       *
       * Take this off when a send path exists, not before.
       */
      neverAuto: true,
    },
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
    conceptBenchAgentSpec,
    designerAgentSpec,
    publisherAgentSpec,
    storeOpsAgentSpec,
    scoutAgentSpec,
    supportAgentSpec,
    supplierScoutAgentSpec,
    financeAgentSpec,
  ],

  // Declared here, resolved at the composition root — the same split agents use, and
  // for the same reason: this file must be readable at boot without a database.
  counterNames: POD_COUNTER_NAMES,

  /*
   * Settings, not secrets. Every token this module needs comes from an environment
   * variable; nothing here is sensitive, and nothing here should become sensitive —
   * division config is plain jsonb that is read back to the browser and included in
   * the archive export.
   */
  configFields: [
    {
      key: 'printifyShopId',
      label: 'Printify shop id',
      kind: 'text',
      placeholder: '12345678',
      help:
        'The numeric id of the shop in your Printify account, from the URL when you open ' +
        'it. Not the shop name, and not an API token — the token is PRINTIFY_API_TOKEN in ' +
        'the environment.',
      requiredFor:
        'The Loading bay cannot publish anything: there is nowhere to publish it to, and ' +
        'the Listing dock stops before it drafts.',
    },
    {
      key: 'productTypes',
      label: 'What this division prints on',
      kind: 'list',
      placeholder: 'mug_11oz, tee, hoodie',
      help:
        'Comma separated. The Concept bench will only propose designs for these, and the ' +
        'Listing dock only prices these. Leaving it empty falls back to the module default.',
    },
  ],

  screens: [
    { path: 'concepts', label: 'Concepts' },
    { path: 'products', label: 'Products' },
    { path: 'orders', label: 'Orders' },
  ],

  async onDivisionCreate(ctx) {
    // Reference data is NOT seeded here; see `seedReferenceData`, attached at the
    // composition root, which runs on every reconcile rather than once.
    // Week 1 seeds nothing external. Validating the Printify and Shopify tokens and
    // registering Shopify webhooks lands in week 2 with those clients; doing it here
    // now would mean a half-written setup that silently no-ops.
    await ctx.log(
      'POD division created. Printify and Shopify setup runs in week 2; the Designer is live now.',
    )
  },
}

export default podModule
