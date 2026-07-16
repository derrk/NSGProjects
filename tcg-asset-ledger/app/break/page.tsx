import { PageHeader } from "@/components/page-header";
import { listInStockAssets } from "@/lib/queries";
import { toPickable } from "@/lib/pickable";
import { BreakForm } from "./break-form";

export const dynamic = "force-dynamic";

export default async function BreakPage() {
  const assets = (await listInStockAssets()).map(toPickable);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Break sealed product"
        description="Turn a box or pack into singles. Its cost basis is spread across what comes out."
      />
      <BreakForm assets={assets} />
    </div>
  );
}
