import Link from "next/link";
import { format } from "date-fns";
import {
  Landmark,
  Wallet,
  DollarSign,
  Boxes,
  HandCoins,
  ArrowDownCircle,
  Scale,
  ShieldCheck,
  AlertTriangle,
  CalendarClock,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatUSD, toDollars } from "@/lib/money";
import { getDashboardMetrics } from "@/lib/queries";
import {
  getCapitalSnapshot,
  getCapitalSettings,
  syncInventoryToJournal,
  listActiveAccounts,
  listJournalEntries,
} from "@/lib/accounting";
import { getEquityWaterfall } from "@/lib/capital-reports";
import { getCommitmentSummary } from "@/lib/commitments";
import { AUTO_ONLY_EXPENSE_CODES } from "@/lib/accounting-math";
import { CapitalForms } from "./capital-forms";
import { CapitalTargets } from "./capital-targets";
import { ReverseButton } from "./reverse-button";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  OpeningBalance: "Opening balances",
  OwnerContribution: "Added capital",
  OwnerDraw: "Personal withdrawal",
  DueFromOwner: "Money owed back",
  OwnerRepayment: "Owner repaid",
  DueToOwner: "Paid personally",
  OwnerReimbursement: "Reimbursed owner",
  BusinessExpense: "Business expense",
  Transfer: "Transfer",
  Reconciliation: "Cash reconciliation",
  Reversal: "Reversal",
  EquipmentPurchase: "Bought equipment",
  Prepaid: "Prepaid",
  PrepaidApplied: "Prepaid applied",
  // Mirrored inventory events
  BUY: "Bought inventory",
  SALE: "Sold inventory",
  TRADE: "Trade",
  BREAK: "Break",
  PRIZE: "Prize",
  GRADING_SUBMIT: "Sent to grading",
  GRADING_RETURN: "Grading return",
  WHEEL_REVENUE: "Wheel revenue",
  WHEEL_PRIZE: "Wheel prize",
  WHEEL_SPIN: "Wheel spins",
  ADJUSTMENT: "Adjustment",
};

export default async function CapitalPage() {
  // Pull any inventory activity into the journal before reading balances, so cash
  // and P&L reflect buys/sales/trades automatically (idempotent, read-only on the
  // inventory ledger; no-op until the books are opened).
  await syncInventoryToJournal();
  const snapshot = await getCapitalSnapshot(new Date());

  if (!snapshot.isSetUp) {
    return (
      <div className="space-y-6">
        <PageHeader title="Capital" description="Cash, owner capital, and business equity — the money side of the ledger." />
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <Landmark className="size-10 text-muted-foreground" />
            <div>
              <p className="text-lg font-semibold">Set up your business capital</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Enter your starting cash, inventory, equipment, and what the owner has put in. From
                there, the ledger tracks how much cash you should have, who owes whom, and your true
                business equity.
              </p>
            </div>
            <Link href="/capital/setup" className={cn(buttonVariants())}>
              Start capital setup
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const now = new Date();
  const [metrics, accounts, entries, settings, waterfall, commitments] = await Promise.all([
    getDashboardMetrics(),
    listActiveAccounts(),
    listJournalEntries(20),
    getCapitalSettings(),
    getEquityWaterfall(now),
    getCommitmentSummary(now),
  ]);

  const totalCash = snapshot.cashTotal;
  const minReserve = settings.minCashReserveCents ?? 0;
  // Money already spoken for (pre-orders etc.) is held back too.
  const safeToSpend = totalCash - snapshot.restrictedCash - minReserve - commitments.totalRemaining;
  const alerts: string[] = [];
  if (minReserve > 0 && totalCash < minReserve)
    alerts.push(`Cash (${formatUSD(totalCash)}) is below your ${formatUSD(minReserve)} minimum reserve.`);
  if (settings.buyingPowerTargetCents != null && safeToSpend < settings.buyingPowerTargetCents)
    alerts.push(`Safe-to-spend (${formatUSD(safeToSpend)}) is ${formatUSD(settings.buyingPowerTargetCents - safeToSpend)} below your ${formatUSD(settings.buyingPowerTargetCents)} buying-power target.`);
  if (commitments.overdue > 0)
    alerts.push(`${formatUSD(commitments.overdue)} in commitments (${commitments.overdueCount}) is past due.`);
  if (commitments.dueSoon > 0)
    alerts.push(`${formatUSD(commitments.dueSoon)} in commitments (${commitments.dueSoonCount}) comes due within 2 weeks.`);
  if (snapshot.dueFromOwnerAging.d90plus > 0)
    alerts.push(`Owner has owed ${formatUSD(snapshot.dueFromOwnerAging.d90plus)} to the business for 90+ days.`);
  const inventoryBasis = metrics.inventoryCostCents;
  const totalAssets = totalCash + inventoryBasis + snapshot.otherAssetsTotal;
  const netEquity = totalAssets - snapshot.liabilities;

  const cashAccounts = accounts.filter((a) => a.isCash && a.code).map((a) => ({ code: a.code as string, name: a.name }));
  const transferAccounts = accounts
    .filter((a) => a.code && (a.isCash || a.subtype === "Receivable"))
    .map((a) => ({ code: a.code as string, name: a.name }));
  const prepaidAccounts = accounts
    .filter((a) => a.code && a.subtype === "Prepaid")
    .map((a) => ({ code: a.code as string, name: a.name }));
  const expenseAccounts = accounts
    .filter((a) => a.type === "Expense" && !(a.code && AUTO_ONLY_EXPENSE_CODES.has(a.code)))
    .map((a) => ({ id: a.id, name: a.name }));
  const aging = snapshot.dueFromOwnerAging;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Capital"
        description="Cash, owner capital, and business equity — the money side of the ledger."
        actions={
          <div className="flex gap-2">
            <Link href="/capital/commitments" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Commitments
            </Link>
            <Link href="/capital/reports" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Reports
            </Link>
          </div>
        }
      />

      {alerts.length > 0 ? (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{a}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Headline cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total business cash" value={formatUSD(totalCash)} hint="Opening + everything since" icon={Wallet} />
        <StatCard label="Safe to spend" value={formatUSD(safeToSpend)} hint={minReserve > 0 || commitments.totalRemaining > 0 ? "After reserve & commitments" : "Unrestricted cash"} icon={DollarSign} tone={safeToSpend >= 0 ? undefined : "destructive"} />
        <StatCard label="Net business equity" value={formatUSD(netEquity)} hint="Assets − liabilities" icon={Scale} tone={netEquity >= 0 ? "success" : "destructive"} />
        <StatCard label="Capital at risk" value={formatUSD(waterfall.capitalAtRisk)} hint="Original owner money still in" icon={ShieldCheck} />
        <StatCard label="Realized profit" value={formatUSD(metrics.realizedProfitCents)} hint={`${formatUSD(metrics.salesProceedsCents)} in sales`} icon={DollarSign} tone={metrics.realizedProfitCents >= 0 ? "success" : "destructive"} />
        <StatCard label="Owner owes business" value={formatUSD(snapshot.dueFromOwner)} hint="Due from owner" icon={HandCoins} tone={snapshot.dueFromOwner > 0 ? "destructive" : undefined} />
        <StatCard label="Business owes you" value={formatUSD(snapshot.dueToOwner)} hint="Due to owner" icon={ArrowDownCircle} />
        <StatCard label="Inventory cost basis" value={formatUSD(inventoryBasis)} hint={`Market ${formatUSD(metrics.inventoryValueCents)}`} icon={Boxes} />
        <StatCard label="Equipment / assets" value={formatUSD(snapshot.equipment)} hint="Non-inventory business assets" icon={Landmark} />
        {commitments.totalRemaining > 0 ? (
          <StatCard label="Committed (upcoming)" value={formatUSD(commitments.totalRemaining)} hint={`${commitments.openCount} pre-order${commitments.openCount === 1 ? "" : "s"}/obligation${commitments.openCount === 1 ? "" : "s"}`} icon={CalendarClock} tone={commitments.overdue > 0 ? "destructive" : undefined} />
        ) : null}
      </div>

      {/* Owner owes business — aging */}
      {snapshot.dueFromOwner > 0 ? (
        <Card className="border-destructive/40">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base text-destructive">Owner owes the business {formatUSD(snapshot.dueFromOwner)}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 pt-0 sm:grid-cols-4">
            <AgeBucket label="0–30 days" cents={aging.d0_30} />
            <AgeBucket label="31–60 days" cents={aging.d31_60} />
            <AgeBucket label="61–90 days" cents={aging.d61_90} tone={aging.d61_90 > 0 ? "text-warning" : undefined} />
            <AgeBucket label="90+ days" cents={aging.d90plus} tone={aging.d90plus > 0 ? "text-destructive" : undefined} />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Cash by account */}
        <Card>
          <CardHeader><CardTitle className="text-base">Cash by account</CardTitle></CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            {snapshot.cashByAccount.map((c) => (
              <Row key={c.id} label={c.name} value={formatUSD(c.cents)} />
            ))}
            <div className="border-t border-border pt-2">
              <Row label="Total business cash" value={formatUSD(totalCash)} strong />
            </div>
            <p className="pt-1 text-xs text-muted-foreground">
              Reflects your opening balance, everything you record here, and inventory buys/sales that
              posted after you opened the books (auto-synced). Operational cash lands in{" "}
              <em>Cash on Hand</em> for now — use <em>Transfer</em> to move it, or <em>Reconcile cash</em>{" "}
              to true-up to a real count.
            </p>
          </CardContent>
        </Card>

        {/* Owner capital summary */}
        <Card>
          <CardHeader><CardTitle className="text-base">Owner capital</CardTitle></CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            <Row label="Opening balance equity" value={formatUSD(snapshot.openingEquity)} />
            <Row label="Owner contributions" value={formatUSD(snapshot.ownerContributions)} />
            <Row label="Owner draws" value={`(${formatUSD(snapshot.ownerDraws)})`} />
            <Row label="Recorded expenses" value={`(${formatUSD(snapshot.expensesTotal)})`} />
            <Row label="Business owes you" value={formatUSD(snapshot.dueToOwner)} />
            <Row label="Outstanding liabilities" value={`(${formatUSD(snapshot.liabilities)})`} />
            <div className="border-t border-border pt-2">
              <Row label="Net business equity" value={formatUSD(netEquity)} strong tone={netEquity >= 0 ? "text-success" : "text-destructive"} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Record a money event */}
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Record a money event</h2>
        <CapitalForms cashAccounts={cashAccounts} expenseAccounts={expenseAccounts} transferAccounts={transferAccounts} prepaidAccounts={prepaidAccounts} />
      </div>

      {/* Reserve targets */}
      <Card>
        <CardHeader><CardTitle className="text-base">Reserve targets</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <CapitalTargets
            minReserve={settings.minCashReserveCents != null ? String(toDollars(settings.minCashReserveCents)) : ""}
            buyingPowerTarget={settings.buyingPowerTargetCents != null ? String(toDollars(settings.buyingPowerTargetCents)) : ""}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Set a minimum cash cushion and a buying-power target — the dashboard warns you when you dip below, or when the owner owes for 90+ days.
          </p>
        </CardContent>
      </Card>

      {/* Journal */}
      <Card>
        <CardHeader><CardTitle className="text-base">Capital ledger</CardTitle></CardHeader>
        <CardContent className="pt-0">
          {entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No entries yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => {
                  const amount = e.lines.reduce((s, l) => s + l.debitCents, 0);
                  const reversible = e.status === "posted" && e.type !== "Reversal" && !e.sourceTransactionId;
                  return (
                    <TableRow key={e.id} className={e.status === "reversed" ? "opacity-50" : undefined}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{format(e.date, "MMM d")}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{TYPE_LABELS[e.type] ?? e.type}</Badge>
                        {e.status === "reversed" ? <span className="ml-1 text-xs text-muted-foreground">(reversed)</span> : null}
                      </TableCell>
                      <TableCell className="max-w-[360px] truncate">{e.description}</TableCell>
                      <TableCell className="text-right tnum">{formatUSD(amount)}</TableCell>
                      <TableCell className="text-right">
                        {reversible ? <ReverseButton entryId={e.id} label={TYPE_LABELS[e.type] ?? e.type} /> : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, strong, muted, tone }: { label: string; value: string; strong?: boolean; muted?: boolean; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-muted-foreground" : strong ? "font-medium" : ""}>{label}</span>
      <span className={cn("tnum", strong && "font-semibold", tone)}>{value}</span>
    </div>
  );
}

function AgeBucket({ label, cents, tone }: { label: string; cents: number; tone?: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold tnum", tone)}>{formatUSD(cents)}</div>
    </div>
  );
}
