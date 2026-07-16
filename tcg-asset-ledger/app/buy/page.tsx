import { PageHeader } from "@/components/page-header";
import { listInStockAssets } from "@/lib/queries";
import { toPickable } from "@/lib/pickable";
import { BuyForm } from "./buy-form";

export const dynamic = "force-dynamic";

export default async function BuyPage() {
  const assets = (await listInStockAssets()).map(toPickable);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Record a buy"
        description="Cash out, cards in. Cost basis is set from what you paid."
      />
      <BuyForm assets={assets} />
    </div>
  );
}
