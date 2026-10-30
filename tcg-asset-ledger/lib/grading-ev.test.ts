import { describe, it, expect } from "vitest";
import {
  DEFAULT_EV_CONFIG,
  evaluateCard,
  evaluateBestOfN,
  maxBuyPrice,
  net,
  blendGemRate,
  type CardInputs,
} from "./grading-ev";

const cfg = DEFAULT_EV_CONFIG; // fee 0.13, ship_out 5, grading 80, ship_in 10, amortize off, split9 0.875
const A: CardInputs = { rawPrice: 150, psa10Price: 700, psa9Price: 200, psa8Price: 120, gemRate: 0.6, sales30d: 12, dataAgeDays: 0 };

describe("Vector A — single copy BUY", () => {
  const r = evaluateCard(A, cfg);
  it("net proceeds", () => {
    expect(r.net10).toBeCloseTo(604.0, 2);
    expect(r.net9).toBeCloseTo(169.0, 2);
    expect(r.net8).toBeCloseTo(99.4, 2);
    expect(r.allIn).toBeCloseTo(240.0, 2);
  });
  it("outcome split", () => {
    expect(r.p10).toBeCloseTo(0.6, 4);
    expect(r.p9).toBeCloseTo(0.35, 4);
    expect(r.p8).toBeCloseTo(0.05, 4);
  });
  it("EV / profit / roi", () => {
    expect(r.expectedProceeds).toBeCloseTo(426.52, 2);
    expect(r.expectedProfit).toBeCloseTo(186.52, 2);
    expect(r.roi).toBeCloseTo(0.7772, 4);
  });
  it("break-even and margin", () => {
    expect(r.breakevenGem).toBeCloseTo(0.1632, 4);
    expect(r.gemMargin).toBeCloseTo(0.4368, 4);
  });
  it("max buy @ 0.50", () => {
    expect(maxBuyPrice(r.expectedProceeds, r.fixedCosts, 0.5)).toBeCloseTo(194.35, 2);
  });
  it("verdict BUY", () => {
    expect(r.verdict).toBe("BUY");
    // downside 169/240 = 0.7042 ≥ 0.65
    expect(r.net9 / r.allIn).toBeGreaterThanOrEqual(0.65);
  });
});

describe("Vector B — best-of-3", () => {
  const r = evaluateBestOfN([150, 150, 150], { psa10Price: 700, psa9Price: 200, psa8Price: 120, gemRate: 0.6, sales30d: 12, dataAgeDays: 0 }, cfg);
  it("recovery and effective all-in", () => {
    expect(r.recovered).toBeCloseTo(255.0, 2);
    expect(r.effectiveAllIn).toBeCloseTo(285.0, 2);
  });
  it("uplifted split", () => {
    expect(r.p10Effective).toBeCloseTo(0.68, 4);
    expect(r.p9).toBeCloseTo(0.28, 4);
    expect(r.p8).toBeCloseTo(0.04, 4);
  });
  it("EV / profit / roi", () => {
    expect(r.expectedProceeds).toBeCloseTo(462.02, 2);
    expect(r.expectedProfit).toBeCloseTo(177.02, 2);
    expect(r.roi).toBeCloseTo(0.6211, 4);
  });
});

describe("Vector C — inverted comps → PASS", () => {
  const r = evaluateCard({ ...A, psa10Price: 180, psa9Price: 200 }, cfg);
  it("passes with inverted_comps", () => {
    expect(net(180, cfg)).toBeLessThan(net(200, cfg));
    expect(r.verdict).toBe("PASS");
    expect(r.reasonCode).toBe("inverted_comps");
  });
});

describe("Vector D — break-even sanity (profit ≈ 0)", () => {
  it("at gem = breakeven and split9 = 1.0, expected profit ≈ 0", () => {
    const r = evaluateCard({ ...A, gemRate: 0.163218 }, { ...cfg, gradeSplit9: 1.0 });
    expect(r.expectedProfit).toBeCloseTo(0.0, 2);
  });
});

describe("Vector E — stale data → WATCH", () => {
  const r = evaluateCard({ ...A, dataAgeDays: 20 }, cfg);
  it("degrades a BUY to WATCH with stale_data", () => {
    expect(r.verdict).toBe("WATCH");
    expect(r.reasonCode).toBe("stale_data");
  });
});

describe("edge cases", () => {
  it("missing PSA 9 → WATCH insufficient_comps", () => {
    const r = evaluateCard({ ...A, psa9Price: null }, cfg);
    expect(r.verdict).toBe("WATCH");
    expect(r.reasonCode).toBe("insufficient_comps");
  });
  it("missing PSA 8 → estimated at 0.5 × PSA 9, flagged", () => {
    const r = evaluateCard({ ...A, psa8Price: null }, cfg);
    expect(r.psa8Estimated).toBe(true);
    expect(r.net8).toBeCloseTo(net(0.5 * 200, cfg), 2);
    expect(r.warnings).toContain("estimated_psa8");
  });
  it("max_buy < 0 → PASS", () => {
    // Cheap PSA 10 + low gem → EV can't cover fixed costs.
    const r = evaluateCard({ rawPrice: 5, psa10Price: 60, psa9Price: 40, psa8Price: 20, gemRate: 0.2, sales30d: 10, dataAgeDays: 0 }, cfg);
    expect(r.maxBuyAtFloor).toBeLessThan(0);
    expect(r.verdict).toBe("PASS");
    expect(r.reasonCode).toBe("max_buy_negative");
  });
  it("p10 capped at 0.90", () => {
    const r = evaluateCard({ ...A, gemRate: 0.99 }, cfg);
    expect(r.p10).toBeCloseTo(0.9, 4);
  });
  it("only the liquidity gate failing → WATCH, binding reason liquidity", () => {
    const r = evaluateCard({ ...A, sales30d: 2 }, cfg);
    expect(r.verdict).toBe("WATCH");
    expect(r.reasonCode).toBe("liquidity");
    expect(r.reason).toContain("2/30d");
  });
});

describe("blendGemRate", () => {
  it("no personal data → population rate", () => {
    expect(blendGemRate(null, 0, 0.4, cfg)).toBe(0.4);
  });
  it("blends personal with population by K", () => {
    // 10 personal @ 0.5, K=10, pop 0.3 → (10*0.5 + 10*0.3)/20 = 0.4
    expect(blendGemRate(0.5, 10, 0.3, cfg)).toBeCloseTo(0.4, 4);
  });
});
