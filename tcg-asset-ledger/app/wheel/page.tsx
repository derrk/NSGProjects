import Link from "next/link";
import { format } from "date-fns";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
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
import { formatUSD } from "@/lib/money";
import { listInStockAssets } from "@/lib/queries";
import { toPickable } from "@/lib/pickable";
import { getWheelStats, getWheelSlots, getRecentSpins } from "@/lib/wheel";
import { WheelSessionForm } from "./session-form";
import { SlotManager } from "./slot-manager";

export const dynamic = "force-dynamic";

export default async function WheelPage() {
  const [stats, allSlots, recent, assets] = await Promise.all([
    getWheelStats(),
    getWheelSlots(),
    getRecentSpins(),
    listInStockAssets(),
  ]);
  const activeSlots = allSlots.filter((s) => s.active);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prize wheel"
        description="Tiers: 1 spin $10 · 3 spins $25 · 5 spins $40. Every spin logs its slot, revenue share, and prize cost."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Total spins" value={String(stats.totalSpins)} />
        <Stat label="Revenue" value={formatUSD(stats.revenueCents)} />
        <Stat label="Prize cost" value={formatUSD(stats.prizeCostCents)} />
        <Stat
          label="Wheel profit"
          value={formatUSD(stats.profitCents)}
          tone={stats.profitCents >= 0 ? "success" : "destructive"}
        />
      </div>

      {stats.totalSessions > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sessions by tier</CardTitle>
            <p className="text-sm text-muted-foreground">
              Backfilling sanity check: avg/session should sit near $10 · $25 · $40 for the
              1 / 3 / 5 tiers.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">Spins</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Avg / session</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.tiers.map((t) => {
                  const expected = { 1: 10_00, 3: 25_00, 5: 40_00 }[t.spinsPerSession];
                  return (
                    <TableRow key={t.spinsPerSession}>
                      <TableCell>
                        {t.spinsPerSession} spin{t.spinsPerSession === 1 ? "" : "s"}
                        {expected ? (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            (${expected / 100} tier)
                          </span>
                        ) : (
                          <Badge variant="outline" className="ml-1.5">custom</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tnum">{t.sessions}</TableCell>
                      <TableCell className="text-right tnum">{t.spins}</TableCell>
                      <TableCell className="text-right tnum">{formatUSD(t.revenueCents)}</TableCell>
                      <TableCell className="text-right tnum">
                        <span
                          className={
                            expected && Math.abs(t.avgPerSessionCents - expected) > 100
                              ? "text-warning"
                              : ""
                          }
                        >
                          {formatUSD(t.avgPerSessionCents)}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow>
                  <TableCell className="font-medium">All sessions</TableCell>
                  <TableCell className="text-right tnum font-medium">{stats.totalSessions}</TableCell>
                  <TableCell className="text-right tnum font-medium">{stats.totalSpins}</TableCell>
                  <TableCell className="text-right tnum font-medium">
                    {formatUSD(stats.revenueCents)}
                  </TableCell>
                  <TableCell className="text-right tnum text-muted-foreground">
                    {formatUSD(stats.avgRevenuePerSpinCents)}/spin
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <WheelSessionForm
          slots={activeSlots.map((s) => ({
            id: s.id,
            label: s.label,
            estCostCents: s.estCostCents,
          }))}
          assets={assets.map(toPickable)}
        />
        <SlotManager
          slots={allSlots.map((s) => ({
            id: s.id,
            label: s.label,
            estCostCents: s.estCostCents,
            active: s.active,
          }))}
        />
      </div>

      {stats.totalSpins > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Slot performance</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Slot</TableHead>
                  <TableHead className="text-right">Hits</TableHead>
                  <TableHead className="text-right">Hit rate</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Prize cost</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.slots
                  .filter((s) => s.hits > 0 || s.active)
                  .map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        {s.label}
                        {!s.active ? (
                          <Badge variant="outline" className="ml-2">retired</Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tnum">{s.hits}</TableCell>
                      <TableCell className="text-right tnum">
                        {s.hitRatePct === null ? "—" : `${s.hitRatePct.toFixed(1)}%`}
                      </TableCell>
                      <TableCell className="text-right tnum">{formatUSD(s.revenueCents)}</TableCell>
                      <TableCell className="text-right tnum">{formatUSD(s.prizeCostCents)}</TableCell>
                      <TableCell className="text-right">
                        <ProfitText cents={s.netCents} />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {stats.shows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By show</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Show</TableHead>
                  <TableHead className="text-right">Spins</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Prize cost</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.shows.map((s) => (
                  <TableRow key={s.showId ?? "none"}>
                    <TableCell>
                      {s.showId ? (
                        <Link href={`/shows/${s.showId}`} className="hover:underline">
                          {s.showName}
                        </Link>
                      ) : (
                        s.showName
                      )}
                    </TableCell>
                    <TableCell className="text-right tnum">{s.spins}</TableCell>
                    <TableCell className="text-right tnum">{formatUSD(s.revenueCents)}</TableCell>
                    <TableCell className="text-right tnum">{formatUSD(s.prizeCostCents)}</TableCell>
                    <TableCell className="text-right">
                      <ProfitText cents={s.netCents} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {recent.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent spins</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-border text-sm">
              {recent.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground tnum">{format(s.date, "MMM d")}</span>
                    <Badge variant="outline">{s.slot.label}</Badge>
                    {s.asset ? (
                      <Link href={`/inventory/${s.asset.id}`} className="hover:underline">
                        {s.asset.name}
                        {s.quantity > 1 ? ` ×${s.quantity}` : ""}
                      </Link>
                    ) : null}
                    {s.show ? (
                      <span className="text-xs text-muted-foreground">@ {s.show.name}</span>
                    ) : null}
                  </span>
                  <span className="tnum text-muted-foreground">
                    +{formatUSD(s.revenueCents)} / −{formatUSD(s.prizeCostCents)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({
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
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tnum ${t}`}>{value}</div>
    </div>
  );
}
