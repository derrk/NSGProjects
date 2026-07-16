import { prisma } from "./db";

export interface MonthRow {
  month: string; // yyyy-MM
  salesProceedsCents: number;
  cogsCents: number;
  profitCents: number;
  buySpendCents: number;
}

export interface GameRow {
  game: string;
  units: number;
  valueCents: number;
  costCents: number;
  unrealizedCents: number;
}

export interface TradeStats {
  count: number;
  valueInCents: number;
  valueOutCents: number;
  marketDeltaCents: number;
  cashDeltaCents: number;
}

export interface ReportData {
  months: MonthRow[];
  byGame: GameRow[];
  totals: {
    salesProceedsCents: number;
    cogsCents: number;
    realizedProfitCents: number;
    buySpendCents: number;
    wheelRevenueCents: number;
    wheelPrizeCostCents: number;
  };
  tradeStats: TradeStats;
  topGainers: { id: string; name: string; unrealizedCents: number }[];
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function getReportData(): Promise<ReportData> {
  // Sales, buys & trades with their lines for month grouping + trade stats.
  const txns = await prisma.transaction.findMany({
    where: { type: { in: ["SALE", "BUY", "TRADE"] } },
    include: { lines: true },
    orderBy: { date: "asc" },
  });

  const monthMap = new Map<string, MonthRow>();
  const ensure = (m: string): MonthRow => {
    let row = monthMap.get(m);
    if (!row) {
      row = { month: m, salesProceedsCents: 0, cogsCents: 0, profitCents: 0, buySpendCents: 0 };
      monthMap.set(m, row);
    }
    return row;
  };

  let salesProceedsCents = 0;
  let cogsCents = 0;
  let buySpendCents = 0;

  // Wheel economics (realized): session revenue minus real prize costs.
  const [wheelRevenueAgg, wheelCostAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: { type: "WHEEL_REVENUE" },
      _sum: { cashDeltaCents: true },
    }),
    prisma.wheelSpin.aggregate({ _sum: { prizeCostCents: true } }),
  ]);
  const wheelRevenueCents = wheelRevenueAgg._sum.cashDeltaCents ?? 0;
  const wheelPrizeCostCents = wheelCostAgg._sum.prizeCostCents ?? 0;
  const tradeStats: TradeStats = {
    count: 0,
    valueInCents: 0,
    valueOutCents: 0,
    marketDeltaCents: 0,
    cashDeltaCents: 0,
  };

  for (const t of txns) {
    if (t.type === "SALE") {
      const row = ensure(monthKey(t.date));
      // Proceeds are the transaction's actual cash in (authoritative — avoids
      // per-unit rounding drift); COGS is the basis of the units sold.
      const proceeds = t.cashDeltaCents;
      let cogs = 0;
      for (const l of t.lines) {
        if (l.direction !== "OUT") continue;
        cogs += l.unitBasisCents * l.quantity;
      }
      row.salesProceedsCents += proceeds;
      row.cogsCents += cogs;
      row.profitCents += proceeds - cogs;
      salesProceedsCents += proceeds;
      cogsCents += cogs;
    } else if (t.type === "BUY") {
      const row = ensure(monthKey(t.date));
      const spend = -t.cashDeltaCents; // cashDelta negative on buys
      row.buySpendCents += spend;
      buySpendCents += spend;
    } else if (t.type === "TRADE") {
      // Trades don't create a Monthly-profit row (no sale/buy cash);
      // they're summarized separately in tradeStats.
      tradeStats.count += 1;
      tradeStats.cashDeltaCents += t.cashDeltaCents;
      for (const l of t.lines) {
        const value = l.unitValueCents * l.quantity;
        if (l.direction === "IN") tradeStats.valueInCents += value;
        else tradeStats.valueOutCents += value;
      }
    }
  }
  tradeStats.marketDeltaCents = tradeStats.valueInCents - tradeStats.valueOutCents;

  const months = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  // Inventory breakdown by game.
  const inStock = await prisma.asset.findMany({
    where: { status: "InStock", quantity: { gt: 0 } },
    select: {
      id: true,
      name: true,
      game: true,
      quantity: true,
      marketValueCents: true,
      priceOverrideCents: true,
      costBasisCents: true,
    },
  });

  const gameMap = new Map<string, GameRow>();
  const gainers: { id: string; name: string; unrealizedCents: number }[] = [];
  for (const a of inStock) {
    const market = a.priceOverrideCents ?? a.marketValueCents;
    const value = market * a.quantity;
    const cost = a.costBasisCents * a.quantity;
    let g = gameMap.get(a.game);
    if (!g) {
      g = { game: a.game, units: 0, valueCents: 0, costCents: 0, unrealizedCents: 0 };
      gameMap.set(a.game, g);
    }
    g.units += a.quantity;
    g.valueCents += value;
    g.costCents += cost;
    g.unrealizedCents += value - cost;
    gainers.push({ id: a.id, name: a.name, unrealizedCents: value - cost });
  }

  const byGame = [...gameMap.values()].sort((a, b) => b.valueCents - a.valueCents);
  const topGainers = gainers.sort((a, b) => b.unrealizedCents - a.unrealizedCents).slice(0, 8);

  return {
    months,
    byGame,
    totals: {
      salesProceedsCents,
      cogsCents,
      realizedProfitCents: salesProceedsCents - cogsCents + wheelRevenueCents - wheelPrizeCostCents,
      buySpendCents,
      wheelRevenueCents,
      wheelPrizeCostCents,
    },
    tradeStats,
    topGainers,
  };
}
