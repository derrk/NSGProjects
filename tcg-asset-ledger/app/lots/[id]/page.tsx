import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { listInStockAssets } from "@/lib/queries";
import { toPickable } from "@/lib/pickable";
import { getSaleLot } from "@/lib/sale-lots";
import { LotDetail, type LotView } from "./lot-detail";

export const dynamic = "force-dynamic";

export default async function LotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lot = await getSaleLot(id);
  if (!lot) notFound();

  const inStock = (await listInStockAssets()).map(toPickable);
  const inLot = new Set(lot.items.map((i) => i.assetId));
  const assets = inStock.filter((a) => !inLot.has(a.id));

  const view: LotView = {
    id: lot.id,
    name: lot.name,
    source: lot.source,
    status: lot.status,
    grossCents: lot.grossCents,
    netCents: lot.netCents,
    saleTransactionId: lot.saleTransactionId,
    items: lot.items.map((it) => ({
      id: it.id,
      assetId: it.assetId,
      name: it.asset.name,
      subtitle: [it.asset.set, it.asset.cardNumber ? `#${it.asset.cardNumber}` : null, it.asset.variant].filter(Boolean).join(" · "),
      basisCents: it.asset.costBasisCents,
      marketCents: it.asset.priceOverrideCents ?? it.asset.marketValueCents,
      quantity: it.quantity,
    })),
    totalBasisCents: lot.econ.totalBasisCents,
    totalMarketCents: lot.econ.totalMarketCents,
    unitCount: lot.econ.unitCount,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={lot.name}
        description="Stage the cards, then enter the gross and net payout to settle the whole lot as one sale."
      />
      <LotDetail lot={view} assets={assets} />
    </div>
  );
}
