import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Money, ProfitText } from "@/components/money-text";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getReportData } from "@/lib/reports";
import { formatUSD } from "@/lib/money";

export const dynamic = "force-dynamic";

function monthLabel(m: string): string {
  const [y, mo] = m.split("-");
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
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
      <div className={`mt-1 text-xl font-semibold tnum ${t}`}>{value}</div>
    </div>
  );
}

export default async function ReportsPage() {
  const r = await getReportData();
  const maxAbs = Math.max(1, ...r.months.map((m) => Math.abs(m.profitCents)));

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Revenue, cost of goods, and real profit over time." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sales revenue" value={formatUSD(r.totals.salesProceedsCents)} />
        <StatCard label="Cost of goods sold" value={formatUSD(r.totals.cogsCents)} />
        <StatCard
          label="Realized profit"
          value={formatUSD(r.totals.realizedProfitCents)}
          tone={r.totals.realizedProfitCents >= 0 ? "success" : "destructive"}
        />
        <StatCard label="Total buy spend" value={formatUSD(r.totals.buySpendCents)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trades</CardTitle>
        </CardHeader>
        <CardContent>
          {r.tradeStats.count === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No trades recorded yet.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-4">
              <Metric label="Trades" value={String(r.tradeStats.count)} />
              <Metric label="Value acquired" value={formatUSD(r.tradeStats.valueInCents)} />
              <Metric label="Value given" value={formatUSD(r.tradeStats.valueOutCents)} />
              <Metric
                label="Inventory value gained"
                value={formatUSD(r.tradeStats.marketDeltaCents)}
                tone={r.tradeStats.marketDeltaCents >= 0 ? "success" : "destructive"}
              />
            </div>
          )}
          {r.tradeStats.count > 0 && r.tradeStats.cashDeltaCents !== 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Net cash across trades:{" "}
              <span className="tnum font-medium text-foreground">
                {formatUSD(r.tradeStats.cashDeltaCents)}
              </span>{" "}
              ({r.tradeStats.cashDeltaCents < 0 ? "paid out" : "taken in"}).
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly profit</CardTitle>
        </CardHeader>
        <CardContent>
          {r.months.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No sales or buys recorded yet.
            </p>
          ) : (
            <div className="space-y-2">
              {r.months.map((m) => {
                const pct = (Math.abs(m.profitCents) / maxAbs) * 100;
                const positive = m.profitCents >= 0;
                return (
                  <div key={m.month} className="flex items-center gap-3 text-sm">
                    <div className="w-16 shrink-0 text-muted-foreground">{monthLabel(m.month)}</div>
                    <div className="flex h-6 flex-1 items-center">
                      <div
                        className={`h-4 rounded ${positive ? "bg-success" : "bg-destructive"}`}
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    </div>
                    <div className="w-28 shrink-0 text-right">
                      <ProfitText cents={m.profitCents} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inventory by game</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Game</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Unreal.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.byGame.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      No inventory yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  r.byGame.map((g) => (
                    <TableRow key={g.game}>
                      <TableCell className="font-medium">{g.game}</TableCell>
                      <TableCell className="text-right tnum">{g.units}</TableCell>
                      <TableCell className="text-right"><Money cents={g.valueCents} /></TableCell>
                      <TableCell className="text-right"><ProfitText cents={g.unrealizedCents} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top unrealized gainers</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Unrealized</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.topGainers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                      No inventory yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  r.topGainers.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell className="max-w-[260px] truncate">
                        <Link href={`/inventory/${g.id}`} className="hover:underline">
                          {g.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right"><ProfitText cents={g.unrealizedCents} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top customers</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Transactions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.topCustomers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    No linked-customer sales yet.
                  </TableCell>
                </TableRow>
              ) : (
                r.topCustomers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-[260px] truncate">
                      <Link href={`/customers/${c.id}`} className="hover:underline">
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right"><Money cents={c.salesCents} /></TableCell>
                    <TableCell className="text-right tnum">{c.transactionCount}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
