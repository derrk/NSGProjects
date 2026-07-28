import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Money, ProfitText } from "@/components/money-text";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAssets } from "@/lib/queries";
import { GAMES, ASSET_STATUSES, STATUS_LABELS, ASSET_TYPES, ASSET_TYPE_LABELS } from "@/lib/domain";
import { daysHeld, agingBucket } from "@/lib/metrics";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

const HEALTH_FILTERS = ["Healthy", "Aging", "Slow Moving", "Brick", "Normal", "Personal"] as const;

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const filters = {
    search: sp.search || undefined,
    game: sp.game || undefined,
    status: sp.status || undefined,
    assetType: sp.assetType || undefined,
  };
  const health = sp.health || undefined;
  let assets = await listAssets(filters);

  // Health filter runs on live aging math (days held is computed, not stored).
  // Every health view is scoped to OWNED stock, matching the dashboard tiles.
  if (health) {
    assets = assets.filter((a) => {
      const owned = (a.status === "InStock" || a.status === "Grading") && a.quantity > 0;
      if (!owned) return false;
      if (health === "Personal") return a.isPersonal;
      if (a.isPersonal) return false; // business health views exclude personal
      if (health === "Brick") return a.isBrick;
      if (health === "Normal") return !a.isBrick;
      const bucket = agingBucket(daysHeld(a.acquiredAt));
      if (a.isBrick) return false; // bricks live in their own view
      if (health === "Healthy") return bucket === "Healthy";
      if (health === "Aging") return bucket === "Aging";
      if (health === "Slow Moving")
        return bucket === "Slow Moving" || bucket === "Suggest Brick";
      return true;
    });
  }

  const totalValue = assets.reduce(
    (s, a) => s + (a.priceOverrideCents ?? a.marketValueCents) * a.quantity,
    0,
  );
  const totalCost = assets.reduce((s, a) => s + a.costBasisCents * a.quantity, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Every asset you own, its cost basis, and current market value."
        actions={
          <Link href="/inventory/new" className={cn(buttonVariants())}>
            <Plus /> Add asset
          </Link>
        }
      />

      <Card>
        <CardContent className="p-4">
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" method="get">
            <div className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="search"
                placeholder="Search name, set, or card #"
                defaultValue={filters.search ?? ""}
                className="pl-8"
              />
            </div>
            <Select name="game" defaultValue={filters.game ?? ""}>
              <option value="">All games</option>
              {GAMES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </Select>
            <Select name="status" defaultValue={filters.status ?? ""}>
              <option value="">Any status</option>
              {ASSET_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </Select>
            <Select name="health" defaultValue={health ?? ""}>
              <option value="">Any health</option>
              {HEALTH_FILTERS.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </Select>
            <div className="flex gap-2">
              <Select name="assetType" defaultValue={filters.assetType ?? ""}>
                <option value="">All types</option>
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>{ASSET_TYPE_LABELS[t]}</option>
                ))}
              </Select>
              <Button type="submit" variant="secondary">Filter</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span>{assets.length} lot(s)</span>
        <span>·</span>
        <span>Market value <Money cents={totalValue} className="font-medium text-foreground" /></span>
        <span>·</span>
        <span>Cost basis <Money cents={totalCost} className="font-medium text-foreground" /></span>
        <span>·</span>
        <span>Unrealized <ProfitText cents={totalValue - totalCost} /></span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Game / Set</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Market</TableHead>
                <TableHead className="text-right">Unreal.</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No assets match. Try clearing filters, adding an asset, or importing from Collectr.
                  </TableCell>
                </TableRow>
              ) : (
                assets.map((a) => {
                  const market = a.priceOverrideCents ?? a.marketValueCents;
                  const unreal = (market - a.costBasisCents) * a.quantity;
                  const days = daysHeld(a.acquiredAt);
                  const bucket = agingBucket(days);
                  const owned =
                    (a.status === "InStock" || a.status === "Grading") && a.quantity > 0;
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Link href={`/inventory/${a.id}`} className="font-medium hover:underline">
                          {a.name}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          {a.cardNumber ? <span>#{a.cardNumber}</span> : null}
                          {a.grade && a.grade !== "Ungraded" ? (
                            <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                              {a.grade}
                            </Badge>
                          ) : null}
                          {a.variant ? <span>{a.variant}</span> : null}
                          {a.isPersonal ? (
                            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                              Personal
                            </Badge>
                          ) : null}
                          {owned && !a.isPersonal && a.isBrick ? (
                            <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                              Brick
                            </Badge>
                          ) : owned && !a.isPersonal && bucket !== "Healthy" ? (
                            <Badge
                              variant={bucket === "Aging" ? "muted" : "warning"}
                              className="px-1.5 py-0 text-[10px]"
                            >
                              {days}d · {bucket}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{a.game}</div>
                        <div className="text-xs text-muted-foreground">{a.set ?? "—"}</div>
                      </TableCell>
                      <TableCell className="text-right tnum">{a.quantity}</TableCell>
                      <TableCell className="text-right"><Money cents={a.costBasisCents} /></TableCell>
                      <TableCell className="text-right"><Money cents={market} /></TableCell>
                      <TableCell className="text-right"><ProfitText cents={unreal} /></TableCell>
                      <TableCell><StatusBadge status={a.status} /></TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
