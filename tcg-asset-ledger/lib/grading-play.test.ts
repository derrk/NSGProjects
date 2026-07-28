import { describe, it, expect } from "vitest";
import {
  computePlay,
  recommend,
  tone,
  gradeToMarketCents,
  playDedupeKey,
  buyVsGrade,
  classifyPop,
  GRADING_COST_DEFAULTS,
} from "./grading-play";

const base = {
  rawValueCents: 40_00,
  purchasePriceCents: null as number | null,
  psa10Cents: 200_00,
  gemRatePct: 70,
  ...GRADING_COST_DEFAULTS,
};

describe("computePlay", () => {
  it("matches the spec example: raw $40, PSA10 $200, 70% gem → EV $152", () => {
    const m = computePlay(base);
    expect(m.expectedValueCents).toBe(152_00);
  });

  it("total grading cost = fee + shipping + insurance + pre-grading fee ($92 default)", () => {
    const m = computePlay(base);
    expect(m.gradingCostCents).toBe(92_00);
  });

  it("investment uses purchase price when known, raw value otherwise", () => {
    expect(computePlay(base).acquisitionCents).toBe(40_00);
    expect(computePlay({ ...base, purchasePriceCents: 42_00 }).acquisitionCents).toBe(42_00);
  });

  it("profit and ROI follow the spec formulas", () => {
    // Investment = $40 + $92 = $132; profit = $152 − $132 = $20
    const m = computePlay(base);
    expect(m.totalInvestmentCents).toBe(132_00);
    expect(m.estimatedProfitCents).toBe(20_00);
    expect(m.roiPct).toBeCloseTo((20_00 / 132_00) * 100, 5);
  });

  it("gem rate is clamped to 0–100", () => {
    expect(computePlay({ ...base, gemRatePct: 150 }).expectedValueCents).toBe(200_00);
    expect(computePlay({ ...base, gemRatePct: -5 }).expectedValueCents).toBe(40_00);
  });

  it("zero investment yields null ROI and Skip", () => {
    const m = computePlay({
      ...base,
      rawValueCents: 0,
      feeCents: 0,
      shippingCents: 0,
      insuranceCents: 0,
      preGradingFeeCents: 0,
    });
    expect(m.roiPct).toBeNull();
    expect(m.recommendation).toBe("Skip");
  });
});

describe("gradeToMarketCents", () => {
  const comps = { psa10Cents: 200_00, psa9Cents: 90_00, psa8Cents: 50_00 };

  it("maps explicit grades to the right comp", () => {
    expect(gradeToMarketCents("PSA 10", comps)).toBe(200_00);
    expect(gradeToMarketCents("PSA 9", comps)).toBe(90_00);
    expect(gradeToMarketCents("BGS 9.5", comps)).toBe(90_00);
    expect(gradeToMarketCents("PSA 8", comps)).toBe(50_00);
    expect(gradeToMarketCents("CGC 8.5", comps)).toBe(50_00);
  });

  it("maps BGS 10 and Black Label to their own comps", () => {
    const bgs = { ...comps, bgs10Cents: 260_00, bgsBlackLabelCents: 500_00 };
    expect(gradeToMarketCents("BGS 10", bgs)).toBe(260_00);
    expect(gradeToMarketCents("BGS Black Label", bgs)).toBe(500_00);
    expect(gradeToMarketCents("Black Label", bgs)).toBe(500_00);
    // BGS 10 with no BGS comp falls back to the PSA 10 comp
    expect(gradeToMarketCents("BGS 10", comps)).toBe(200_00);
    // Black Label with no comp entered → untouched
    expect(gradeToMarketCents("Black Label", comps)).toBeNull();
  });

  it("a PSA 8 return never gets the PSA 9 comp when psa8 is unknown", () => {
    expect(gradeToMarketCents("PSA 8", { ...comps, psa8Cents: null })).toBeNull();
  });

  it("grades below 8, PSA 1, and junk keep the market untouched (null)", () => {
    expect(gradeToMarketCents("PSA 7", comps)).toBeNull();
    expect(gradeToMarketCents("PSA 1", comps)).toBeNull(); // never substring-matches "10"
    expect(gradeToMarketCents("Authentic", comps)).toBeNull();
    expect(gradeToMarketCents("", comps)).toBeNull();
  });
});

describe("playDedupeKey", () => {
  it("normalizes card numbers so 038 and 38 collapse to one candidate", () => {
    expect(playDedupeKey({ name: "Charizard", set: "Base", cardNumber: "038", variant: null })).toBe(
      playDedupeKey({ name: "Charizard", set: "Base", cardNumber: "38", variant: null }),
    );
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(playDedupeKey({ name: " Charizard ", set: "Base" })).toBe(
      playDedupeKey({ name: "charizard", set: "BASE" }),
    );
  });

  it("keeps genuinely different cards distinct", () => {
    expect(playDedupeKey({ name: "Charizard", cardNumber: "4" })).not.toBe(
      playDedupeKey({ name: "Blastoise", cardNumber: "9" }),
    );
  });
});

describe("buyVsGrade", () => {
  const g = (over: Partial<Parameters<typeof buyVsGrade>[0]> = {}) =>
    buyVsGrade({ rawValueCents: 40_00, psa10Cents: 300_00, gemRatePct: 80, gradingCostCents: 92_00, ...over });

  it("recommends grading when there's a price edge and a high gem rate", () => {
    const r = g();
    expect(r.gradeCostCents).toBe(132_00); // $40 raw + $92
    expect(r.slabCents).toBe(300_00);
    expect(r.edgeCents).toBe(168_00);
    expect(r.verdict).toBe("Grade it");
    expect(r.longTermHold).toBe(false);
  });

  it("recommends buying the slab when the gem rate is a coin-flip", () => {
    expect(g({ gemRatePct: 30 }).verdict).toBe("Buy the slab");
  });

  it("recommends buying the slab when grading costs as much as the slab (no edge)", () => {
    // $250 raw + $92 = $342 > $300 slab → edge negative, even at 90% gem.
    const r = g({ rawValueCents: 250_00, gemRatePct: 90 });
    expect(r.edgeCents).toBeLessThanOrEqual(0);
    expect(r.verdict).toBe("Buy the slab");
  });

  it("calls it either way for a middling gem rate with an edge", () => {
    expect(g({ gemRatePct: 50 }).verdict).toBe("Either way");
  });

  it("low pop tips an either-way into buying + holding the scarce slab", () => {
    const r = g({ gemRatePct: 50, psa10Pop: 300 }); // Low tier
    expect(r.verdict).toBe("Buy the slab");
    expect(r.longTermHold).toBe(true);
    expect(r.popTier?.key).toBe("Low");
    expect(r.reason).toMatch(/hold/i);
  });

  it("ultra-low pop flags a grade-it play as a long-term hold too", () => {
    const r = g({ psa10Pop: 40 }); // Ultra Low tier
    expect(r.verdict).toBe("Grade it");
    expect(r.longTermHold).toBe(true);
    expect(r.popTier?.key).toBe("UltraLow");
  });

  it("very high pop frames it as a flip, not a hold", () => {
    const r = g({ psa10Pop: 15000 }); // Very High tier
    expect(r.longTermHold).toBe(false);
    expect(r.reason).toMatch(/flip/i);
  });

  it("medium/high pop stays neutral (no long-term tilt)", () => {
    expect(g({ gemRatePct: 50, psa10Pop: 1500 }).verdict).toBe("Either way"); // Medium
    expect(g({ gemRatePct: 50, psa10Pop: 5000 }).longTermHold).toBe(false); // High
  });

  it("skips when there is no PSA 10 price to compare against", () => {
    expect(g({ psa10Cents: 0 }).verdict).toBe("Skip");
  });
});

describe("classifyPop", () => {
  it("buckets population counts into the five tiers at the right boundaries", () => {
    expect(classifyPop(0)?.key).toBe("UltraLow");
    expect(classifyPop(100)?.key).toBe("UltraLow");
    expect(classifyPop(101)?.key).toBe("Low");
    expect(classifyPop(500)?.key).toBe("Low");
    expect(classifyPop(501)?.key).toBe("Medium");
    expect(classifyPop(2000)?.key).toBe("Medium");
    expect(classifyPop(2001)?.key).toBe("High");
    expect(classifyPop(10000)?.key).toBe("High");
    expect(classifyPop(10001)?.key).toBe("VeryHigh");
    expect(classifyPop(250000)?.key).toBe("VeryHigh");
  });

  it("returns null for unknown / blank / negative", () => {
    expect(classifyPop(null)).toBeNull();
    expect(classifyPop(undefined)).toBeNull();
    expect(classifyPop(-5)).toBeNull();
  });

  it("each tier carries a label and an investment outlook", () => {
    const t = classifyPop(300);
    expect(t?.label).toBe("Low");
    expect(t?.outlook).toMatch(/scarcity|liquidity/i);
  });
});

describe("recommendation thresholds", () => {
  it("maps ROI bands per spec", () => {
    expect(recommend(5)).toBe("Skip");
    expect(recommend(10)).toBe("Borderline");
    expect(recommend(30)).toBe("Borderline");
    expect(recommend(31)).toBe("Good Candidate");
    expect(recommend(50)).toBe("Good Candidate");
    expect(recommend(51)).toBe("Excellent Candidate");
    expect(recommend(75)).toBe("Excellent Candidate");
    expect(recommend(76)).toBe("Must Buy");
  });

  it("colors: red <10, yellow 10–30, green 30+", () => {
    expect(tone(9.9)).toBe("red");
    expect(tone(10)).toBe("yellow");
    expect(tone(30)).toBe("yellow");
    expect(tone(30.1)).toBe("green");
  });
});
