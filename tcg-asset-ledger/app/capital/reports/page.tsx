import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatUSD, toDollars } from "@/lib/money";
import { isCapitalSetUp, syncInventoryToJournal } from "@/lib/accounting";
import {
  getProfitAndLoss,
  getStatementOfPosition,
  getCashFlow,
  getOwnerActivity,
  getExpenseReport,
  getCapitalAllocation,
  getEquityWaterfall,
} from "@/lib/capital-reports";
import { RangeToolbar, ExportButton } from "./report-tools";

export const dynamic = "force-dynamic";

function parseFrom(s?: string) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0) : null;
}
function parseTo(s?: string) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999) : null;
}
const d$ = (cents: number) => toDollars(cents).toFixed(2);

export default async function CapitalReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  if (!(await isCapitalSetUp())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Financial reports over your capital ledger." />
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <p className="text-sm text-muted-foreground">Set up your capital first to see reports.</p>
            <Link href="/capital/setup" className={cn(buttonVariants())}>Start capital setup</Link>
          </CardContent>
        </Card>
      </div>
    );
  }
  await syncInventoryToJournal();

  const { from, to } = await searchParams;
  const range = { from: parseFrom(from), to: parseTo(to) };
  const now = new Date();
  const [pnl, position, cashflow, owner, expenses, allocation, waterfall] = await Promise.all([
    getProfitAndLoss(range),
    getStatementOfPosition(now),
    getCashFlow(range),
    getOwnerActivity(range),
    getExpenseReport(range),
    getCapitalAllocation(now),
    getEquityWaterfall(now),
  ]);

  const rangeLabel = from || to ? `${from ?? "start"} → ${to ?? "today"}` : "All time";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Profit & loss, cash flow, balance sheet, and owner activity from your books."
        actions={<Link href="/capital" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>← Capital</Link>}
      />
      <RangeToolbar from={from} to={to} />
      <p className="text-xs text-muted-foreground">
        P&amp;L, cash flow, expenses, and owner activity cover <span className="font-medium text-foreground">{rangeLabel}</span>.
        Balance sheet &amp; allocation are as-of today.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profit & Loss */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Profit &amp; Loss</CardTitle>
            <ExportButton
              filename="profit-and-loss.csv"
              headers={["Section", "Line", "Amount"]}
              rows={[
                ...pnl.income.map((x) => ["Income", x.name, d$(x.cents)] as (string | number)[]),
                ["Income", "Total revenue", d$(pnl.revenueTotal)],
                ...pnl.cogs.map((x) => ["COGS", x.name, d$(x.cents)] as (string | number)[]),
                ["COGS", "Total COGS", d$(pnl.cogsTotal)],
                ["", "Gross profit", d$(pnl.grossProfit)],
                ...pnl.expenses.map((x) => ["Expense", x.name, d$(x.cents)] as (string | number)[]),
                ["Expense", "Total expenses", d$(pnl.expenseTotal)],
                ["", "Net profit", d$(pnl.netProfit)],
              ]}
            />
          </CardHeader>
          <CardContent className="space-y-1 pt-0 text-sm">
            <Section title="Income" />
            {pnl.income.length ? pnl.income.map((x) => <Row key={x.name} label={x.name} value={formatUSD(x.cents)} />) : <Empty />}
            <Row label="Total revenue" value={formatUSD(pnl.revenueTotal)} strong />
            {pnl.cogs.length ? (<><Section title="Cost of goods sold" />{pnl.cogs.map((x) => <Row key={x.name} label={x.name} value={formatUSD(x.cents)} />)}</>) : null}
            <Row label="Gross profit" value={formatUSD(pnl.grossProfit)} strong />
            <Section title="Operating expenses" />
            {pnl.expenses.length ? pnl.expenses.map((x) => <Row key={x.name} label={x.name} value={formatUSD(x.cents)} />) : <Empty />}
            <Row label="Total expenses" value={formatUSD(pnl.expenseTotal)} strong />
            <div className="mt-1 border-t border-border pt-2">
              <Row label="Net profit" value={formatUSD(pnl.netProfit)} strong tone={pnl.netProfit >= 0 ? "text-success" : "text-destructive"} />
            </div>
          </CardContent>
        </Card>

        {/* Statement of Position */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Statement of Position <span className="text-xs font-normal text-muted-foreground">(today)</span></CardTitle>
            <ExportButton
              filename="statement-of-position.csv"
              headers={["Section", "Line", "Amount"]}
              rows={[
                ...position.assets.map((x) => ["Assets", x.name, d$(x.cents)] as (string | number)[]),
                ["Assets", "Total assets", d$(position.assetsTotal)],
                ...position.liabilities.map((x) => ["Liabilities", x.name, d$(x.cents)] as (string | number)[]),
                ["Liabilities", "Total liabilities", d$(position.liabilitiesTotal)],
                ["", "Net equity", d$(position.equity)],
              ]}
            />
          </CardHeader>
          <CardContent className="space-y-1 pt-0 text-sm">
            <Section title="Assets" />
            {position.assets.map((x) => <Row key={x.name} label={x.name} value={formatUSD(x.cents)} />)}
            <Row label="Total assets" value={formatUSD(position.assetsTotal)} strong />
            <Section title="Liabilities" />
            {position.liabilities.length ? position.liabilities.map((x) => <Row key={x.name} label={x.name} value={formatUSD(x.cents)} />) : <Empty />}
            <Row label="Total liabilities" value={formatUSD(position.liabilitiesTotal)} strong />
            <div className="mt-1 border-t border-border pt-2">
              <Row label="Net business equity" value={formatUSD(position.equity)} strong tone={position.equity >= 0 ? "text-success" : "text-destructive"} />
            </div>
          </CardContent>
        </Card>

        {/* Cash Flow */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Cash Flow</CardTitle>
            <ExportButton
              filename="cash-flow.csv"
              headers={["Direction", "Category", "Amount"]}
              rows={[
                ...cashflow.inflows.map((x) => ["In", x.name, d$(x.cents)] as (string | number)[]),
                ...cashflow.outflows.map((x) => ["Out", x.name, d$(-x.cents)] as (string | number)[]),
                ["", "Net change", d$(cashflow.net)],
              ]}
            />
          </CardHeader>
          <CardContent className="space-y-1 pt-0 text-sm">
            <Section title="Cash in" />
            {cashflow.inflows.length ? cashflow.inflows.map((x) => <Row key={x.name} label={x.name} value={formatUSD(x.cents)} />) : <Empty />}
            <Section title="Cash out" />
            {cashflow.outflows.length ? cashflow.outflows.map((x) => <Row key={x.name} label={x.name} value={`(${formatUSD(x.cents)})`} />) : <Empty />}
            <div className="mt-1 border-t border-border pt-2">
              <Row label="Net cash change" value={formatUSD(cashflow.net)} strong tone={cashflow.net >= 0 ? "text-success" : "text-destructive"} />
            </div>
          </CardContent>
        </Card>

        {/* Owner Activity */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Owner Activity</CardTitle>
            <ExportButton
              filename="owner-activity.csv"
              headers={["Item", "Amount"]}
              rows={[
                ["Contributions", d$(owner.contributions)],
                ["Draws", d$(owner.draws)],
                ["Advanced to owner", d$(owner.dueFromAdvances)],
                ["Owner repayments", d$(owner.dueFromRepayments)],
                ["Owner owes business (net)", d$(owner.dueFromOwner)],
                ["Business owes owner", d$(owner.dueToOwner)],
              ]}
            />
          </CardHeader>
          <CardContent className="space-y-1 pt-0 text-sm">
            <Row label="Contributions" value={formatUSD(owner.contributions)} />
            <Row label="Draws" value={`(${formatUSD(owner.draws)})`} />
            <Row label="Advanced to owner" value={formatUSD(owner.dueFromAdvances)} />
            <Row label="Owner repayments" value={formatUSD(owner.dueFromRepayments)} />
            <div className="mt-1 border-t border-border pt-2">
              <Row label="Owner owes business (net)" value={formatUSD(owner.dueFromOwner)} strong tone={owner.dueFromOwner > 0 ? "text-destructive" : undefined} />
              <Row label="Business owes owner" value={formatUSD(owner.dueToOwner)} />
            </div>
          </CardContent>
        </Card>

        {/* Expenses by category */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Expenses by Category</CardTitle>
            <ExportButton
              filename="expenses.csv"
              headers={["Category", "Amount"]}
              rows={[...expenses.rows.map((x) => [x.name, d$(x.cents)] as (string | number)[]), ["Total", d$(expenses.total)]]}
            />
          </CardHeader>
          <CardContent className="space-y-1 pt-0 text-sm">
            {expenses.rows.length ? expenses.rows.map((x) => <Row key={x.name} label={x.name} value={formatUSD(x.cents)} />) : <Empty />}
            <div className="mt-1 border-t border-border pt-2">
              <Row label="Total expenses" value={formatUSD(expenses.total)} strong />
            </div>
          </CardContent>
        </Card>

        {/* Equity Waterfall */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Equity Waterfall <span className="text-xs font-normal text-muted-foreground">(books, today)</span></CardTitle>
            <ExportButton
              filename="equity-waterfall.csv"
              headers={["Line", "Amount"]}
              rows={[
                ["Opening equity", d$(waterfall.openingEquity)],
                ["Owner contributions", d$(waterfall.contributions)],
                ["Owner draws", d$(-waterfall.draws)],
                ["Net profit", d$(waterfall.netProfit)],
                ["Net business equity", d$(waterfall.netEquity)],
                ["Capital at risk", d$(waterfall.capitalAtRisk)],
                ["Reinvested profit", d$(waterfall.reinvestedProfit)],
              ]}
            />
          </CardHeader>
          <CardContent className="space-y-1 pt-0 text-sm">
            <Row label="Opening equity" value={formatUSD(waterfall.openingEquity)} />
            <Row label="+ Owner contributions" value={formatUSD(waterfall.contributions)} />
            <Row label="− Owner draws" value={`(${formatUSD(waterfall.draws)})`} />
            <Row label="+ Net profit (books)" value={formatUSD(waterfall.netProfit)} />
            <div className="mt-1 border-t border-border pt-2">
              <Row label="Net business equity (books)" value={formatUSD(waterfall.netEquity)} strong tone={waterfall.netEquity >= 0 ? "text-success" : "text-destructive"} />
            </div>
            <p className="pt-1 text-xs text-muted-foreground">
              Of which: <span className="font-medium text-foreground">{formatUSD(waterfall.capitalAtRisk)}</span> original owner capital at risk,{" "}
              <span className="font-medium text-foreground">{formatUSD(waterfall.reinvestedProfit)}</span> reinvested profit. Books view — may differ slightly from the live dashboard, which values inventory at current basis.
            </p>
          </CardContent>
        </Card>

        {/* Capital Allocation */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Capital Allocation <span className="text-xs font-normal text-muted-foreground">(today)</span></CardTitle>
            <ExportButton
              filename="capital-allocation.csv"
              headers={["Category", "Amount", "Percent"]}
              rows={allocation.rows.map((x) => [x.name, d$(x.cents), `${x.pct.toFixed(1)}%`] as (string | number)[])}
            />
          </CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            {allocation.rows.length ? allocation.rows.map((x) => (
              <div key={x.name}>
                <div className="flex items-center justify-between">
                  <span>{x.name}</span>
                  <span className="tnum text-muted-foreground">{formatUSD(x.cents)} · {x.pct.toFixed(1)}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${Math.min(100, x.pct)}%` }} />
                </div>
              </div>
            )) : <Empty />}
            <div className="mt-1 border-t border-border pt-2">
              <Row label="Total assets" value={formatUSD(allocation.total)} strong />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span className={cn("tnum", strong && "font-semibold", tone)}>{value}</span>
    </div>
  );
}
function Section({ title }: { title: string }) {
  return <div className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>;
}
function Empty() {
  return <div className="text-xs text-muted-foreground">None in this range.</div>;
}
