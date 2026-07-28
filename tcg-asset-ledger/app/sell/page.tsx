import { PageHeader } from "@/components/page-header";
import { listInStockAssets } from "@/lib/queries";
import { listPickableCustomers } from "@/lib/customers";
import { toPickable } from "@/lib/pickable";
import { SellForm } from "./sell-form";

export const dynamic = "force-dynamic";

export default async function SellPage() {
  const [assets, customers] = await Promise.all([
    listInStockAssets().then((a) => a.map(toPickable)),
    listPickableCustomers(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Record a sale"
        description="Cards out, cash in. Realized profit = proceeds minus cost basis."
      />
      <SellForm assets={assets} customers={customers} />
    </div>
  );
}
