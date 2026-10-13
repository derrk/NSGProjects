-- An order belonged to whoever ingested it first.
--
-- `orders` had one text column, `shopify_order_id`, holding the order id from
-- WHICHEVER channel the order came from, under a unique index on that column alone.
-- Two reproducible failures came out of that, both demonstrated as tests against
-- this schema before it was changed:
--
--   Two divisions ingesting the same channel order id: the second division gets NO
--   order row at all, and `ingestOrder`'s lost-race re-read — which filters on the
--   order id and not the division — hands it the FIRST division's order. Its lines
--   are then written against another business's order. One shop's customer sitting
--   in another shop's books is not a tidy duplicate.
--
--   An Etsy order and a Shopify order sharing an id string: one row. Platforms do
--   not coordinate their id spaces and there is no reason they would. The existing
--   two-channel test passed because it used different ids on each side, so it never
--   asked the question.
--
-- So: the channel becomes a column rather than something only the LINES know, the
-- column is renamed to say what it actually holds, and the index becomes
-- (division, channel, order id) — matching `suppliers` and `pricing_rules`, which
-- were per-division from the start.
--
-- `order_lines` gets the division in its index for the same reason. Its index was
-- already channel-scoped, which is why the line-level collision never bit.

ALTER TABLE "pod"."orders" ADD COLUMN "channel" "pod_sales_channel";--> statement-breakpoint

-- Backfill from the lines, which have always carried the channel correctly. An order
-- with no lines cannot be derived and stays NULL rather than being guessed at:
-- recording "shopify" for an order nobody can place is a worse answer than nothing,
-- and NULL is allowed to coexist with the unique index below.
UPDATE "pod"."orders" o
SET "channel" = l."channel"
FROM (
  SELECT DISTINCT ON ("order_id") "order_id", "channel"
  FROM "pod"."order_lines"
  ORDER BY "order_id", "created_at"
) l
WHERE l."order_id" = o."id" AND o."channel" IS NULL;--> statement-breakpoint

ALTER TABLE "pod"."orders" RENAME COLUMN "shopify_order_id" TO "channel_order_id";--> statement-breakpoint

DROP INDEX IF EXISTS "pod"."pod_orders_shopify_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "pod_orders_channel_ref_idx" ON "pod"."orders" USING btree ("division_id","channel","channel_order_id");--> statement-breakpoint

DROP INDEX IF EXISTS "pod"."pod_order_lines_channel_ref_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "pod_order_lines_channel_ref_idx" ON "pod"."order_lines" USING btree ("division_id","channel","channel_order_id","channel_line_item_id");
