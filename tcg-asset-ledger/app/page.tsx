import Link from "next/link";
import { format } from "date-fns";
import {
  Boxes,
  TrendingUp,
  Wallet,
  DollarSign,
  ShoppingCart,
  Tags,
  ArrowLeftRight,
  Upload,
  ListChecks,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ProfitText } from "@/components/money-text";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDashboardMetrics, getInventoryHealth, listTransactions } from "@/lib/queries";
import { countPendingSyncTasks } from "@/lib/sync-backlog";
import { formatUSD } from "@/lib/money";
import { summarizeTransaction, txnTypeLabel } from "@/lib/txn-format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const QUICK = [
  { href: "/buy", label: "Buy", icon: ShoppingCart },
  { href: "/sell", label: "Sell", icon: Tags },
  { href: "/trade", label: "Trade", icon: ArrowLeftRight },
  { href: "/import", label: "Import", icon: Upload },
];

export default async function DashboardPage() {
  const [m, health, txns, syncPending] = await Promise.all([
    getDashboardMetrics(),
    getInventoryHealth(),
    listTransactions(8),
    countPendingSyncTasks(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Your inventory, cost basis, and real profit at a glance."
        actions={
          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => {
              const Icon = q.icon;
              return (
                <Link
                  key={q.href}
                  href={q.href}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  <Icon /> {q.label}
                </Link>
              );
            })}
          </div>
        }
      />

      {syncPending > 0 ? (
        <Link
          href="/sync"
          className="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm transition-colors hover:bg-warning/15"
        >
          <ListChecks className="size-4 shrink-0 text-warning" />
          <span>
            <span className="font-medium">
              {syncPending} change{syncPending === 1 ? "" : "s"}
            </span>{" "}
            recorded here still need{syncPending === 1 ? "s" : ""} to be updated in Collectr — view
            the backlog.
          </span>
        </Link>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Inventory value"
          value={formatUSD(m.inventoryValueCents)}
          hint={`${m.inStockUnits} units · ${m.inStockCount} lots in stock`}
          icon={Boxes}
        />
        <StatCard
          label="Cost basis"
          value={formatUSD(m.inventoryCostCents)}
          hint="What your in-stock inventory cost you"
          icon={Wallet}
        />
        <StatCard
          label="Unrealized gain"
          value={formatUSD(m.unrealizedCents)}
          hint="Market value minus cost basis"
          tone={m.unrealizedCents >= 0 ? "success" : "destructive"}
          icon={TrendingUp}
        />
        <StatCard
          label="Realized profit"
          value={formatUSD(m.realizedProfitCents)}
          hint={`${formatUSD(m.salesProceedsCents)} in sales`}
          tone={m.realizedProfitCents >= 0 ? "success" : "destructive"}
          icon={DollarSign}
        />
      </div>

      {/* Inventory health */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Inventory health</CardTitle>
            <span className="text-xs text-muted-foreground">
              Avg {health.avgDaysHeld} days held
            </span>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 pt-0 sm:grid-cols-3">
            <HealthStat
              label="Healthy"
              count={health.healthyCount}
              value={health.healthyValueCents}
              tone="text-success"
              href="/inventory?health=Healthy"
            />
            <HealthStat
              label="Aging"
              count={health.agingCount}
              value={health.agingValueCents}
              tone="text-muted-foreground"
              href="/inventory?health=Aging"
            />
            <HealthStat
              label="Slow moving"
              count={health.slowCount}
              value={health.slowValueCents}
              tone="text-warning"
              href="/inventory?health=Slow+Moving"
            />
            <HealthStat
              label="Grading"
              count={health.gradingCount}
              tone="text-muted-foreground"
              href="/inventory?status=Grading"
            />
            <HealthStat
              label="Sold this month"
              count={health.soldThisMonthCount}
              value={health.soldThisMonthCents}
              tone="text-success"
              href="/transactions"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Brick inventory</CardTitle>
            {health.suggestBrickCount > 0 ? (
              <Link
                href="/inventory?health=Slow+Moving"
                className="text-xs font-medium text-warning hover:underline"
              >
                {health.suggestBrickCount} suggestion{health.suggestBrickCount === 1 ? "" : "s"}
              </Link>
            ) : null}
          </CardHeader>
          <CardContent className="pt-0">
            {health.brickCount === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No bricks flagged. Anything sitting 90+ days will show a suggestion.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md border border-border p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Bricks
                  </div>
                  <div className="mt-1 text-xl font-semibold tnum">{health.brickCount}</div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Market value
                  </div>
                  <div className="mt-1 text-xl font-semibold tnum">
                    {formatUSD(health.brickValueCents)}
                  </div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Capital locked
                  </div>
                  <div className="mt-1 text-xl font-semibold tnum text-warning">
                    {formatUSD(health.brickBasisCents)}
                  </div>
                </div>
                <Link
                  href="/inventory?health=Brick"
                  className="col-span-3 text-center text-xs text-muted-foreground hover:underline"
                >
                  View bricks — discount, trade, or send to Whatnot
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Recent activity</CardTitle>
          <Link
            href="/transactions"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            View full ledger
          </Link>
        </CardHeader>
        <CardContent className="pt-0">
          {txns.length === 0 ? (
            <EmptyState />
          ) : (
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
                {txns.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {format(t.date, "MMM d")}
                    </TableCell>
                    <TableCell>
                      <Link href={`/transactions/${t.id}`} className="hover:underline">
                        <Badge variant="outline">{txnTypeLabel(t.type)}</Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[420px] truncate">
                      {summarizeTransaction(t)}
                    </TableCell>
                    <TableCell className="text-right">
                      {t.cashDeltaCents === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <ProfitText cents={t.cashDeltaCents} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function HealthStat({
  label,
  count,
  value,
  tone,
  href,
}: {
  label: string;
  count: number;
  value?: number;
  tone: string;
  href: string;
}) {
  return (
    <Link href={href} className="rounded-md border border-border p-3 transition-colors hover:bg-accent/40">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold tnum ${tone}`}>{count}</div>
      {value !== undefined ? (
        <div className="text-xs text-muted-foreground tnum">{formatUSD(value)}</div>
      ) : null}
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-sm text-muted-foreground">
        No transactions yet. Import your Collectr export or record your first buy.
      </p>
      <div className="flex gap-2">
        <Link href="/import" className={cn(buttonVariants({ size: "sm" }))}>
          Import from Collectr
        </Link>
        <Link href="/buy" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Record a buy
        </Link>
      </div>
    </div>
  );
}
