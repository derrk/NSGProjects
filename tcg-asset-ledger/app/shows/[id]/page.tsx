import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Pencil, MapPin, CalendarDays, Camera } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProfitText } from "@/components/money-text";
import { getShow, getActiveShow, computeShowSummary, daysUntil } from "@/lib/shows";
import { listActiveAccounts, isCapitalSetUp } from "@/lib/accounting";
import { AUTO_ONLY_EXPENSE_CODES } from "@/lib/accounting-math";
import { formatUSD } from "@/lib/money";
import { summarizeTransaction, txnTypeLabel } from "@/lib/txn-format";
import { EnterShowMode, EndShowMode } from "./show-mode-controls";
import { ShowExpenseForm } from "./show-expense-form";

export const dynamic = "force-dynamic";

export default async function ShowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [show, activeShow, capitalSetUp, accounts] = await Promise.all([
    getShow(id),
    getActiveShow(),
    isCapitalSetUp(),
    listActiveAccounts(),
  ]);
  if (!show) notFound();
  const summary = await computeShowSummary(id);

  const cashAccounts = accounts
    .filter((a) => a.isCash)
    .map((a) => ({ code: a.code ?? "", name: a.name }))
    .filter((a) => a.code);
  const expenseAccounts = accounts
    .filter((a) => a.type === "Expense" && !(a.code && AUTO_ONLY_EXPENSE_CODES.has(a.code)))
    .map((a) => ({ id: a.id, name: a.name }));
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const isActive = activeShow?.id === show.id;
  const otherShowActive = !!activeShow && !isActive;
  const days = daysUntil(show.startDate);
  const hasActivity = show.transactions.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/shows"
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Shows
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{show.name}</h1>
            <Badge
              variant={
                show.status === "Active"
                  ? "success"
                  : show.status === "Cancelled"
                    ? "destructive"
                    : show.status === "Completed"
                      ? "secondary"
                      : "default"
              }
            >
              {show.status}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" />
              {format(show.startDate, "EEE, MMM d, yyyy")}
              {show.endDate ? ` – ${format(show.endDate, "MMM d")}` : ""}
            </span>
            {show.venue || show.city ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />
                {[show.venue, show.city].filter(Boolean).join(", ")}
              </span>
            ) : null}
            {show.status === "Upcoming" && days >= 0 ? (
              <span className="font-medium text-foreground">
                {days === 0 ? "Today!" : `${days} day${days === 1 ? "" : "s"} until show`}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/shows/${show.id}/edit`}>
            <Button variant="outline">
              <Pencil /> Edit
            </Button>
          </Link>
          {isActive ? <EndShowMode /> : null}
        </div>
      </div>

      {!isActive && show.status !== "Cancelled" && show.status !== "Completed" ? (
        <div className="flex flex-col gap-2">
          <EnterShowMode showId={show.id} disabled={otherShowActive} />
          {otherShowActive ? (
            <p className="text-xs text-muted-foreground">
              Show Mode is already running for “{activeShow!.name}” — end it first.
            </p>
          ) : null}
        </div>
      ) : null}

      {isActive ? (
        <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
          Show Mode is ON. Record sales, trades, and buys as usual — they attach here
          automatically.
        </p>
      ) : null}

      {/* Cash + snapshot */}
      {show.enteredAt ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cash &amp; snapshot</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 pt-0 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Buying cash" value={money(show.buyingCashCents)} />
            <Metric label="Personal cash" value={money(show.personalCashCents)} />
            <Metric label="Ending cash" value={money(show.endingCashCents)} />
            <Metric label="Inventory @ entry" value={money(show.snapshotValueCents)} />
            <Metric label="Basis @ entry" value={money(show.snapshotBasisCents)} />
            <Metric
              label="Units @ entry"
              value={show.snapshotAssetCount != null ? String(show.snapshotAssetCount) : "—"}
            />
          </CardContent>
        </Card>
      ) : null}

      {/* Summary */}
      {hasActivity || show.status === "Completed" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Show summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Revenue" value={formatUSD(summary.revenueCents)} />
              <Metric
                label="Profit (realized)"
                value={formatUSD(summary.realizedProfitCents)}
                tone={summary.realizedProfitCents >= 0 ? "success" : "destructive"}
              />
              <Metric label="Expenses" value={formatUSD(summary.expensesCents)} />
              <Metric
                label="Net profit"
                value={formatUSD(summary.netProfitCents)}
                tone={summary.netProfitCents >= 0 ? "success" : "destructive"}
              />
            </div>
            <div className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
              <Row label={`Sales (${summary.salesCount})`} value={formatUSD(summary.revenueCents)} />
              <Row label="COGS" value={formatUSD(summary.cogsCents)} />
              <Row label={`Buys (${summary.buysCount})`} value={formatUSD(summary.purchasedCents)} />
              <Row label="Buying cash used" value={formatUSD(summary.buyingCashUsedCents)} />
              <Row label={`Trades (${summary.tradesCount})`} value="" />
              <Row label="Trade value in / out" value={`${formatUSD(summary.tradeValueInCents)} / ${formatUSD(summary.tradeValueOutCents)}`} />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Inventory value gained via trades</span>
                <ProfitText cents={summary.tradeMarketDeltaCents} />
              </div>
              {summary.wheelRevenueCents > 0 || summary.wheelPrizeCostCents > 0 ? (
                <Row
                  label="Wheel revenue / prize cost"
                  value={`${formatUSD(summary.wheelRevenueCents)} / ${formatUSD(summary.wheelPrizeCostCents)}`}
                />
              ) : null}
              {summary.prizeCostCents > 0 ? (
                <Row label="Giveaway cost" value={formatUSD(summary.prizeCostCents)} />
              ) : null}
            </div>
            {/* Per-category expense breakdown lives in the dedicated Expenses card below. */}
          </CardContent>
        </Card>
      ) : null}

      {/* Show expenses — recorded as journal entries tagged to this show. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Expenses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {summary.expensesByCategory.length > 0 ? (
            <div className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
              {summary.expensesByCategory.map((e) => (
                <Row key={e.name} label={e.name} value={formatUSD(e.cents)} />
              ))}
              <div className="flex items-center justify-between border-t border-border pt-1.5 font-medium sm:col-span-2">
                <span>Total expenses</span>
                <span className="tnum">{formatUSD(summary.expensesCents)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No expenses recorded for this show yet.
            </p>
          )}
          {capitalSetUp ? (
            expenseAccounts.length > 0 && cashAccounts.length > 0 ? (
              <ShowExpenseForm
                showId={show.id}
                cashAccounts={cashAccounts}
                expenseAccounts={expenseAccounts}
                todayIso={todayIso}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No expense or cash accounts are set up yet.
              </p>
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              Set up{" "}
              <Link href="/capital/setup" className="underline">
                Capital
              </Link>{" "}
              to record show expenses in your books.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Future analytics placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-muted-foreground">Coming soon</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-0 text-sm text-muted-foreground sm:grid-cols-4">
          <span>Projected revenue</span>
          <span>Projected profit</span>
          <span>Predicted attendance</span>
          <span>Historical comparison</span>
        </CardContent>
      </Card>

      {/* Transactions at this show */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Transactions ({show.transactions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead className="text-right">Cash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {show.transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Nothing recorded at this show yet.
                  </TableCell>
                </TableRow>
              ) : (
                show.transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {format(t.date, "MMM d, h:mm a")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{txnTypeLabel(t.type)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[340px]">
                      <Link href={`/transactions/${t.id}`} className="hover:underline">
                        <span className="line-clamp-1">{summarizeTransaction(t)}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      {t.cashDeltaCents === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <ProfitText cents={t.cashDeltaCents} />
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {show.notes ? (
        <Card>
          <CardContent className="p-5 text-sm">{show.notes}</CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function money(cents: number | null): string {
  return cents != null ? formatUSD(cents) : "—";
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "destructive";
}) {
  const t =
    tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold tnum ${t}`}>{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}
