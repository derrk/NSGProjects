// Asset metrics & inventory aging — computed live from the ledger, never
// cached (no staleness at local-SQLite scale). Pure functions here; queries
// that need them compose with lib/queries.ts.

export type AgingBucket = "Healthy" | "Aging" | "Slow Moving" | "Suggest Brick";

export const AGING_THRESHOLDS = {
  healthyMaxDays: 30,
  agingMaxDays: 60,
  slowMaxDays: 90,
} as const;

/** Whole days between acquisition and now (floor, min 0). */
export function daysHeld(acquiredAt: Date | null | undefined, now: Date = new Date()): number {
  if (!acquiredAt) return 0;
  const ms = now.getTime() - acquiredAt.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function agingBucket(days: number): AgingBucket {
  if (days <= AGING_THRESHOLDS.healthyMaxDays) return "Healthy";
  if (days <= AGING_THRESHOLDS.agingMaxDays) return "Aging";
  if (days <= AGING_THRESHOLDS.slowMaxDays) return "Slow Moving";
  return "Suggest Brick";
}

/** Should the UI suggest flagging this asset as a Brick? Never auto-marks. */
export function suggestBrick(days: number, isBrick: boolean): boolean {
  return !isBrick && days > AGING_THRESHOLDS.slowMaxDays;
}

export interface AssetMetricsInput {
  acquiredAt: Date | null;
  quantity: number;
  costBasisCents: number; // per unit
  marketValueCents: number; // per unit
  priceOverrideCents: number | null;
  isBrick: boolean;
  /** All ledger lines for the asset, with their transaction id + type. */
  lines: { direction: string; transaction: { id: string; type: string } }[];
}

export interface AssetMetrics {
  daysHeld: number;
  aging: AgingBucket;
  suggestBrick: boolean;
  tradesCount: number; // trades that touched this asset
  timesMoved: number; // total ledger lines (every movement)
  /** (market − basis) / market, per unit. Null when market is 0. */
  marginPct: number | null;
  /** (market − basis) / basis. Null when basis is 0 (free/pack-pull cards). */
  roiPct: number | null;
  /** ROI scaled to a year. Null when ROI is null or held < 1 day. */
  annualizedRoiPct: number | null;
  unrealizedCents: number; // (market − basis) × qty
}

export function computeAssetMetrics(a: AssetMetricsInput, now: Date = new Date()): AssetMetrics {
  const days = daysHeld(a.acquiredAt, now);
  const market = a.priceOverrideCents ?? a.marketValueCents;
  const basis = a.costBasisCents;

  const marginPct = market > 0 ? ((market - basis) / market) * 100 : null;
  const roiPct = basis > 0 ? ((market - basis) / basis) * 100 : null;
  const annualizedRoiPct = roiPct !== null && days >= 1 ? (roiPct * 365) / days : null;

  const tradeTxnIds = new Set(
    a.lines.filter((l) => l.transaction.type === "TRADE").map((l) => l.transaction.id),
  );

  return {
    daysHeld: days,
    aging: agingBucket(days),
    suggestBrick: suggestBrick(days, a.isBrick),
    tradesCount: tradeTxnIds.size,
    timesMoved: a.lines.length,
    marginPct,
    roiPct,
    annualizedRoiPct,
    unrealizedCents: (market - basis) * a.quantity,
  };
}
