-- Extensions must exist before anything that depends on them.
--
-- drizzle-kit does not emit CREATE EXTENSION, and agent_memory.embedding is
-- vector(1536), so without this the migration fails with: type "vector" does not exist.
--
-- Module schemas are NOT created here. Each module's own migration creates its schema,
-- which is what lets a division be dropped without touching core.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TYPE "public"."agent_autonomy" AS ENUM('propose', 'act_with_approval', 'auto');--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('active', 'paused', 'retired');--> statement-breakpoint
CREATE TYPE "public"."approval_decision" AS ENUM('pending', 'approved', 'rejected', 'edited');--> statement-breakpoint
CREATE TYPE "public"."division_status" AS ENUM('planning', 'active', 'paused', 'closed');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('customer', 'lead', 'supplier', 'listing', 'inventory_item', 'asset');--> statement-breakpoint
CREATE TYPE "public"."event_level" AS ENUM('info', 'warn', 'error');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('active', 'met', 'missed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."ledger_kind" AS ENUM('revenue', 'cogs', 'expense', 'api_cost', 'asset', 'liability');--> statement-breakpoint
CREATE TYPE "public"."memory_kind" AS ENUM('decision', 'result', 'lesson', 'fact');--> statement-breakpoint
CREATE TYPE "public"."opportunity_risk" AS ENUM('low', 'med', 'high');--> statement-breakpoint
CREATE TYPE "public"."opportunity_status" AS ENUM('new', 'reviewed', 'pursuing', 'shelved', 'done');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'ok', 'error');--> statement-breakpoint
CREATE TYPE "public"."task_source" AS ENUM('schedule', 'event', 'operator', 'agent');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('queued', 'running', 'blocked', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'operator', 'viewer');--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"purpose" text,
	"module_agent_key" text DEFAULT 'generic' NOT NULL,
	"model" text NOT NULL,
	"system_prompt" text DEFAULT '' NOT NULL,
	"tools" text[] DEFAULT '{}'::text[] NOT NULL,
	"schedule" text,
	"autonomy" "agent_autonomy" DEFAULT 'propose' NOT NULL,
	"status" "agent_status" DEFAULT 'active' NOT NULL,
	"cross_division" boolean DEFAULT false NOT NULL,
	"max_steps" integer DEFAULT 12 NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid,
	"name" text NOT NULL,
	"env_key" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "divisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"module_id" uuid,
	"type" text DEFAULT 'generic' NOT NULL,
	"status" "division_status" DEFAULT 'planning' NOT NULL,
	"goal_summary" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"daily_spend_cap_cents" integer DEFAULT 2500 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid NOT NULL,
	"agent_id" uuid,
	"statement" text NOT NULL,
	"metric" text,
	"target" integer,
	"current" integer DEFAULT 0 NOT NULL,
	"deadline" timestamp with time zone,
	"status" "goal_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"description" text,
	"stations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approval_kinds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tool_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" DEFAULT 'owner' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"division_id" uuid NOT NULL,
	"task_id" uuid,
	"kind" "memory_kind" NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"importance" real DEFAULT 0.5 NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid,
	"task_id" uuid,
	"division_id" uuid,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"input" jsonb,
	"output" jsonb,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_cents" double precision DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid NOT NULL,
	"agent_id" uuid,
	"parent_task_id" uuid,
	"title" text NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"status" "task_status" DEFAULT 'queued' NOT NULL,
	"source" "task_source" DEFAULT 'schedule' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone,
	"blocked_on_approval_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"approved_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"edited_count" integer DEFAULT 0 NOT NULL,
	"threshold_count" integer DEFAULT 20 NOT NULL,
	"threshold_rate" real DEFAULT 0.95 NOT NULL,
	"auto_enabled" boolean DEFAULT false NOT NULL,
	"never_auto" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"ref_table" text NOT NULL,
	"ref_id" text NOT NULL,
	"summary" text NOT NULL,
	"payload" jsonb NOT NULL,
	"decision" "approval_decision" DEFAULT 'pending' NOT NULL,
	"auto_decided" boolean DEFAULT false NOT NULL,
	"edit_payload" jsonb,
	"task_id" uuid,
	"requested_by" text NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid NOT NULL,
	"type" "entity_type" NOT NULL,
	"name" text NOT NULL,
	"external_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"division_id" uuid,
	"agent_id" uuid,
	"station" text,
	"kind" text NOT NULL,
	"level" "event_level" DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"ref_table" text,
	"ref_id" text
);
--> statement-breakpoint
CREATE TABLE "ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid NOT NULL,
	"kind" "ledger_kind" NOT NULL,
	"amount_cents" numeric(18, 6) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"description" text,
	"ref_table" text,
	"ref_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"summary" text NOT NULL,
	"est_profit_cents" integer,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"risk" "opportunity_risk" DEFAULT 'med' NOT NULL,
	"hours_required" real,
	"score" real DEFAULT 0 NOT NULL,
	"status" "opportunity_status" DEFAULT 'new' NOT NULL,
	"evaluated_by" text,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory" ADD CONSTRAINT "agent_memory_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory" ADD CONSTRAINT "agent_memory_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory" ADD CONSTRAINT "agent_memory_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_division_idx" ON "agents" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX "agents_status_schedule_idx" ON "agents" USING btree ("status","schedule");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_division_name_idx" ON "agents" USING btree ("division_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "credentials_division_name_idx" ON "credentials" USING btree ("division_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "divisions_slug_idx" ON "divisions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "divisions_status_idx" ON "divisions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "goals_division_status_idx" ON "goals" USING btree ("division_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "modules_name_idx" ON "modules" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "agent_memory_agent_idx" ON "agent_memory" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_memory_kind_idx" ON "agent_memory" USING btree ("agent_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "agent_runs_agent_started_idx" ON "agent_runs" USING btree ("agent_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_runs_status_idx" ON "agent_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_runs_task_idx" ON "agent_runs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "tasks_status_priority_idx" ON "tasks" USING btree ("status","priority","created_at");--> statement-breakpoint
CREATE INDEX "tasks_division_status_idx" ON "tasks" USING btree ("division_id","status");--> statement-breakpoint
CREATE INDEX "tasks_agent_idx" ON "tasks" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "tasks_parent_idx" ON "tasks" USING btree ("parent_task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_rules_scope_idx" ON "approval_rules" USING btree ("division_id","kind","category");--> statement-breakpoint
CREATE INDEX "approvals_decision_division_idx" ON "approvals" USING btree ("decision","division_id");--> statement-breakpoint
CREATE INDEX "approvals_kind_idx" ON "approvals" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "approvals_task_idx" ON "approvals" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_live_ref_idx" ON "approvals" USING btree ("division_id","kind","ref_table","ref_id") WHERE "approvals"."decision" <> 'rejected';--> statement-breakpoint
CREATE INDEX "entities_division_type_idx" ON "entities" USING btree ("division_id","type");--> statement-breakpoint
CREATE INDEX "entities_name_idx" ON "entities" USING btree ("name");--> statement-breakpoint
CREATE INDEX "events_ts_idx" ON "events" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "events_division_ts_idx" ON "events" USING btree ("division_id","ts");--> statement-breakpoint
CREATE INDEX "events_agent_ts_idx" ON "events" USING btree ("agent_id","ts");--> statement-breakpoint
CREATE INDEX "events_level_idx" ON "events" USING btree ("level");--> statement-breakpoint
CREATE INDEX "ledger_division_occurred_idx" ON "ledger" USING btree ("division_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ledger_kind_idx" ON "ledger" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "opportunities_status_score_idx" ON "opportunities" USING btree ("status","score");--> statement-breakpoint
CREATE INDEX "opportunities_division_idx" ON "opportunities" USING btree ("division_id");