import Link from "next/link";
import { TrendingUp, PackageOpen } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Money, ProfitText } from "@/components/money-text";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getInvestmentPortfolio } from "@/lib/investments";
import { daysHeld } from "@/lib/metrics";
import { PortfolioChart } from "./portfolio-chart";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage() {
  const p = await getInvestmentPortfolio();
  const roi = p.roiPct;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Investments"
        description="Cards held to appreciate — capital tied up in a portfolio, kept out of your show-available sell inventory. Mark any owned card as an investment from its inventory page."
      />

      {p.lotCount === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <TrendingUp className="size-6" />
            </div>
            <div className="text-lg font-semibold">No investment holds yet</div>
            <p className="max-w-md text-sm text-muted-foreground">
              Open any owned card in{" "}
              <Link href="/inventory" className="underline hover:text-foreground">
                Inventory
              </Link>{" "}
              and switch its holding type to <span className="font-medium">Investment</span>. It
              keeps its cost basis, drops out of your show/sell totals, and starts tracking here as
              a portfolio.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary tiles */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Cost basis" value={<Money cents={p.totalCostCents} />} />
            <Tile label="Market value" value={<Money cents={p.totalMarketCents} />} />
            <Tile
              label="Unrealized"
              value={<ProfitText cents={p.unrealizedCents} />}
              sub={roi !== null ? `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}% ROI` : undefined}
              subTone={p.unrealizedCents >= 0 ? "success" : "destructive"}
            />
            <Tile
              label="Holdings"
              value={`${p.lotCount} lot${p.lotCount === 1 ? "" : "s"}`}
              sub={`${p.unitCount} unit${p.unitCount === 1 ? "" : "s"}`}
            />
          </div>

          {/* Value over time */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Portfolio value over time</CardTitle>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 rounded bg-sky-500" /> Market
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 rounded border-t-2 border-dashed border-muted-foreground" />{" "}
                  Cost basis
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {p.history.length <= 1 ? (
                <div className="space-y-3">
                  <PortfolioChart points={p.history} />
                  <p className="text-center text-xs text-muted-foreground">
                    The curve fills in over time — a point is recorded each day you visit and after
                    every Collectr price import.
                  </p>
                </div>
              ) : (
                <PortfolioChart points={p.history} />
              )}
            </CardContent>
          </Card>

          {/* Best / worst */}
          {p.bestGainer || p.worstLot ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {p.bestGainer ? (
                <Highlight label="Top gainer" lotName={p.bestGainer.name} cents={p.bestGainer.unrealizedCents} roi={p.bestGainer.roiPct} />
              ) : null}
              {p.worstLot && p.worstLot.id !== p.bestGainer?.id ? (
                <Highlight label="Biggest laggard" lotName={p.worstLot.name} cents={p.worstLot.unrealizedCents} roi={p.worstLot.roiPct} />
              ) : null}
            </div>
          ) : null}

          {/* Holdings table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Holdings</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Card</TableHead>
                    <TableHead>Game / Set</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Cost basis</TableHead>
                    <TableHead className="text-right">Market</TableHead>
                    <TableHead className="text-right">Unrealized</TableHead>
                    <TableHead className="text-right">ROI</TableHead>
                    <TableHead className="text-right">Held</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {p.lots.map((l) => {
                    const heldSince = l.investmentMarkedAt ?? l.acquiredAt;
                    return (
                      <TableRow key={l.id}>
                        <TableCell>
                          <Link href={`/inventory/${l.id}`} className="font-medium hover:underline">
                            {l.name}
                          </Link>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            {l.cardNumber ? <span>#{l.cardNumber}</span> : null}
                            {l.grade && l.grade !== "Ungraded" ? (
                              <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                                {l.grade}
                              </Badge>
                            ) : null}
                            {l.status === "Grading" ? (
                              <Badge variant="muted" className="px-1.5 py-0 text-[10px]">
                                At grading
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{l.game}</div>
                          <div className="text-xs text-muted-foreground">{l.set ?? "—"}</div>
                        </TableCell>
                        <TableCell className="text-right tnum">{l.quantity}</TableCell>
                        <TableCell className="text-right"><Money cents={l.totalCostCents} /></TableCell>
                        <TableCell className="text-right"><Money cents={l.totalMarketCents} /></TableCell>
                        <TableCell className="text-right"><ProfitText cents={l.unrealizedCents} /></TableCell>
                        <TableCell className="text-right tnum">
                          {l.roiPct !== null ? `${l.roiPct >= 0 ? "+" : ""}${l.roiPct.toFixed(0)}%` : "—"}
                        </TableCell>
                        <TableCell className="text-right tnum text-muted-foreground">
                          {heldSince ? `${daysHeld(heldSince)}d` : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <PackageOpen className="size-3.5" />
            Sell an investment any time from the{" "}
            <Link href="/sell" className="underline hover:text-foreground">Sell</Link> or{" "}
            <Link href="/sell-planner" className="underline hover:text-foreground">Sell Planner</Link>{" "}
            pages — the realized gain books to the ledger like any other sale.
          </p>
        </>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  subTone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  subTone?: "default" | "success" | "destructive";
}) {
  const tone =
    subTone === "success" ? "text-success" : subTone === "destructive" ? "text-destructive" : "text-muted-foreground";
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tnum">{value}</div>
        {sub ? <div className={`mt-0.5 text-xs font-medium ${tone}`}>{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

function Highlight({
  label,
  lotName,
  cents,
  roi,
}: {
  label: string;
  lotName: string;
  cents: number;
  roi: number | null;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-0.5 font-medium">{lotName}</div>
        </div>
        <div className="text-right">
          <ProfitText cents={cents} className="text-lg font-semibold" />
          {roi !== null ? (
            <div className="text-xs text-muted-foreground">{roi >= 0 ? "+" : ""}{roi.toFixed(0)}%</div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
