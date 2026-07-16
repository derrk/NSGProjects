import { PageHeader } from "@/components/page-header";
import { listInStockAssets } from "@/lib/queries";
import { toPickable } from "@/lib/pickable";
import { TradeForm } from "./trade-form";

export const dynamic = "force-dynamic";

export default async function TradePage() {
  const assets = (await listInStockAssets()).map(toPickable);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Record a trade"
        description="Cards (and cash) flow both ways. Cost basis carries into what you receive."
      />
      <TradeForm assets={assets} />
    </div>
  );
}
