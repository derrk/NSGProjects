CREATE TYPE "public"."pod_fulfillment_kind" AS ENUM('pod', 'dropship', 'in_house');--> statement-breakpoint
CREATE TYPE "public"."pod_sales_channel" AS ENUM('etsy', 'shopify');--> statement-breakpoint
CREATE TYPE "public"."pod_supplier_order_status" AS ENUM('ready_to_route', 'submitted', 'in_production', 'shipped', 'delivered', 'exception', 'cancelled');--> statement-breakpoint
CREATE TABLE "pod"."channel_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"channel" "pod_sales_channel" NOT NULL,
	"fulfillment" "pod_fulfillment_kind" NOT NULL,
	"supplier_id" uuid,
	"external_listing_id" text,
	"external_url" text,
	"original_design" boolean DEFAULT false NOT NULL,
	"personalized" boolean DEFAULT false NOT NULL,
	"ai_assisted" boolean DEFAULT false NOT NULL,
	"provenance_note" text,
	"production_partner" text,
	"ships_from" text,
	"status" "pod_product_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"division_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pod"."order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"channel" "pod_sales_channel" NOT NULL,
	"channel_order_id" text NOT NULL,
	"channel_line_item_id" text NOT NULL,
	"product_id" uuid,
	"sku" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"personalization" jsonb,
	"personalized" boolean DEFAULT false NOT NULL,
	"personalization_reviewed_at" timestamp with time zone,
	"personalization_reviewed_by" text,
	"division_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pod"."supplier_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_line_id" uuid NOT NULL,
	"supplier_id" uuid,
	"external_id" text,
	"status" "pod_supplier_order_status" DEFAULT 'ready_to_route' NOT NULL,
	"cost_cents" integer,
	"exception_reason" text,
	"submitted_at" timestamp with time zone,
	"tracking_number" text,
	"tracking_url" text,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"division_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pod"."suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "pod_fulfillment_kind" NOT NULL,
	"disclosure_name" text,
	"ships_from" text,
	"ship_days_min" integer,
	"ship_days_max" integer,
	"returns_policy" text,
	"data_confirmed_at" timestamp with time zone,
	"approved" boolean DEFAULT false NOT NULL,
	"notes" text,
	"division_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pod"."channel_listings" ADD CONSTRAINT "channel_listings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "pod"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pod"."channel_listings" ADD CONSTRAINT "channel_listings_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "pod"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pod"."order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "pod"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pod"."order_lines" ADD CONSTRAINT "order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "pod"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pod"."supplier_orders" ADD CONSTRAINT "supplier_orders_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "pod"."order_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pod"."supplier_orders" ADD CONSTRAINT "supplier_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "pod"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pod_channel_listings_product_channel_idx" ON "pod"."channel_listings" USING btree ("product_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "pod_channel_listings_external_idx" ON "pod"."channel_listings" USING btree ("channel","external_listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pod_order_lines_channel_ref_idx" ON "pod"."order_lines" USING btree ("channel","channel_order_id","channel_line_item_id");--> statement-breakpoint
CREATE INDEX "pod_order_lines_order_idx" ON "pod"."order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pod_supplier_orders_line_idx" ON "pod"."supplier_orders" USING btree ("order_line_id");--> statement-breakpoint
CREATE INDEX "pod_supplier_orders_status_idx" ON "pod"."supplier_orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "pod_suppliers_name_idx" ON "pod"."suppliers" USING btree ("division_id","name");