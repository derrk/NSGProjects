import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { messageChannel, messageIntent, messageStatus, orderStatus, replyStatus } from './enums.js'
import { auditColumns, shops } from './shops.js'

/** Synced hourly from Shopify and Printify. An `issue` lights the station red. */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    shopifyOrderId: text('shopify_order_id'),
    printifyOrderId: text('printify_order_id'),
    orderNumber: text('order_number'),
    customerEmail: text('customer_email'),
    /** Exact integer cents: this is real money. */
    totalCents: integer('total_cents').notNull().default(0),
    costCents: integer('cost_cents').notNull().default(0),
    status: orderStatus('status').notNull().default('received'),
    trackingUrl: text('tracking_url'),
    trackingNumber: text('tracking_number'),
    /** Raw Printify status string, so an unexpected value is never silently lost. */
    printifyStatus: text('printify_status'),
    issueNotes: text('issue_notes'),
    placedAt: timestamp('placed_at', { withTimezone: true }),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    ...auditColumns,
  },
  (t) => [
    index('orders_shop_status_idx').on(t.shopId, t.status),
    uniqueIndex('orders_shopify_idx').on(t.shopifyOrderId),
    index('orders_email_idx').on(t.customerEmail),
  ],
)

/** Inbound customer mail and chat. Intent is set by the Support agent. */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    channel: messageChannel('channel').notNull(),
    /** Gmail message id or Shopify Inbox conversation id. */
    externalId: text('external_id').notNull(),
    threadId: text('thread_id'),
    fromEmail: text('from_email'),
    subject: text('subject'),
    body: text('body').notNull(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    intent: messageIntent('intent'),
    status: messageStatus('status').notNull().default('new'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex('messages_channel_external_idx').on(t.channel, t.externalId),
    index('messages_status_idx').on(t.status),
    index('messages_order_idx').on(t.orderId),
  ],
)

/** A drafted or sent reply. Approval gate #3. */
export const replies = pgTable(
  'replies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    /** True when the approval gate cleared this without the operator reading it. */
    autoSent: boolean('auto_sent').notNull().default(false),
    status: replyStatus('status').notNull().default('pending_approval'),
    /** Order data the draft cited, kept so a wrong promise can be traced back. */
    citedData: jsonb('cited_data').notNull().default({}),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    ...auditColumns,
  },
  (t) => [index('replies_message_idx').on(t.messageId), index('replies_status_idx').on(t.status)],
)
