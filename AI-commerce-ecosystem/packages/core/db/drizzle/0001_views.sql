-- Views the Company dashboard reads (SPEC.md §Core data model).
--
-- LEDGER SIGN CONVENTION, which every view below depends on:
-- `ledger.amount_cents` is SIGNED and records the effect on the company. Revenue is
-- positive; cogs, expense and api_cost are posted NEGATIVE. A refund is a negative
-- `revenue` row, not a positive `expense` one. That way margin and net cash are plain
-- SUMs and no view has to know which kinds to flip.

CREATE OR REPLACE VIEW v_division_pnl AS
SELECT
  l.division_id,
  date_trunc('month', l.occurred_at)                                      AS month,
  COALESCE(SUM(l.amount_cents) FILTER (WHERE l.kind = 'revenue'),  0)     AS revenue_cents,
  COALESCE(SUM(l.amount_cents) FILTER (WHERE l.kind = 'cogs'),     0)     AS cogs_cents,
  COALESCE(SUM(l.amount_cents) FILTER (WHERE l.kind = 'expense'),  0)     AS expense_cents,
  COALESCE(SUM(l.amount_cents) FILTER (WHERE l.kind = 'api_cost'), 0)     AS api_cost_cents,
  COALESCE(SUM(l.amount_cents) FILTER (
    WHERE l.kind IN ('revenue', 'cogs', 'expense', 'api_cost')), 0)       AS margin_cents
FROM ledger l
GROUP BY l.division_id, date_trunc('month', l.occurred_at);
--> statement-breakpoint

CREATE OR REPLACE VIEW v_company_cash AS
SELECT
  COALESCE(SUM(amount_cents) FILTER (WHERE kind = 'revenue'), 0)          AS cash_in_cents,
  COALESCE(SUM(amount_cents) FILTER (
    WHERE kind IN ('cogs', 'expense', 'api_cost')), 0)                    AS cash_out_cents,
  COALESCE(SUM(amount_cents) FILTER (
    WHERE kind IN ('revenue', 'cogs', 'expense', 'api_cost')), 0)         AS net_cents,
  COALESCE(SUM(amount_cents) FILTER (WHERE kind = 'asset'), 0)            AS assets_cents,
  COALESCE(SUM(amount_cents) FILTER (WHERE kind = 'liability'), 0)        AS liabilities_cents,
  COALESCE(SUM(amount_cents) FILTER (WHERE kind = 'asset'), 0)
    + COALESCE(SUM(amount_cents) FILTER (WHERE kind = 'liability'), 0)    AS net_worth_cents
FROM ledger;
--> statement-breakpoint

-- Per-agent activity over the last 7 days.
--
-- Deliberately does NOT compute the station light. "Stale" depends on parsing the
-- agent's cron schedule into an interval, and "red" on a consecutive-failure streak;
-- both are decided by assessAgentHealth() in packages/core/runtime, which is unit
-- tested. A second, untested implementation of that logic in SQL is exactly the kind
-- of drift that makes a dashboard lie.
CREATE OR REPLACE VIEW v_agent_health AS
SELECT
  a.id                                                                    AS agent_id,
  a.division_id,
  a.name,
  a.status,
  a.schedule,
  a.autonomy,
  a.last_run_at,
  COALESCE(r.runs_7d, 0)                                                  AS runs_7d,
  COALESCE(r.ok_7d, 0)                                                    AS ok_7d,
  CASE
    WHEN COALESCE(r.runs_7d, 0) = 0 THEN NULL
    ELSE r.ok_7d::real / r.runs_7d
  END                                                                     AS success_rate_7d,
  COALESCE(r.cost_cents_7d, 0)                                            AS cost_cents_7d
FROM agents a
LEFT JOIN (
  SELECT
    agent_id,
    COUNT(*)                                        AS runs_7d,
    COUNT(*) FILTER (WHERE status = 'ok')           AS ok_7d,
    SUM(cost_cents)                                 AS cost_cents_7d
  FROM agent_runs
  WHERE started_at > now() - interval '7 days'
  GROUP BY agent_id
) r ON r.agent_id = a.id;
--> statement-breakpoint

CREATE OR REPLACE VIEW v_queue_depth AS
SELECT
  d.id                                                                    AS division_id,
  d.name,
  d.status,
  (SELECT COUNT(*) FROM approvals ap
     WHERE ap.division_id = d.id AND ap.decision = 'pending')             AS pending_approvals,
  (SELECT COUNT(*) FROM tasks t
     WHERE t.division_id = d.id AND t.status = 'queued')                  AS queued_tasks,
  (SELECT COUNT(*) FROM tasks t
     WHERE t.division_id = d.id AND t.status = 'blocked')                 AS blocked_tasks,
  (SELECT COUNT(*) FROM tasks t
     WHERE t.division_id = d.id AND t.status = 'running')                 AS running_tasks,
  (SELECT COUNT(*) FROM opportunities o
     WHERE o.division_id = d.id AND o.status = 'new')                     AS new_opportunities
FROM divisions d;
