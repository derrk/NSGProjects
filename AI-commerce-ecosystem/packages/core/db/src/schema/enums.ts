import { pgEnum } from 'drizzle-orm/pg-core'

/* ------------------------------------------------------------------ *
 * Shops
 * ------------------------------------------------------------------ */

/** A shop is proposed by the Strategist, built by the operator, then goes live. */
export const shopStatus = pgEnum('shop_status', [
  'proposed',
  'building',
  'live',
  'paused',
  'retired',
])

export const shopPlatform = pgEnum('shop_platform', ['shopify', 'etsy'])

/**
 * How a shop's products get made and shipped.
 *
 * `pod` is the launch model and the one the economics in SPEC.md assume: the design
 * is the product, so it differentiates without advertising. `dropship` is modelled so
 * the Strategist can propose and score it, not because it is the recommended path —
 * commodity dropshipping is ad-dependent, which breaks the ad-free margin premise.
 */
export const fulfillmentModel = pgEnum('fulfillment_model', ['pod', 'dropship', 'hybrid'])

/* ------------------------------------------------------------------ *
 * Research and catalog
 * ------------------------------------------------------------------ */

export const nicheStatus = pgEnum('niche_status', [
  'proposed',
  'approved',
  'rejected',
  'exhausted',
])

export const ipRisk = pgEnum('ip_risk', ['low', 'medium', 'high'])

export const conceptStatus = pgEnum('concept_status', [
  'proposed',
  'approved',
  'rejected',
  'designed',
  /** Text rendering failed three times; a human has to intervene. */
  'needs_human',
])

export const designStyle = pgEnum('design_style', [
  'flat-vector',
  'hand-lettered',
  'retro-badge',
  'line-art',
  'watercolor',
])

export const designStatus = pgEnum('design_status', [
  'generated',
  'pending_approval',
  'approved',
  'rejected',
])

export const productStatus = pgEnum('product_status', [
  'draft',
  'pending_approval',
  'published',
  'paused',
  'retired',
  'rejected',
])

export const productType = pgEnum('product_type', [
  'mug_11oz',
  'mug_15oz',
  'tee',
  'sweatshirt',
  'hoodie',
])

/* ------------------------------------------------------------------ *
 * Commerce
 * ------------------------------------------------------------------ */

export const orderStatus = pgEnum('order_status', [
  'received',
  'in_production',
  'shipped',
  'delivered',
  'issue',
  'refunded',
])

export const messageChannel = pgEnum('message_channel', ['gmail', 'shopify_inbox'])

export const messageIntent = pgEnum('message_intent', [
  'shipping_eta',
  'sizing',
  'tracking',
  'refund',
  'complaint',
  'custom',
  'other',
])

export const messageStatus = pgEnum('message_status', [
  'new',
  'drafted',
  'sent',
  'escalated',
  'closed',
])

export const replyStatus = pgEnum('reply_status', ['pending_approval', 'sent', 'rejected'])

/* ------------------------------------------------------------------ *
 * Orchestration
 * ------------------------------------------------------------------ */

/** Must stay in step with `ApprovalKind` in @acf/core. */
export const approvalKind = pgEnum('approval_kind', [
  'concept',
  'design',
  'product',
  'reply',
  'price_change',
  'shop_proposal',
])

export const approvalDecision = pgEnum('approval_decision', [
  'pending',
  'approved',
  'rejected',
  'edited',
])

export const agentTrigger = pgEnum('agent_trigger', ['cron', 'event', 'manual'])

export const runStatus = pgEnum('run_status', ['running', 'ok', 'error'])

export const eventLevel = pgEnum('event_level', ['info', 'warn', 'error'])
