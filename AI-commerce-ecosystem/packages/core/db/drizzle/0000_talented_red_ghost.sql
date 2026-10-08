CREATE TYPE "public"."agent_trigger" AS ENUM('cron', 'event', 'manual');--> statement-breakpoint
CREATE TYPE "public"."approval_decision" AS ENUM('pending', 'approved', 'rejected', 'edited');--> statement-breakpoint
CREATE TYPE "public"."approval_kind" AS ENUM('concept', 'design', 'product', 'reply', 'price_change', 'shop_proposal');--> statement-breakpoint
CREATE TYPE "public"."concept_status" AS ENUM('proposed', 'approved', 'rejected', 'designed', 'needs_human');--> statement-breakpoint
CREATE TYPE "public"."design_status" AS ENUM('generated', 'pending_approval', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."design_style" AS ENUM('flat-vector', 'hand-lettered', 'retro-badge', 'line-art', 'watercolor');--> statement-breakpoint
CREATE TYPE "public"."event_level" AS ENUM('info', 'warn', 'error');--> statement-breakpoint
CREATE TYPE "public"."fulfillment_model" AS ENUM('pod', 'dropship', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."ip_risk" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('gmail', 'shopify_inbox');--> statement-breakpoint
CREATE TYPE "public"."message_intent" AS ENUM('shipping_eta', 'sizing', 'tracking', 'refund', 'complaint', 'custom', 'other');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('new', 'drafted', 'sent', 'escalated', 'closed');--> statement-breakpoint
CREATE TYPE "public"."niche_status" AS ENUM('proposed', 'approved', 'rejected', 'exhausted');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('received', 'in_production', 'shipped', 'delivered', 'issue', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'pending_approval', 'published', 'paused', 'retired', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."product_type" AS ENUM('mug_11oz', 'mug_15oz', 'tee', 'sweatshirt', 'hoodie');--> statement-breakpoint
CREATE TYPE "public"."reply_status" AS ENUM('pending_approval', 'sent', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'ok', 'error');--> statement-breakpoint
CREATE TYPE "public"."shop_platform" AS ENUM('shopify', 'etsy');--> statement-breakpoint
CREATE TYPE "public"."shop_status" AS ENUM('proposed', 'building', 'live', 'paused', 'retired');--> statement-breakpoint
CREATE TABLE "shop_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"niche_id" uuid,
	"name" text NOT NULL,
	"name_alternatives" text[] DEFAULT '{}'::text[] NOT NULL,
	"domain_candidates" text[] DEFAULT '{}'::text[] NOT NULL,
	"platform" "shop_platform" DEFAULT 'shopify' NOT NULL,
	"fulfillment" "fulfillment_model" DEFAULT 'pod' NOT NULL,
	"positioning" text NOT NULL,
	"audience" text NOT NULL,
	"product_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"rationale" text NOT NULL,
	"setup_cost_cents" integer,
	"monthly_fixed_cost_cents" integer,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"shop_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"platform" "shop_platform" DEFAULT 'shopify' NOT NULL,
	"status" "shop_status" DEFAULT 'proposed' NOT NULL,
	"fulfillment" "fulfillment_model" DEFAULT 'pod' NOT NULL,
	"domain" text,
	"positioning" text,
	"audience" text,
	"shopify_shop_domain" text,
	"printify_shop_id" text,
	"etsy_shop_id" text,
	"product_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"launched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"platform" text NOT NULL,
	"url" text,
	"country" text,
	"ship_days_min" integer,
	"ship_days_max" integer,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid,
	"niche_id" uuid,
	"title" text NOT NULL,
	"prompt_brief" text NOT NULL,
	"style" "design_style" NOT NULL,
	"products" text[] DEFAULT '{}'::text[] NOT NULL,
	"audience" text,
	"why_now" text,
	"ip_risk" "ip_risk" DEFAULT 'low' NOT NULL,
	"ip_notes" text,
	"status" "concept_status" DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "designs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"concept_id" uuid NOT NULL,
	"variant_no" integer NOT NULL,
	"image_url" text NOT NULL,
	"thumbnail_url" text,
	"source_model" text NOT NULL,
	"gen_prompt" text NOT NULL,
	"seed" text,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"dpi" integer DEFAULT 300 NOT NULL,
	"text_check_passed" text,
	"status" "design_status" DEFAULT 'generated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "niche_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"niche_id" uuid NOT NULL,
	"title" text NOT NULL,
	"marketplace" text,
	"url" text,
	"price_low_cents" integer,
	"price_high_cents" integer,
	"demand_signal" text,
	"demand_value" integer,
	"producible_with_pod" text,
	"notes" text,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "niches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid,
	"name" text NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"audience" text,
	"season" text,
	"score" integer DEFAULT 0 NOT NULL,
	"score_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rationale" text,
	"status" "niche_status" DEFAULT 'proposed' NOT NULL,
	"source_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"design_id" uuid,
	"supplier_id" uuid,
	"type" "product_type" NOT NULL,
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
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"channel" "message_channel" NOT NULL,
	"external_id" text NOT NULL,
	"thread_id" text,
	"from_email" text,
	"subject" text,
	"body" text NOT NULL,
	"order_id" uuid,
	"intent" "message_intent",
	"status" "message_status" DEFAULT 'new' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"shopify_order_id" text,
	"printify_order_id" text,
	"order_number" text,
	"customer_email" text,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"status" "order_status" DEFAULT 'received' NOT NULL,
	"tracking_url" text,
	"tracking_number" text,
	"printify_status" text,
	"issue_notes" text,
	"placed_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"body" text NOT NULL,
	"auto_sent" boolean DEFAULT false NOT NULL,
	"status" "reply_status" DEFAULT 'pending_approval' NOT NULL,
	"cited_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent" text NOT NULL,
	"shop_id" uuid,
	"trigger" "agent_trigger" NOT NULL,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"input" jsonb,
	"output" jsonb,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_cents" double precision DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "approval_kind" NOT NULL,
	"category" text NOT NULL,
	"approved_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"edited_count" integer DEFAULT 0 NOT NULL,
	"auto_enabled" boolean DEFAULT false NOT NULL,
	"threshold" integer DEFAULT 20 NOT NULL,
	"required_rate" real DEFAULT 0.95 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid,
	"kind" "approval_kind" NOT NULL,
	"category" text NOT NULL,
	"ref_id" text NOT NULL,
	"summary" text NOT NULL,
	"payload" jsonb NOT NULL,
	"decision" "approval_decision" DEFAULT 'pending' NOT NULL,
	"auto_decided" boolean DEFAULT false NOT NULL,
	"edit_payload" jsonb,
	"requested_by" text NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocked_phrases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phrase" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"date" date NOT NULL,
	"revenue_cents" integer DEFAULT 0 NOT NULL,
	"cogs_cents" integer DEFAULT 0 NOT NULL,
	"orders" integer DEFAULT 0 NOT NULL,
	"products_live" integer DEFAULT 0 NOT NULL,
	"designs_generated" integer DEFAULT 0 NOT NULL,
	"messages_handled" integer DEFAULT 0 NOT NULL,
	"api_cost_cents" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"agent" text NOT NULL,
	"kind" text NOT NULL,
	"level" "event_level" DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"ref_table" text,
	"ref_id" text,
	"shop_id" uuid
);
--> statement-breakpoint
CREATE TABLE "pricing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid,
	"product_type" text NOT NULL,
	"markup_multiple" real DEFAULT 2.2 NOT NULL,
	"round_to_cents" integer DEFAULT 99 NOT NULL,
	"min_price_cents" integer,
	"max_price_cents" integer,
	"blueprint_id" integer,
	"print_provider_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shop_proposals" ADD CONSTRAINT "shop_proposals_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "niche_products" ADD CONSTRAINT "niche_products_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "niches" ADD CONSTRAINT "niches_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replies" ADD CONSTRAINT "replies_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD CONSTRAINT "daily_metrics_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shop_proposals_status_idx" ON "shop_proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "shop_proposals_niche_idx" ON "shop_proposals" USING btree ("niche_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shops_slug_idx" ON "shops" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "shops_status_idx" ON "shops" USING btree ("status");--> statement-breakpoint
CREATE INDEX "suppliers_active_idx" ON "suppliers" USING btree ("active");--> statement-breakpoint
CREATE INDEX "concepts_status_idx" ON "concepts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "concepts_shop_idx" ON "concepts" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "concepts_niche_idx" ON "concepts" USING btree ("niche_id");--> statement-breakpoint
CREATE UNIQUE INDEX "designs_concept_variant_idx" ON "designs" USING btree ("concept_id","variant_no");--> statement-breakpoint
CREATE INDEX "designs_status_idx" ON "designs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "niche_products_niche_idx" ON "niche_products" USING btree ("niche_id");--> statement-breakpoint
CREATE INDEX "niches_status_idx" ON "niches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "niches_shop_idx" ON "niches" USING btree ("shop_id");--> statement-breakpoint
CREATE UNIQUE INDEX "niches_name_idx" ON "niches" USING btree ("name");--> statement-breakpoint
CREATE INDEX "products_shop_status_idx" ON "products" USING btree ("shop_id","status");--> statement-breakpoint
CREATE INDEX "products_design_idx" ON "products" USING btree ("design_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_printify_idx" ON "products" USING btree ("printify_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_channel_external_idx" ON "messages" USING btree ("channel","external_id");--> statement-breakpoint
CREATE INDEX "messages_status_idx" ON "messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "messages_order_idx" ON "messages" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_shop_status_idx" ON "orders" USING btree ("shop_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_shopify_idx" ON "orders" USING btree ("shopify_order_id");--> statement-breakpoint
CREATE INDEX "orders_email_idx" ON "orders" USING btree ("customer_email");--> statement-breakpoint
CREATE INDEX "replies_message_idx" ON "replies" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "replies_status_idx" ON "replies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_runs_agent_started_idx" ON "agent_runs" USING btree ("agent","started_at");--> statement-breakpoint
CREATE INDEX "agent_runs_status_idx" ON "agent_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_rules_kind_category_idx" ON "approval_rules" USING btree ("kind","category");--> statement-breakpoint
CREATE INDEX "approvals_decision_kind_idx" ON "approvals" USING btree ("decision","kind");--> statement-breakpoint
CREATE INDEX "approvals_shop_idx" ON "approvals" USING btree ("shop_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_live_ref_idx" ON "approvals" USING btree ("kind","ref_id") WHERE "approvals"."decision" <> 'rejected';--> statement-breakpoint
CREATE UNIQUE INDEX "blocked_phrases_phrase_idx" ON "blocked_phrases" USING btree ("phrase");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_metrics_shop_date_idx" ON "daily_metrics" USING btree ("shop_id","date");--> statement-breakpoint
CREATE INDEX "events_ts_idx" ON "events" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "events_agent_ts_idx" ON "events" USING btree ("agent","ts");--> statement-breakpoint
CREATE INDEX "events_level_idx" ON "events" USING btree ("level");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_rules_shop_type_idx" ON "pricing_rules" USING btree ("shop_id","product_type");