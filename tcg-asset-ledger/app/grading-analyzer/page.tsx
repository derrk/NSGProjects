import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db";
import { listInStockAssets } from "@/lib/queries";
import { toPickable } from "@/lib/pickable";
import { AnalyzerClient, type PlayView } from "./analyzer-client";

export const dynamic = "force-dynamic";

export default async function GradingAnalyzerPage() {
  const [plays, assets] = await Promise.all([
    prisma.gradingPlay.findMany({ orderBy: { createdAt: "desc" } }),
    listInStockAssets(),
  ]);

  const views: PlayView[] = plays.map((p) => ({
    id: p.id,
    assetId: p.assetId,
    name: p.name,
    set: p.set,
    cardNumber: p.cardNumber,
    variant: p.variant,
    notes: p.notes,
    rawValueCents: p.rawValueCents,
    purchasePriceCents: p.purchasePriceCents,
    psa10Cents: p.psa10Cents,
    psa9Cents: p.psa9Cents,
    psa8Cents: p.psa8Cents,
    bgs10Cents: p.bgs10Cents,
    bgsBlackLabelCents: p.bgsBlackLabelCents,
    gemRatePct: p.gemRatePct,
    feeCents: p.feeCents,
    shippingCents: p.shippingCents,
    insuranceCents: p.insuranceCents,
    preGradingFeeCents: p.preGradingFeeCents,
    game: p.game,
    status: p.status,
    priority: p.priority,
    psa10Pop: p.psa10Pop,
    returnedGrade: p.returnedGrade,
    certNumber: p.certNumber,
    finalSalePriceCents: p.finalSalePriceCents,
    returnedAt: p.returnedAt ? p.returnedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grading Play Analyzer"
        description="Raw vs PSA 10, gem rate, EV, and ROI — your grading cheat sheet and wanted list."
      />
      <AnalyzerClient plays={views} assets={assets.map(toPickable)} />
    </div>
  );
}
