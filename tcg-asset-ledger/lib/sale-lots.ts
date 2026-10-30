// Lot sales — stage a batch of cards, then settle for one lump sum. Profit is
// judged at the LOT level: net payout (after fees) minus the combined cost basis
// of everything in the lot. Pure economics below; DB helpers wrap them.

import { prisma } from "./db";

export interface LotItemEcon {
  basisCents: number;
  marketCents: number;
  quantity: number;
}

export interface LotEconomics {
  totalBasisCents: number;
  totalMarketCents: number;
  unitCount: number;
  feesCents: number | null; // gross − net (null until both entered)
  profitCents: number | null; // net − basis (null until net entered)
}

/** Roll up a lot's items and (optionally) its sale figures. */
export function lotEconomics(
  items: LotItemEcon[],
  grossCents: number | null | undefined,
  netCents: number | null | undefined,
): LotEconomics {
  const totalBasisCents = items.reduce((s, i) => s + i.basisCents * i.quantity, 0);
  const totalMarketCents = items.reduce((s, i) => s + i.marketCents * i.quantity, 0);
  const unitCount = items.reduce((s, i) => s + i.quantity, 0);
  const feesCents =
    grossCents != null && netCents != null ? Math.max(0, grossCents - netCents) : null;
  const profitCents = netCents != null ? netCents - totalBasisCents : null;
  return { totalBasisCents, totalMarketCents, unitCount, feesCents, profitCents };
}

/** Economics for a lot row — live basis while Open, the frozen snapshot once Sold
 *  (so a settled lot's profit matches the ledger and never drifts). */
export function econFor(
  lot: { status: string; grossCents: number | null; netCents: number | null; totalBasisCents: number | null },
  items: LotItemEcon[],
): LotEconomics {
  const live = lotEconomics(items, lot.grossCents, lot.netCents);
  if (lot.status === "Sold" && lot.totalBasisCents != null) {
    const totalBasisCents = lot.totalBasisCents;
    return { ...live, totalBasisCents, profitCents: lot.netCents != null ? lot.netCents - totalBasisCents : null };
  }
  return live;
}

export async function listSaleLots() {
  const lots = await prisma.saleLot.findMany({
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: {
      items: {
        include: { asset: { select: { costBasisCents: true, marketValueCents: true, priceOverrideCents: true } } },
      },
    },
  });
  return lots.map((lot) => {
    const econItems: LotItemEcon[] = lot.items.map((it) => ({
      basisCents: it.asset.costBasisCents,
      marketCents: it.asset.priceOverrideCents ?? it.asset.marketValueCents,
      quantity: it.quantity,
    }));
    return { ...lot, econ: econFor(lot, econItems), itemCount: lot.items.length };
  });
}

export async function getSaleLot(id: string) {
  const lot = await prisma.saleLot.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          asset: {
            select: {
              id: true, name: true, set: true, cardNumber: true, variant: true,
              costBasisCents: true, marketValueCents: true, priceOverrideCents: true,
              quantity: true, status: true,
            },
          },
        },
      },
    },
  });
  if (!lot) return null;
  const econItems: LotItemEcon[] = lot.items.map((it) => ({
    basisCents: it.asset.costBasisCents,
    marketCents: it.asset.priceOverrideCents ?? it.asset.marketValueCents,
    quantity: it.quantity,
  }));
  return { ...lot, econ: econFor(lot, econItems) };
}
