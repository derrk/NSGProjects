CREATE SCHEMA "pod";
--> statement-breakpoint
CREATE TYPE "public"."pod_concept_status" AS ENUM('proposed', 'approved', 'rejected', 'designed', 'needs_human');--> statement-breakpoint
CREATE TYPE "public"."pod_design_status" AS ENUM('generated', 'pending_approval', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."pod_design_style" AS ENUM('flat-vector', 'hand-lettered', 'retro-badge', 'line-art', 'watercolor');--> statement-breakpoint
CREATE TYPE "public"."pod_ip_risk" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."pod_message_channel" AS ENUM('gmail', 'shopify_inbox');--> statement-breakpoint
CREATE TYPE "public"."pod_message_intent" AS ENUM('shipping_eta', 'sizing', 'tracking', 'refund', 'complaint', 'custom', 'other');--> statement-breakpoint
CREATE TYPE "public"."pod_message_status" AS ENUM('new', 'drafted', 'sent', 'escalated', 'closed');--> statement-breakpoint
CREATE TYPE "public"."pod_niche_status" AS ENUM('proposed', 'approved', 'rejected', 'exhausted');--> statement-breakpoint
CREATE TYPE "public"."pod_order_status" AS ENUM('received', 'in_production', 'shipped', 'delivered', 'issue', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."pod_product_status" AS ENUM('draft', 'pending_approval', 'published', 'paused', 'retired', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."pod_product_type" AS ENUM('mug_11oz', 'mug_15oz', 'tee', 'sweatshirt', 'hoodie');--> statement-breakpoint
CREATE TYPE "public"."pod_reply_status" AS ENUM('pending_approval', 'sent', 'rejected');--> statement-breakpoint
CREATE TABLE "pod"."blocked_phrases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phrase" text NOT NULL,
	"reason" text,
	"division_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pod"."concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"niche_id" uuid,
	"task_id" uuid,
	"title" text NOT NULL,
	"prompt_brief" text NOT NULL,
	"style" "pod_design_style" NOT NULL,
	"products" text[] DEFAULT '{}'::text[] NOT NULL,
	"audience" text,
	"why_now" text,
	"ip_risk" "pod_ip_risk" DEFAULT 'low' NOT NULL,
	"ip_notes" text,
	"status" "pod_concept_status" DEFAULT 'proposed' NOT NULL,
	"division_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pod"."designs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"concept_id" uuid NOT NULL,
	"task_id" uuid,
	"variant_no" integer NOT NULL,
	"image_url" text NOT NULL,
	"thumbnail_url" text,
	"print_url" text,
	"source_model" text NOT NULL,
	"gen_prompt" text NOT NULL,
	"seed" text,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"dpi" integer DEFAULT 72 NOT NULL,
	"text_check_passed" text,
	"status" "pod_design_status" DEFAULT 'generated' NOT NULL,
	"division_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pod"."messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "pod_message_channel" NOT NULL,
	"external_id" text NOT NULL,
	"thread_id" text,
	"from_email" text,
	"subject" text,
	"body" text NOT NULL,
	"order_id" uuid,
	"intent" "pod_message_intent",
	"status" "pod_message_status" DEFAULT 'new' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"division_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pod"."niches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"audience" text,
	"season" text,
	"score" integer DEFAULT 0 NOT NULL,
	"score_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rationale" text,
	"status" "pod_niche_status" DEFAULT 'proposed' NOT NULL,
	"source_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"opportunity_id" uuid,
	"division_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pod"."orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_entity_id" uuid,
	"shopify_order_id" text,
	"printify_order_id" text,
	"order_number" text,
	"customer_email" text,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"status" "pod_order_status" DEFAULT 'received' NOT NULL,
	"tracking_url" text,
	"tracking_number" text,
	"printify_status" text,
	"issue_notes" text,
	"placed_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"division_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pod"."pricing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_type" text NOT NULL,
	"markup_multiple" real DEFAULT 2.2 NOT NULL,
	"round_to_cents" integer DEFAULT 99 NOT NULL,
	"min_price_cents" integer,
	"max_price_cents" integer,
	"blueprint_id" integer,
	"print_provider_id" integer,
	"division_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pod"."products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"design_id" uuid,
	"entity_id" uuid,
	"type" "pod_product_type" NOT NULL,
	"printify_product_id" text,
	"shopify_product_id" text,
	"etsy_listing_id" text,
	"blueprint_id" integer,
	"print_provider_id" integer,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"price_cents" integer NOT NULL,
	"cost_cents" integer NOT NULL,
	"mockup_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "pod_product_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"division_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pod"."replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"body" text NOT NULL,
	"auto_sent" boolean DEFAULT false NOT NULL,
	"status" "pod_reply_status" DEFAULT 'pending_approval' NOT NULL,
	"cited_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sent_at" timestamp with time zone,
	"division_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pod"."concepts" ADD CONSTRAINT "concepts_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "pod"."niches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pod"."designs" ADD CONSTRAINT "designs_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "pod"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pod"."messages" ADD CONSTRAINT "messages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "pod"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pod"."products" ADD CONSTRAINT "products_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "pod"."designs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pod"."replies" ADD CONSTRAINT "replies_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "pod"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pod_blocked_phrases_idx" ON "pod"."blocked_phrases" USING btree ("phrase");--> statement-breakpoint
CREATE INDEX "pod_concepts_status_idx" ON "pod"."concepts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pod_concepts_division_idx" ON "pod"."concepts" USING btree ("division_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pod_designs_concept_variant_idx" ON "pod"."designs" USING btree ("concept_id","variant_no");--> statement-breakpoint
CREATE INDEX "pod_designs_status_idx" ON "pod"."designs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "pod_messages_channel_external_idx" ON "pod"."messages" USING btree ("channel","external_id");--> statement-breakpoint
CREATE INDEX "pod_messages_status_idx" ON "pod"."messages" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "pod_niches_name_idx" ON "pod"."niches" USING btree ("name");--> statement-breakpoint
CREATE INDEX "pod_niches_status_idx" ON "pod"."niches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pod_orders_division_status_idx" ON "pod"."orders" USING btree ("division_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "pod_orders_shopify_idx" ON "pod"."orders" USING btree ("shopify_order_id");--> statement-breakpoint
CREATE INDEX "pod_orders_email_idx" ON "pod"."orders" USING btree ("customer_email");--> statement-breakpoint
CREATE UNIQUE INDEX "pod_pricing_rules_idx" ON "pod"."pricing_rules" USING btree ("division_id","product_type");--> statement-breakpoint
CREATE INDEX "pod_products_division_status_idx" ON "pod"."products" USING btree ("division_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "pod_products_printify_idx" ON "pod"."products" USING btree ("printify_product_id");--> statement-breakpoint
CREATE INDEX "pod_replies_message_idx" ON "pod"."replies" USING btree ("message_id");