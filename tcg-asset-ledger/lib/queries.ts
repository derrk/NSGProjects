// Read-side helpers. Kept separate from the write-side ledger service.
import { prisma } from "./db";
import type { Prisma } from "@prisma/client";
import { daysHeld, agingBucket } from "./metrics";

export interface InventoryFilters {
  search?: string;
  game?: string;
  status?: string;
  assetType?: string;
}

export async function listAssets(filters: InventoryFilters = {}) {
  const where: Prisma.AssetWhereInput = {};
  if (filters.game) where.game = filters.game;
  if (filters.status) where.status = filters.status;
  if (filters.assetType) where.assetType = filters.assetType;
  if (filters.search) {
    const s = filters.search;
    where.OR = [
      { name: { contains: s } },
      { set: { contains: s } },
      { cardNumber: { contains: s } },
    ];
  }
  return prisma.asset.findMany({
    where,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 500,
  });
}

/** Assets available to give up in a sale/trade/break (something in stock). */
export async function listInStockAssets() {
  return prisma.asset.findMany({
    where: { status: "InStock", quantity: { gt: 0 } },
    orderBy: [{ game: "asc" }, { name: "asc" }],
    take: 1000,
  });
}

export async function getAsset(id: string) {
  return prisma.asset.findUnique({ where: { id } });
}

export async function getAssetWithHistory(id: string) {
  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) return null;
  const lines = await prisma.transactionLine.findMany({
    where: { assetId: id },
    include: { transaction: { include: { attachments: { select: { id: true } } } } },
    orderBy: { transaction: { date: "desc" } },
  });
  return { asset, lines };
}

export async function getGradingSubmissions(assetId: string) {
  return prisma.gradingSubmission.findMany({
    where: { assetId },
    orderBy: { submittedAt: "desc" },
  });
}

export async function listTransactions(limit = 200) {
  return prisma.transaction.findMany({
    orderBy: { date: "desc" },
    take: limit,
    include: {
      lines: { include: { asset: true } },
      attachments: { select: { id: true } },
    },
  });
}

export async function getTransaction(id: string) {
  return prisma.transaction.findUnique({
    where: { id },
    include: {
      lines: { include: { asset: true } },
      attachments: true,
    },
  });
}

export interface DashboardMetrics {
  inStockCount: number;
  inStockUnits: number;
  inventoryValueCents: number;
  inventoryCostCents: number;
  unrealizedCents: number;
  realizedProfitCents: number;
  salesProceedsCents: number;
  cashInCents: number;
  cashOutCents: number;
  cashNetCents: number;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const inStock = await prisma.asset.findMany({
    where: { status: "InStock", quantity: { gt: 0 } },
    select: { quantity: true, marketValueCents: true, costBasisCents: true, priceOverrideCents: true },
  });

  let inventoryValueCents = 0;
  let inventoryCostCents = 0;
  let inStockUnits = 0;
  for (const a of inStock) {
    const price = a.priceOverrideCents ?? a.marketValueCents;
    inventoryValueCents += price * a.quantity;
    inventoryCostCents += a.costBasisCents * a.quantity;
    inStockUnits += a.quantity;
  }

  // Sales proceeds = actual cash from SALE transactions (authoritative).
  const saleTxns = await prisma.transaction.findMany({
    where: { type: "SALE" },
    select: { cashDeltaCents: true },
  });
  let salesProceedsCents = 0;
  for (const t of saleTxns) salesProceedsCents += t.cashDeltaCents;

  // COGS = cost basis of the units sold.
  const soldLines = await prisma.transactionLine.findMany({
    where: { direction: "OUT", transaction: { type: "SALE" } },
    select: { quantity: true, unitBasisCents: true },
  });
  let cogsCents = 0;
  for (const l of soldLines) cogsCents += l.unitBasisCents * l.quantity;

  const realizedProfitCents = salesProceedsCents - cogsCents;

  // Cash flow across all transactions.
  const txns = await prisma.transaction.findMany({ select: { cashDeltaCents: true } });
  let cashInCents = 0;
  let cashOutCents = 0;
  for (const t of txns) {
    if (t.cashDeltaCents > 0) cashInCents += t.cashDeltaCents;
    else cashOutCents += -t.cashDeltaCents;
  }

  return {
    inStockCount: inStock.length,
    inStockUnits,
    inventoryValueCents,
    inventoryCostCents,
    unrealizedCents: inventoryValueCents - inventoryCostCents,
    realizedProfitCents,
    salesProceedsCents,
    cashInCents,
    cashOutCents,
    cashNetCents: cashInCents - cashOutCents,
  };
}

// ── Inventory health (v0.2) ──────────────────────────────────────────────────

export interface InventoryHealth {
  healthyCount: number;
  healthyValueCents: number;
  agingCount: number;
  agingValueCents: number;
  slowCount: number; // Slow Moving + Suggest Brick (not manually bricked)
  slowValueCents: number;
  brickCount: number;
  brickValueCents: number;
  brickBasisCents: number;
  suggestBrickCount: number; // 90+ days, not yet bricked
  gradingCount: number;
  soldThisMonthCount: number;
  soldThisMonthCents: number;
  avgDaysHeld: number;
}

export async function getInventoryHealth(now: Date = new Date()): Promise<InventoryHealth> {
  const owned = await prisma.asset.findMany({
    where: { status: { in: ["InStock", "Grading"] }, quantity: { gt: 0 } },
    select: {
      status: true,
      quantity: true,
      isBrick: true,
      acquiredAt: true,
      costBasisCents: true,
      marketValueCents: true,
      priceOverrideCents: true,
    },
  });

  const h: InventoryHealth = {
    healthyCount: 0,
    healthyValueCents: 0,
    agingCount: 0,
    agingValueCents: 0,
    slowCount: 0,
    slowValueCents: 0,
    brickCount: 0,
    brickValueCents: 0,
    brickBasisCents: 0,
    suggestBrickCount: 0,
    gradingCount: 0,
    soldThisMonthCount: 0,
    soldThisMonthCents: 0,
    avgDaysHeld: 0,
  };

  let daysSum = 0;
  for (const a of owned) {
    const value = (a.priceOverrideCents ?? a.marketValueCents) * a.quantity;
    const days = daysHeld(a.acquiredAt, now);
    daysSum += days;
    if (a.status === "Grading") h.gradingCount++;
    if (a.isBrick) {
      h.brickCount++;
      h.brickValueCents += value;
      h.brickBasisCents += a.costBasisCents * a.quantity;
      continue;
    }
    const bucket = agingBucket(days);
    if (bucket === "Healthy") {
      h.healthyCount++;
      h.healthyValueCents += value;
    } else if (bucket === "Aging") {
      h.agingCount++;
      h.agingValueCents += value;
    } else {
      h.slowCount++;
      h.slowValueCents += value;
      if (bucket === "Suggest Brick") h.suggestBrickCount++;
    }
  }
  h.avgDaysHeld = owned.length > 0 ? Math.round(daysSum / owned.length) : 0;

  // Sold this calendar month (actual sale cash).
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sales = await prisma.transaction.findMany({
    where: { type: "SALE", date: { gte: monthStart } },
    select: { cashDeltaCents: true },
  });
  h.soldThisMonthCount = sales.length;
  for (const s of sales) h.soldThisMonthCents += s.cashDeltaCents;

  return h;
}
