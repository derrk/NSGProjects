import { getCollectionOffers } from "@/lib/collection-offers";
import { SellRequestsList, type OfferRow } from "@/components/admin/sell-requests-list";

export const metadata = { title: "Sell Requests" };

export default async function SellRequestsPage() {
  const offers = await getCollectionOffers();

  // Dates cross to the client as ISO strings so the row type stays serializable.
  const rows: OfferRow[] = offers.map((o) => ({
    id: o.id,
    name: o.name,
    email: o.email,
    phone: o.phone,
    preferredContact: o.preferredContact,
    categories: o.categories,
    description: o.description,
    itemCountEstimate: o.itemCountEstimate,
    askingPrice: o.askingPrice,
    photosUrl: o.photosUrl,
    status: o.status,
    appointmentAt: o.appointmentAt?.toISOString() ?? null,
    internalNote: o.internalNote,
    createdAt: o.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Sell Requests</h1>
        <div className="purple-rule mt-2" />
        <p className="mt-2 text-sm text-muted-foreground">
          Collections people want to sell you. Newest and unanswered first.
        </p>
      </div>

      <SellRequestsList rows={rows} />
    </div>
  );
}
