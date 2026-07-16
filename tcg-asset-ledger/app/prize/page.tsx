import { PageHeader } from "@/components/page-header";
import { listInStockAssets } from "@/lib/queries";
import { toPickable } from "@/lib/pickable";
import { PrizeForm } from "./prize-form";

export const dynamic = "force-dynamic";

export default async function PrizePage() {
  const assets = (await listInStockAssets()).map(toPickable);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Give as prize"
        description="Remove an item from inventory as a giveaway or prize. Its basis is written off."
      />
      <PrizeForm assets={assets} />
    </div>
  );
}
