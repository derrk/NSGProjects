-- Posters and dropshipped goods are not apparel, and an order held for
-- personalisation review has not gone wrong.
ALTER TYPE "pod_product_type" ADD VALUE IF NOT EXISTS 'poster';--> statement-breakpoint
ALTER TYPE "pod_product_type" ADD VALUE IF NOT EXISTS 'other';--> statement-breakpoint
ALTER TYPE "pod_order_status" ADD VALUE IF NOT EXISTS 'needs_review' AFTER 'received';
