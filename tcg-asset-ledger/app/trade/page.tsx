import { PageHeader } from "@/components/page-header";
import { listInStockAssets } from "@/lib/queries";
import { listPickableCustomers } from "@/lib/customers";
import { toPickable } from "@/lib/pickable";
import { TradeForm } from "./trade-form";

export const dynamic = "force-dynamic";

export default async function TradePage({
  searchParams,
}: {
  searchParams: Promise<{ give?: string; get?: string }>;
}) {
  const { give, get } = await searchParams;
  const [assets, customers] = await Promise.all([
    listInStockAssets().then((a) => a.map(toPickable)),
    listPickableCustomers(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Record a trade"
        description="Cards (and cash) flow both ways. Cost basis carries into what you receive."
      />
      <TradeForm assets={assets} customers={customers} initialGiveId={give} initialGetId={get} />
    </div>
  );
}
