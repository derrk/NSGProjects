import { PageHeader } from "@/components/page-header";
import { getEvConfig, listGradeCards } from "@/lib/grading-ev-db";
import { priceSourceStatus } from "@/lib/price-sources";
import { EvClient } from "./ev-client";

export const dynamic = "force-dynamic";

export default async function GradingAnalyzerPage() {
  const config = await getEvConfig();
  const cards = await listGradeCards(new Date(), config);
  const source = priceSourceStatus();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Grading Plays"
        description="EV-ranked BUY / WATCH / PASS for grading — the gem rate drives every call. Filter Pokémon vs One Piece, and quick-check any card you find in the wild."
      />
      <EvClient cards={cards} config={config} source={source} />
    </div>
  );
}
