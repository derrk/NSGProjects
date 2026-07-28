// Shows + Show Mode service. A Show owns expenses and (while Show Mode is
// active) every ledger transaction is stamped with its id — the ledger stays
// the single source of truth; the summary is derived, never stored.

import { prisma } from "./db";

export async function listShows() {
  return prisma.show.findMany({
    orderBy: [{ startDate: "desc" }],
    include: { _count: { select: { transactions: true } } },
  });
}

export async function getShow(id: string) {
  return prisma.show.findUnique({
    where: { id },
    include: {
      transactions: {
        orderBy: { date: "asc" },
        include: { lines: { include: { asset: { select: { name: true } } } } },
      },
    },
  });
}

export async function getActiveShow() {
  const state = await prisma.appState.findUnique({ where: { id: 1 } });
  if (!state?.activeShowId) return null;
  return prisma.show.findUnique({ where: { id: state.activeShowId } });
}

/** Days until the show starts (negative = already started/past). */
export function daysUntil(startDate: Date, now: Date = new Date()): number {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOfDay(startDate) - startOfDay(now)) / 86_400_000);
}

export interface ShowSummary {
  // Cash
  startingCashCents: number | null; // buying + personal
  buyingCashCents: number | null;
  personalCashCents: number | null;
  endingCashCents: number | null;
  cashDeltaCents: number; // net ledger cash across the show's transactions
  buyingCashUsedCents: number; // cash out on buys + cash paid on trades
  // Activity
  salesCount: number;
  revenueCents: number; // sale proceeds
  cogsCents: number;
  realizedProfitCents: number; // revenue − COGS
  buysCount: number;
  purchasedCents: number; // cash spent on buys
  tradesCount: number;
  tradeValueInCents: number;
  tradeValueOutCents: number;
  tradeMarketDeltaCents: number;
  prizeCostCents: number; // giveaways
  wheelRevenueCents: number;
  wheelPrizeCostCents: number;
  // Expenses
  tableFeeCents: number;
  hotelCents: number;
  travelCents: number;
  foodCents: number;
  otherCents: number;
  expensesCents: number;
  // Bottom line
  netProfitCents: number; // realized profit − expenses
}

export async function computeShowSummary(showId: string): Promise<ShowSummary> {
  const show = await prisma.show.findUniqueOrThrow({ where: { id: showId } });
  const txns = await prisma.transaction.findMany({
    where: { showId },
    include: { lines: true },
  });

  let revenueCents = 0;
  let cogsCents = 0;
  let salesCount = 0;
  let buysCount = 0;
  let purchasedCents = 0;
  let tradesCount = 0;
  let tradeValueInCents = 0;
  let tradeValueOutCents = 0;
  let tradeCashPaidCents = 0;
  let prizeCostCents = 0;
  let wheelRevenueCents = 0;
  let cashDeltaCents = 0;

  for (const t of txns) {
    cashDeltaCents += t.cashDeltaCents;
    if (t.type === "WHEEL_REVENUE") {
      wheelRevenueCents += t.cashDeltaCents;
    } else if (t.type === "SALE") {
      salesCount++;
      revenueCents += t.cashDeltaCents;
      for (const l of t.lines) {
        if (l.direction === "OUT") cogsCents += l.unitBasisCents * l.quantity;
      }
    } else if (t.type === "BUY") {
      buysCount++;
      purchasedCents += -t.cashDeltaCents;
    } else if (t.type === "TRADE") {
      tradesCount++;
      if (t.cashDeltaCents < 0) tradeCashPaidCents += -t.cashDeltaCents;
      for (const l of t.lines) {
        const v = l.unitValueCents * l.quantity;
        if (l.direction === "IN") tradeValueInCents += v;
        else tradeValueOutCents += v;
      }
    } else if (t.type === "PRIZE") {
      // Plain giveaways (raffles, thank-yous).
      for (const l of t.lines) {
        if (l.direction === "OUT") prizeCostCents += l.unitBasisCents * l.quantity;
      }
    }
  }

  // Wheel prize cost from the spin records: real basis for inventory payouts
  // PLUS estimated cost of hand-assembled bundles (which never post ledger
  // lines).
  const spinCost = await prisma.wheelSpin.aggregate({
    where: { showId: show.id },
    _sum: { prizeCostCents: true },
  });
  const wheelPrizeCostCents = spinCost._sum.prizeCostCents ?? 0;

  const expensesCents =
    show.tableFeeCents + show.hotelCents + show.travelCents + show.foodCents + show.otherCents;
  const realizedProfitCents =
    revenueCents + wheelRevenueCents - cogsCents - wheelPrizeCostCents - prizeCostCents;

  return {
    startingCashCents:
      show.buyingCashCents !== null || show.personalCashCents !== null
        ? (show.buyingCashCents ?? 0) + (show.personalCashCents ?? 0)
        : null,
    buyingCashCents: show.buyingCashCents,
    personalCashCents: show.personalCashCents,
    endingCashCents: show.endingCashCents,
    cashDeltaCents,
    buyingCashUsedCents: purchasedCents + tradeCashPaidCents,
    salesCount,
    revenueCents,
    cogsCents,
    realizedProfitCents,
    buysCount,
    purchasedCents,
    tradesCount,
    tradeValueInCents,
    tradeValueOutCents,
    tradeMarketDeltaCents: tradeValueInCents - tradeValueOutCents,
    prizeCostCents,
    wheelRevenueCents,
    wheelPrizeCostCents,
    tableFeeCents: show.tableFeeCents,
    hotelCents: show.hotelCents,
    travelCents: show.travelCents,
    foodCents: show.foodCents,
    otherCents: show.otherCents,
    expensesCents,
    netProfitCents: realizedProfitCents - expensesCents,
  };
}

/** Enter Show Mode: activate the show, record starting cash, and snapshot
 *  inventory (value / basis / count) for future analytics. */
export async function enterShowMode(input: {
  showId: string;
  buyingCashCents: number;
  personalCashCents: number;
}) {
  return prisma.$transaction(async (tx) => {
    const state = await tx.appState.findUnique({ where: { id: 1 } });
    if (state?.activeShowId) {
      if (state.activeShowId === input.showId) {
        throw new Error("Show Mode is already running for this show.");
      }
      const active = await tx.show.findUnique({ where: { id: state.activeShowId } });
      throw new Error(`Already in Show Mode for "${active?.name ?? "another show"}". End it first.`);
    }
    const show = await tx.show.findUniqueOrThrow({ where: { id: input.showId } });
    if (show.status === "Cancelled") throw new Error("This show was cancelled.");
    if (show.status === "Completed") {
      throw new Error("This show is already completed. Set it back to Upcoming first to re-run it.");
    }

    // Inventory snapshot (owned stock: InStock + Grading).
    const owned = await tx.asset.findMany({
      where: { status: { in: ["InStock", "Grading"] }, quantity: { gt: 0 }, isPersonal: false },
      select: {
        quantity: true,
        costBasisCents: true,
        marketValueCents: true,
        priceOverrideCents: true,
      },
    });
    let value = 0;
    let basis = 0;
    let count = 0;
    for (const a of owned) {
      value += (a.priceOverrideCents ?? a.marketValueCents) * a.quantity;
      basis += a.costBasisCents * a.quantity;
      count += a.quantity;
    }

    await tx.show.update({
      where: { id: show.id },
      data: {
        status: "Active",
        enteredAt: new Date(),
        endedAt: null,
        endingCashCents: null, // a fresh session never shows a stale count
        buyingCashCents: input.buyingCashCents,
        personalCashCents: input.personalCashCents,
        snapshotValueCents: value,
        snapshotBasisCents: basis,
        snapshotAssetCount: count,
      },
    });
    await tx.appState.upsert({
      where: { id: 1 },
      create: { id: 1, activeShowId: show.id },
      update: { activeShowId: show.id },
    });
    return show.id;
  });
}

/** End Show Mode: record ending cash, mark completed, release the stamp. */
export async function endShowMode(input: { endingCashCents: number | null }) {
  return prisma.$transaction(async (tx) => {
    const state = await tx.appState.findUnique({ where: { id: 1 } });
    if (!state?.activeShowId) throw new Error("Show Mode isn't active.");
    const showId = state.activeShowId;
    await tx.show.update({
      where: { id: showId },
      data: {
        status: "Completed",
        endedAt: new Date(),
        endingCashCents: input.endingCashCents,
      },
    });
    await tx.appState.update({ where: { id: 1 }, data: { activeShowId: null } });
    return showId;
  });
}
