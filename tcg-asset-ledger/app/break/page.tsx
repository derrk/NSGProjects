import Link from "next/link";
import { format } from "date-fns";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PackageOpen, TrendingUp, Sparkles } from "lucide-react";
import { listInStockAssets } from "@/lib/queries";
import { toPickable } from "@/lib/pickable";
import { formatUSD } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getRipHistory } from "@/lib/rips";
import { BreakForm } from "./break-form";

export const dynamic = "force-dynamic";

export default async function BreakPage() {
  const [assets, history] = await Promise.all([
    listInStockAssets().then((a) => a.map(toPickable)),
    getRipHistory(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Break / Rip sealed product"
        description="Open a box or pack into singles. The sealed's cost basis spreads across what you pull, and you'll see if the rip paid off."
      />
      <BreakForm assets={assets} />

      {history.count > 0 ? (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Your rips</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Sealed opened" value={String(history.count)} hint={`${history.paidOffCount} paid off`} icon={PackageOpen} />
            <StatCard label="Spent ripping" value={formatUSD(history.totalCostCents)} hint="Cost basis opened" icon={PackageOpen} />
            <StatCard label="Value pulled" value={formatUSD(history.totalPulledCents)} hint="Market value of pulls" icon={Sparkles} />
            <StatCard
              label="Net"
              value={`${history.totalNetCents >= 0 ? "+" : "−"}${formatUSD(Math.abs(history.totalNetCents))}`}
              hint={history.totalNetCents >= 0 ? "Ripping is up!" : "The fun tax"}
              icon={TrendingUp}
              tone={history.totalNetCents >= 0 ? "success" : "destructive"}
            />
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Rip history</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Sealed</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Pulled</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.rips.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{format(r.date, "MMM d, yyyy")}</TableCell>
                      <TableCell className="max-w-[280px] truncate">
                        <Link href={`/transactions/${r.id}`} className="hover:underline">{r.sealedName}</Link>
                        <span className="ml-1 text-xs text-muted-foreground">· {r.pullCount} pulls</span>
                      </TableCell>
                      <TableCell className="text-right tnum text-muted-foreground">{formatUSD(r.costCents)}</TableCell>
                      <TableCell className="text-right tnum">{formatUSD(r.pulledValueCents)}</TableCell>
                      <TableCell className={cn("text-right tnum font-semibold", r.netCents >= 0 ? "text-success" : "text-destructive")}>
                        {r.netCents >= 0 ? "+" : "−"}{formatUSD(Math.abs(r.netCents))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
