import { PageHeader } from "@/components/page-header";
import { listInStockAssets } from "@/lib/queries";
import { toPickable } from "@/lib/pickable";
import { SellForm } from "./sell-form";

export const dynamic = "force-dynamic";

export default async function SellPage() {
  const assets = (await listInStockAssets()).map(toPickable);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Record a sale"
        description="Cards out, cash in. Realized profit = proceeds minus cost basis."
      />
      <SellForm assets={assets} />
    </div>
  );
}
