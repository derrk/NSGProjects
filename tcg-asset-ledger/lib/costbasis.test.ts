import { describe, it, expect } from "vitest";
import {
  acquisitionCostCents,
  allocateAcquisition,
  blendUnitBasis,
  realizedProfit,
} from "./costbasis";
import { allocateByWeight, toCents, formatUSD } from "./money";

describe("acquisitionCostCents", () => {
  it("matches the spec example: $24 basis + $143 cash = $167", () => {
    const cost = acquisitionCostCents({
      givenBasisCents: toCents(24),
      cashDeltaCents: -toCents(143), // you paid $143
    });
    expect(cost).toBe(toCents(167));
    expect(formatUSD(cost)).toBe("$167.00");
  });

  it("a plain cash buy has basis equal to cash paid", () => {
    expect(
      acquisitionCostCents({ givenBasisCents: 0, cashDeltaCents: -toCents(100) }),
    ).toBe(toCents(100));
  });

  it("receiving cash boot reduces basis but never below zero", () => {
    // gave $50 basis of cards, received $80 cash on top
    expect(
      acquisitionCostCents({
        givenBasisCents: toCents(50),
        cashDeltaCents: toCents(80),
      }),
    ).toBe(0);
  });
});

describe("allocateAcquisition (spec example)", () => {
  it("puts the whole $167 basis on the single received card", () => {
    const parts = allocateAcquisition({
      givenBasisCents: toCents(24),
      cashDeltaCents: -toCents(143),
      receivedMarketValuesCents: [toCents(240)],
    });
    expect(parts).toEqual([toCents(167)]);
  });

  it("splits basis across two received cards by market value", () => {
    // Give $100 basis of cards, pay $50 cash -> $150 acquisition cost.
    // Received cards worth $200 and $100 -> 2:1 split -> $100 / $50.
    const parts = allocateAcquisition({
      givenBasisCents: toCents(100),
      cashDeltaCents: -toCents(50),
      receivedMarketValuesCents: [toCents(200), toCents(100)],
    });
    expect(parts).toEqual([toCents(100), toCents(50)]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(toCents(150));
  });
});

describe("allocateByWeight", () => {
  it("sums exactly to the total even with rounding remainder", () => {
    const parts = allocateByWeight(10000, [1, 1, 1]); // $100 across 3
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it("splits evenly when all weights are zero", () => {
    const parts = allocateByWeight(9000, [0, 0, 0]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(9000);
    expect(parts).toEqual([3000, 3000, 3000]);
  });
});

describe("blendUnitBasis", () => {
  it("blends new stock into an existing lot as a weighted average", () => {
    // Own 1 @ $10 basis, add 1 more that cost $20 total -> avg $15/unit
    expect(blendUnitBasis(1, toCents(10), 1, toCents(20))).toBe(toCents(15));
  });
});

// The "reprice" trade path (matching an existing inventory card) blends the
// acquired units' basis across the WHOLE lot without changing quantity:
//   blendUnitBasis(lotQty - acquiredQty, oldUnitBasis, acquiredQty, acquiredTotal)
describe("reprice blend (match-existing)", () => {
  it("a single-unit lot takes the full acquisition basis per unit", () => {
    // Lot qty 1, acquiring that 1 unit for a $167 pool -> $167/unit.
    expect(blendUnitBasis(0, 0, 1, toCents(167))).toBe(toCents(167));
  });

  it("a multi-unit lot keeps other units' basis and blends the acquired unit", () => {
    // Own 3 @ $10 ($30 lot). One unit was acquired via trade for a $167 pool.
    // New lot total = 2*$10 + $167 = $187, across 3 units = $62.33/unit.
    const unit = blendUnitBasis(2, toCents(10), 1, toCents(167));
    expect(unit).toBe(6233); // $62.33 rounded
    // Lot total stays ~$187 (not the buggy $167*3 = $501).
    expect(unit * 3).toBe(18699);
  });
});

describe("realizedProfit", () => {
  it("computes proceeds minus basis", () => {
    const r = realizedProfit(toCents(57), toCents(24));
    expect(r.profitCents).toBe(toCents(33));
  });

  it("can be negative (a loss)", () => {
    const r = realizedProfit(toCents(10), toCents(24));
    expect(r.profitCents).toBe(-toCents(14));
  });
});

describe("toCents", () => {
  it("parses dollar strings and numbers", () => {
    expect(toCents("24")).toBe(2400);
    expect(toCents("$1,234.56")).toBe(123456);
    expect(toCents(3.88)).toBe(388);
    expect(toCents("")).toBe(0);
  });
});
