-- Two facts the ingester was handed and threw away.
--
-- `IncomingOrder` has carried `paid` and `hasValidAddress` since it was written.
-- `ingestOrder` accepts both and stores neither. `routeOrder` then takes them as a
-- separate `context` argument that its caller has to supply from somewhere — which
-- was fine while the only caller was a test holding the payload in a variable, and
-- is impossible from a queue worker picking up an order id an hour later.
--
-- These are the two gates that decide whether this system spends money on a line:
-- `mayRouteOrder` refuses an unpaid order and refuses one with no address. Leaving
-- them underivable meant a fulfilment runner either had to invent them or hold
-- every order forever, and inventing them is how an unpaid order reaches a printer.
--
-- Defaulting to FALSE on the backfill, deliberately. An existing row's payment
-- status is not recorded anywhere, so it is not known — and the safe direction for
-- a value that gates spending is the one that holds the line and asks somebody.

ALTER TABLE "pod"."orders" ADD COLUMN "paid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pod"."orders" ADD COLUMN "has_valid_address" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- The demo rows that have already shipped or are in production evidently were paid
-- and evidently had somewhere to go. Nothing else is assumed.
UPDATE "pod"."orders"
SET "paid" = true, "has_valid_address" = true
WHERE "status" IN ('in_production', 'shipped', 'delivered');
