import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Pencil, Camera } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Money, ProfitText } from "@/components/money-text";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAssetWithHistory, getGradingSubmissions } from "@/lib/queries";
import { ASSET_TYPE_LABELS, type AssetType } from "@/lib/domain";
import { txnTypeLabel } from "@/lib/txn-format";
import { computeAssetMetrics } from "@/lib/metrics";
import { formatUSD } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AssetActions } from "./asset-actions";
import { SendToGrading, GradingReturned } from "./grading-panel";
import { BrickControls } from "./brick-toggle";

export const dynamic = "force-dynamic";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getAssetWithHistory(id);
  if (!data) notFound();
  const { asset, lines } = data;
  const submissions = await getGradingSubmissions(id);
  const openSubmission = submissions.find((s) => s.status === "Out") ?? null;
  const lastReturned = submissions.find((s) => s.status === "Returned") ?? null;

  const market = asset.priceOverrideCents ?? asset.marketValueCents;
  const unreal = (market - asset.costBasisCents) * asset.quantity;
  const metrics = computeAssetMetrics({
    acquiredAt: asset.acquiredAt,
    quantity: asset.quantity,
    costBasisCents: asset.costBasisCents,
    marketValueCents: asset.marketValueCents,
    priceOverrideCents: asset.priceOverrideCents,
    isBrick: asset.isBrick,
    lines: lines.map((l) => ({
      direction: l.direction,
      transaction: { id: l.transaction.id, type: l.transaction.type },
    })),
  });
  const owned = (asset.status === "InStock" || asset.status === "Grading") && asset.quantity > 0;

  const facts: { label: string; value: React.ReactNode }[] = [
    { label: "Game", value: asset.game },
    { label: "Type", value: ASSET_TYPE_LABELS[asset.assetType as AssetType] ?? asset.assetType },
    { label: "Set", value: asset.set ?? "—" },
    { label: "Card #", value: asset.cardNumber ?? "—" },
    { label: "Rarity", value: asset.rarity ?? "—" },
    { label: "Variant", value: asset.variant ?? "—" },
    { label: "Grade", value: asset.grade ?? "—" },
    { label: "Condition", value: asset.condition ?? "—" },
    ...(asset.certNumber
      ? [
          { label: "Cert #", value: asset.certNumber },
          { label: "Graded by", value: asset.gradingCompany ?? "—" },
        ]
      : []),
    { label: "Location", value: asset.location ?? "—" },
    { label: "Source", value: asset.source ?? "—" },
    { label: "Portfolio", value: asset.portfolio ?? "—" },
    {
      label: "Market as of",
      value: asset.marketPriceAsOf ? format(asset.marketPriceAsOf, "MMM d, yyyy") : "—",
    },
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/inventory"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to inventory
      </Link>

      <PageHeader
        title={asset.name}
        description={[asset.set, asset.cardNumber && `#${asset.cardNumber}`]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={asset.status} />
            <Link
              href={`/inventory/${asset.id}/edit`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <Pencil /> Edit
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Quantity</div>
            <div className="mt-1 text-2xl font-semibold tnum">{asset.quantity}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Cost basis / unit</div>
            <div className="mt-1 text-2xl font-semibold tnum"><Money cents={asset.costBasisCents} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Market / unit</div>
            <div className="mt-1 text-2xl font-semibold tnum"><Money cents={market} /></div>
            {asset.priceOverrideCents != null ? (
              <div className="mt-1 text-xs text-muted-foreground">override applied</div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Unrealized</div>
            <div className="mt-1 text-2xl font-semibold"><ProfitText cents={unreal} /></div>
          </CardContent>
        </Card>
      </div>

      {/* Brick flag + aging suggestion (owned stock only) */}
      {owned ? (
        <BrickControls
          assetId={asset.id}
          isBrick={asset.isBrick}
          daysHeld={metrics.daysHeld}
          suggest={metrics.suggestBrick}
        />
      ) : null}

      {/* Asset metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metrics</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-0 sm:grid-cols-3 lg:grid-cols-6">
          <MetricBox
            label="Days held"
            value={`${metrics.daysHeld}`}
            sub={metrics.aging}
            subTone={
              metrics.aging === "Healthy"
                ? "success"
                : metrics.aging === "Suggest Brick"
                  ? "destructive"
                  : "warning"
            }
          />
          <MetricBox label="Trades" value={String(metrics.tradesCount)} />
          <MetricBox label="Times moved" value={String(metrics.timesMoved)} />
          <MetricBox
            label="Margin"
            value={metrics.marginPct !== null ? `${metrics.marginPct.toFixed(0)}%` : "—"}
          />
          <MetricBox
            label="ROI"
            value={metrics.roiPct !== null ? `${metrics.roiPct.toFixed(0)}%` : "—"}
          />
          <MetricBox
            label="Annualized"
            value={
              metrics.annualizedRoiPct !== null ? `${metrics.annualizedRoiPct.toFixed(0)}%` : "—"
            }
          />
        </CardContent>
      </Card>

      {/* Grading workflow */}
      {openSubmission ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Out for grading — {openSubmission.company}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
              <FactRow label="Submitted" value={format(openSubmission.submittedAt, "MMM d, yyyy")} />
              <FactRow
                label="Expected back"
                value={
                  openSubmission.expectedReturnAt
                    ? format(openSubmission.expectedReturnAt, "MMM d, yyyy")
                    : "—"
                }
              />
              <FactRow label="Service level" value={openSubmission.serviceLevel ?? "—"} />
              <FactRow
                label="Costs (into basis)"
                value={formatUSD(
                  openSubmission.shippingCents +
                    openSubmission.insuranceCents +
                    openSubmission.feeCents,
                )}
              />
            </div>
            <GradingReturned
              submissionId={openSubmission.id}
              company={openSubmission.company}
              marketCents={market}
            />
          </CardContent>
        </Card>
      ) : null}

      {lastReturned && lastReturned.marketValueAtSubmitCents != null ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Grading ROI — {lastReturned.grade ?? "returned"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-8 gap-y-1.5 pt-0 text-sm sm:grid-cols-2">
            <FactRow label="Raw value at submit" value={formatUSD(lastReturned.marketValueAtSubmitCents)} />
            <FactRow label="Basis before grading" value={`${formatUSD(lastReturned.basisBeforeCents ?? 0)}/u`} />
            <FactRow
              label="Grading cost"
              value={formatUSD(
                lastReturned.shippingCents + lastReturned.insuranceCents + lastReturned.feeCents,
              )}
            />
            <FactRow label="New cost basis" value={`${formatUSD(asset.costBasisCents)}/u`} />
            <FactRow
              label={`Value as ${lastReturned.grade ?? "graded"}`}
              value={`${formatUSD(lastReturned.marketValueAtReturnCents ?? market)}/u`}
            />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Unrealized profit</span>
              <ProfitText
                cents={((lastReturned.marketValueAtReturnCents ?? market) - asset.costBasisCents) * asset.quantity}
              />
            </div>
            <FactRow
              label="ROI on this card"
              value={
                asset.costBasisCents > 0
                  ? `${((((lastReturned.marketValueAtReturnCents ?? market) - asset.costBasisCents) / asset.costBasisCents) * 100).toFixed(0)}%`
                  : "—"
              }
            />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {facts.map((f) => (
                <div key={f.label}>
                  <dt className="text-xs text-muted-foreground">{f.label}</dt>
                  <dd className="font-medium">{f.value}</dd>
                </div>
              ))}
            </dl>
            {asset.notes ? (
              <div className="mt-4 rounded-md bg-muted p-3 text-sm">{asset.notes}</div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Transaction papertrail</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {lines.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No ledger activity yet. This asset was added manually or imported.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Flow</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Value/u</TableHead>
                    <TableHead className="text-right">Basis/u</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {format(l.transaction.date, "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/transactions/${l.transactionId}`}
                          className="inline-flex items-center gap-1.5 hover:underline"
                        >
                          <Badge variant="outline">{txnTypeLabel(l.transaction.type)}</Badge>
                          {l.transaction.attachments.length > 0 ? (
                            <Camera className="size-3.5 text-muted-foreground" />
                          ) : null}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={l.direction === "IN" ? "success" : "muted"}>
                          {l.direction === "IN" ? "In" : "Out"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tnum">{l.quantity}</TableCell>
                      <TableCell className="text-right"><Money cents={l.unitValueCents} /></TableCell>
                      <TableCell className="text-right"><Money cents={l.unitBasisCents} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {asset.status === "InStock" && asset.quantity > 0 && !openSubmission ? (
        <SendToGrading
          assetId={asset.id}
          quantity={asset.quantity}
          basisCents={asset.costBasisCents}
        />
      ) : null}

      <AssetActions
        assetId={asset.id}
        quantity={asset.quantity}
        marketValueCents={market}
        hasHistory={lines.length > 0}
      />
    </div>
  );
}

function MetricBox({
  label,
  value,
  sub,
  subTone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  subTone?: "default" | "success" | "warning" | "destructive";
}) {
  const tone =
    subTone === "success"
      ? "text-success"
      : subTone === "warning"
        ? "text-warning"
        : subTone === "destructive"
          ? "text-destructive"
          : "text-muted-foreground";
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tnum">{value}</div>
      {sub ? <div className={`text-xs font-medium ${tone}`}>{sub}</div> : null}
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}
