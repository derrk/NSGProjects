// Investment portfolio — the read/write helpers for assets flagged as
// investment holds. An investment is normal owned inventory (cash out + cost
// basis) that we keep OUT of the show-available/sell aggregations and track as
// a portfolio instead: cost basis, current market, unrealized gain, and a
// value-over-time curve fed by daily InvestmentSnapshot rows.

import { Prisma } from "@prisma/client";
import { prisma } from "./db";

type Db = Prisma.TransactionClient | typeof prisma;

/** Statuses that still count as owned (capital deployed). */
const OWNED_STATUSES = ["InStock", "Grading"] as const;

/** Calendar-day key (YYYY-MM-DD) for the daily snapshot upsert. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface InvestmentLot {
  id: string;
  name: string;
  game: string;
  set: string | null;
  cardNumber: string | null;
  grade: string | null;
  quantity: number;
  costBasisCents: number; // per unit
  marketCents: number; // per unit (override ?? market)
  totalCostCents: number;
  totalMarketCents: number;
  unrealizedCents: number;
  roiPct: number | null;
  acquiredAt: Date | null;
  investmentMarkedAt: Date | null;
  marketPriceAsOf: Date | null;
  status: string;
}

export interface InvestmentPortfolio {
  lots: InvestmentLot[];
  totalCostCents: number;
  totalMarketCents: number;
  unrealizedCents: number;
  roiPct: number | null;
  unitCount: number;
  lotCount: number;
  bestGainer: InvestmentLot | null;
  worstLot: InvestmentLot | null;
  history: HistoryPoint[];
}

export interface HistoryPoint {
  day: string;
  costBasisCents: number;
  marketValueCents: number;
}

interface Totals {
  costBasisCents: number;
  marketValueCents: number;
  unitCount: number;
  lotCount: number;
}

async function ownedInvestmentAssets(db: Db) {
  return db.asset.findMany({
    where: { isInvestment: true, status: { in: [...OWNED_STATUSES] }, quantity: { gt: 0 } },
    orderBy: [{ investmentMarkedAt: "desc" }, { name: "asc" }],
  });
}

function totalsFrom(
  assets: { quantity: number; costBasisCents: number; marketValueCents: number; priceOverrideCents: number | null }[],
): Totals {
  let costBasisCents = 0;
  let marketValueCents = 0;
  let unitCount = 0;
  for (const a of assets) {
    const market = a.priceOverrideCents ?? a.marketValueCents;
    costBasisCents += a.costBasisCents * a.quantity;
    marketValueCents += market * a.quantity;
    unitCount += a.quantity;
  }
  return { costBasisCents, marketValueCents, unitCount, lotCount: assets.length };
}

/**
 * Upsert today's portfolio snapshot. Idempotent per calendar day (latest write
 * wins), so it's safe to call on every page load / import. When the portfolio
 * is empty AND no history exists yet, it records nothing (no noise); once there
 * has ever been an investment, it keeps recording — including a drop to zero.
 */
export async function captureInvestmentSnapshot(db: Db = prisma, now: Date = new Date()): Promise<void> {
  const assets = await ownedInvestmentAssets(db);
  const t = totalsFrom(assets);
  if (t.lotCount === 0) {
    const existing = await db.investmentSnapshot.count();
    if (existing === 0) return; // nothing to chart yet
  }
  const day = dayKey(now);
  await db.investmentSnapshot.upsert({
    where: { day },
    create: {
      day,
      date: now,
      costBasisCents: t.costBasisCents,
      marketValueCents: t.marketValueCents,
      unitCount: t.unitCount,
      lotCount: t.lotCount,
    },
    update: {
      date: now,
      costBasisCents: t.costBasisCents,
      marketValueCents: t.marketValueCents,
      unitCount: t.unitCount,
      lotCount: t.lotCount,
    },
  });
}

function toLot(a: Awaited<ReturnType<typeof ownedInvestmentAssets>>[number]): InvestmentLot {
  const marketCents = a.priceOverrideCents ?? a.marketValueCents;
  const totalCostCents = a.costBasisCents * a.quantity;
  const totalMarketCents = marketCents * a.quantity;
  const unrealizedCents = totalMarketCents - totalCostCents;
  return {
    id: a.id,
    name: a.name,
    game: a.game,
    set: a.set,
    cardNumber: a.cardNumber,
    grade: a.grade,
    quantity: a.quantity,
    costBasisCents: a.costBasisCents,
    marketCents,
    totalCostCents,
    totalMarketCents,
    unrealizedCents,
    roiPct: totalCostCents > 0 ? (unrealizedCents / totalCostCents) * 100 : null,
    acquiredAt: a.acquiredAt,
    investmentMarkedAt: a.investmentMarkedAt,
    marketPriceAsOf: a.marketPriceAsOf,
    status: a.status,
  };
}

/**
 * The full portfolio for the /investments page. Captures today's snapshot first
 * (idempotent) so the curve always includes the current value, then reads the
 * history back.
 */
export async function getInvestmentPortfolio(now: Date = new Date()): Promise<InvestmentPortfolio> {
  await captureInvestmentSnapshot(prisma, now);

  const assets = await ownedInvestmentAssets(prisma);
  const lots = assets.map(toLot);

  let totalCostCents = 0;
  let totalMarketCents = 0;
  let unitCount = 0;
  for (const l of lots) {
    totalCostCents += l.totalCostCents;
    totalMarketCents += l.totalMarketCents;
    unitCount += l.quantity;
  }
  const unrealizedCents = totalMarketCents - totalCostCents;

  const ranked = [...lots].sort((a, b) => b.unrealizedCents - a.unrealizedCents);
  const bestGainer = ranked.length > 0 ? ranked[0] : null;
  const worstLot = ranked.length > 0 ? ranked[ranked.length - 1] : null;

  // Most recent 365 days (newest first from the DB), re-sorted ascending for the
  // chart. Taking `asc` here would freeze the curve on the oldest year once
  // history exceeds 365 rows and drop today's just-written point.
  const snaps = await prisma.investmentSnapshot.findMany({
    orderBy: { day: "desc" },
    take: 365,
  });
  const history: HistoryPoint[] = snaps
    .reverse()
    .map((s) => ({
      day: s.day,
      costBasisCents: s.costBasisCents,
      marketValueCents: s.marketValueCents,
    }));

  return {
    lots,
    totalCostCents,
    totalMarketCents,
    unrealizedCents,
    roiPct: totalCostCents > 0 ? (unrealizedCents / totalCostCents) * 100 : null,
    unitCount,
    lotCount: lots.length,
    bestGainer,
    worstLot,
    history,
  };
}

/** Count of owned investment lots — for nav badges / dashboards. */
export async function countInvestments(): Promise<number> {
  return prisma.asset.count({
    where: { isInvestment: true, status: { in: [...OWNED_STATUSES] }, quantity: { gt: 0 } },
  });
}
