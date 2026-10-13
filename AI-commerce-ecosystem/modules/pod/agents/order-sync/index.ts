import type { ModuleAgentSpec } from '@acf/core/modules'

export * from './run'

export const orderSyncAgentSpec: ModuleAgentSpec = {
  key: 'order_sync',
  defaultName: 'Receiving',
  purpose:
    'Ask each sales channel what it has seen, so an order is not lost because a webhook was not delivered.',
  description:
    'Polls listOrders on a clock and ingests anything new. Drops simulated orders rather than writing demo money into the ledger. Makes no model call.',
  /*
   * No model. Nothing here is a judgement: it fetches, it drops what is marked
   * simulated, and it records the rest through the same idempotent ingest the
   * webhook uses.
   */
  defaultModel: 'claude-haiku-5-5',
  /*
   * Hourly, which is what the spec asks for alongside the webhook.
   *
   * The webhook is the fast path and this is the one that holds when the fast path
   * does not: a deploy restarting the process, a bad release returning 500 for ten
   * minutes, Shopify giving up after its retries. It is also the only path Etsy
   * has.
   *
   * On the hour rather than on a tighter interval because over-fetching is free —
   * ingestion is idempotent — and the cost of being an hour late on an order that
   * a webhook already delivered is nothing.
   */
  defaultSchedule: 'TZ=America/Chicago 7 * * * *',
  defaultTools: [],
  systemPrompt:
    'You fetch orders from a sales channel and record the ones this system has not seen. ' +
    'An order marked simulated is demo data and is never recorded: writing one would put ' +
    'money nobody paid into the same tables a real sale uses.',
}
