import { describe, it, expect } from "vitest";
import { daysHeld, agingBucket, suggestBrick, computeAssetMetrics } from "./metrics";

const NOW = new Date("2026-07-09T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("aging", () => {
  it("buckets by days held per spec thresholds", () => {
    expect(agingBucket(0)).toBe("Healthy");
    expect(agingBucket(30)).toBe("Healthy");
    expect(agingBucket(31)).toBe("Aging");
    expect(agingBucket(60)).toBe("Aging");
    expect(agingBucket(61)).toBe("Slow Moving");
    expect(agingBucket(90)).toBe("Slow Moving");
    expect(agingBucket(91)).toBe("Suggest Brick");
    expect(agingBucket(97)).toBe("Suggest Brick");
  });

  it("daysHeld floors and clamps", () => {
    expect(daysHeld(daysAgo(97), NOW)).toBe(97);
    expect(daysHeld(null, NOW)).toBe(0);
    expect(daysHeld(new Date(NOW.getTime() + 86_400_000), NOW)).toBe(0); // future-safe
  });

  it("suggests brick only past 90 days and never when already bricked", () => {
    expect(suggestBrick(97, false)).toBe(true);
    expect(suggestBrick(97, true)).toBe(false);
    expect(suggestBrick(45, false)).toBe(false);
  });
});

describe("computeAssetMetrics", () => {
  const base = {
    acquiredAt: daysAgo(100),
    quantity: 1,
    costBasisCents: 5000, // $50
    marketValueCents: 10000, // $100
    priceOverrideCents: null,
    isBrick: false,
    lines: [
      { direction: "IN", transaction: { id: "t1", type: "BUY" } },
      { direction: "OUT", transaction: { id: "t2", type: "TRADE" } },
      { direction: "IN", transaction: { id: "t2", type: "TRADE" } },
    ],
  };

  it("computes margin, ROI, annualized return", () => {
    const m = computeAssetMetrics(base, NOW);
    expect(m.daysHeld).toBe(100);
    expect(m.aging).toBe("Suggest Brick");
    expect(m.suggestBrick).toBe(true);
    expect(m.marginPct).toBeCloseTo(50); // (100-50)/100
    expect(m.roiPct).toBeCloseTo(100); // (100-50)/50
    expect(m.annualizedRoiPct).toBeCloseTo(365); // 100% over 100 days
    expect(m.unrealizedCents).toBe(5000);
  });

  it("dedupes trade count by transaction (both lines of one trade = 1 trade)", () => {
    const m = computeAssetMetrics(base, NOW);
    expect(m.tradesCount).toBe(1);
    expect(m.timesMoved).toBe(3);
  });

  it("free cards (0 basis) have null ROI, not Infinity", () => {
    const m = computeAssetMetrics({ ...base, costBasisCents: 0 }, NOW);
    expect(m.roiPct).toBeNull();
    expect(m.annualizedRoiPct).toBeNull();
    expect(m.marginPct).toBeCloseTo(100);
  });

  it("zero-market assets have null margin", () => {
    const m = computeAssetMetrics({ ...base, marketValueCents: 0, priceOverrideCents: null }, NOW);
    expect(m.marginPct).toBeNull();
  });
});
