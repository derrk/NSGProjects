import { PageHeader } from "@/components/page-header";
import { listInStockAssets } from "@/lib/queries";
import { SellPlannerClient, type PlannerCard } from "./sell-planner-client";

export const dynamic = "force-dynamic";

export default async function SellPlannerPage() {
  const assets = await listInStockAssets();
  const cards: PlannerCard[] = assets
    .filter((a) => !a.isPersonal)
    .map((a) => ({
      id: a.id,
      name: a.name,
      subtitle: [a.set, a.cardNumber ? `#${a.cardNumber}` : null, a.variant].filter(Boolean).join(" · "),
      basisCents: a.costBasisCents,
      marketCents: a.priceOverrideCents ?? a.marketValueCents,
      quantity: a.quantity,
    }))
    .filter((c) => c.marketCents > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sell planner"
        description="Where to sell each card for the most net after fees + shipping — and which to liquidate online for fast cash."
      />
      <SellPlannerClient cards={cards} />
    </div>
  );
}
