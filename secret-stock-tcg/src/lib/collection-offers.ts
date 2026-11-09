import { prisma } from "@/lib/db";
import type { OfferStatus } from "@/lib/validators";

// Reads for the Sell Requests queue. Writes go through the admin action so
// every status change happens in one place.

// Open requests first, then most recent within each group. A week-old "new"
// lead still matters more than one already marked purchased this morning.
// Status is free text in the database, so ordering by it in SQL would sort
// alphabetically — "contacted" before "new" — which is the wrong end of the
// queue. Ranked here instead; a shop's lead volume sorts in memory fine.
const STATUS_RANK: Record<string, number> = {
  new: 0,
  contacted: 1,
  scheduled: 2,
  purchased: 3,
  declined: 4,
};

export async function getCollectionOffers() {
  const offers = await prisma.collectionOffer.findMany({
    orderBy: { createdAt: "desc" },
  });
  return offers.sort(
    (a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9),
  );
}

export async function getOfferById(id: string) {
  return prisma.collectionOffer.findUnique({ where: { id } });
}

/** How many requests still need a first response — the badge in the nav. */
export async function countNewOffers(): Promise<number> {
  return prisma.collectionOffer.count({ where: { status: "new" } });
}

export const STATUS_LABEL: Record<OfferStatus, string> = {
  new: "New",
  contacted: "Contacted",
  scheduled: "Scheduled",
  purchased: "Purchased",
  declined: "Declined",
};

// Semantic tokens, so this follows the theme rather than hard-coding purple.
export const STATUS_CLASS: Record<OfferStatus, string> = {
  new: "bg-primary/15 text-primary ring-1 ring-primary/30",
  contacted: "bg-warning/15 text-warning ring-1 ring-warning/30",
  scheduled: "bg-accent/40 text-foreground ring-1 ring-border",
  purchased: "bg-success/15 text-success ring-1 ring-success/30",
  declined: "bg-muted text-muted-foreground ring-1 ring-border",
};
