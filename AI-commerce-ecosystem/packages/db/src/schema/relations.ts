/**
 * Relational metadata for `db.query.*`.
 *
 * This is the drizzle-orm 0.45.x `relations()` API. Do NOT reach for `defineRelations`
 * from the v1 release candidate — that export does not exist on the stable line, and
 * mixing the two tracks breaks the migration folder format.
 */

import { relations } from 'drizzle-orm'

import { concepts, designs, nicheProducts, niches, products } from './catalog.js'
import { messages, orders, replies } from './commerce.js'
import { agentRuns, approvals, dailyMetrics, events, pricingRules } from './ops.js'
import { shopProposals, shops, suppliers } from './shops.js'

export const shopsRelations = relations(shops, ({ many }) => ({
  niches: many(niches),
  concepts: many(concepts),
  products: many(products),
  orders: many(orders),
  messages: many(messages),
  approvals: many(approvals),
  agentRuns: many(agentRuns),
  events: many(events),
  dailyMetrics: many(dailyMetrics),
  pricingRules: many(pricingRules),
  proposals: many(shopProposals),
}))

export const shopProposalsRelations = relations(shopProposals, ({ one }) => ({
  shop: one(shops, { fields: [shopProposals.shopId], references: [shops.id] }),
  niche: one(niches, { fields: [shopProposals.nicheId], references: [niches.id] }),
}))

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  products: many(products),
}))

export const nichesRelations = relations(niches, ({ one, many }) => ({
  shop: one(shops, { fields: [niches.shopId], references: [shops.id] }),
  concepts: many(concepts),
  observedProducts: many(nicheProducts),
  proposals: many(shopProposals),
}))

export const nicheProductsRelations = relations(nicheProducts, ({ one }) => ({
  niche: one(niches, { fields: [nicheProducts.nicheId], references: [niches.id] }),
}))

export const conceptsRelations = relations(concepts, ({ one, many }) => ({
  shop: one(shops, { fields: [concepts.shopId], references: [shops.id] }),
  niche: one(niches, { fields: [concepts.nicheId], references: [niches.id] }),
  designs: many(designs),
}))

export const designsRelations = relations(designs, ({ one, many }) => ({
  concept: one(concepts, { fields: [designs.conceptId], references: [concepts.id] }),
  products: many(products),
}))

export const productsRelations = relations(products, ({ one }) => ({
  shop: one(shops, { fields: [products.shopId], references: [shops.id] }),
  design: one(designs, { fields: [products.designId], references: [designs.id] }),
  supplier: one(suppliers, { fields: [products.supplierId], references: [suppliers.id] }),
}))

export const ordersRelations = relations(orders, ({ one, many }) => ({
  shop: one(shops, { fields: [orders.shopId], references: [shops.id] }),
  messages: many(messages),
}))

export const messagesRelations = relations(messages, ({ one, many }) => ({
  shop: one(shops, { fields: [messages.shopId], references: [shops.id] }),
  order: one(orders, { fields: [messages.orderId], references: [orders.id] }),
  replies: many(replies),
}))

export const repliesRelations = relations(replies, ({ one }) => ({
  message: one(messages, { fields: [replies.messageId], references: [messages.id] }),
}))

export const approvalsRelations = relations(approvals, ({ one }) => ({
  shop: one(shops, { fields: [approvals.shopId], references: [shops.id] }),
}))

export const agentRunsRelations = relations(agentRuns, ({ one }) => ({
  shop: one(shops, { fields: [agentRuns.shopId], references: [shops.id] }),
}))
