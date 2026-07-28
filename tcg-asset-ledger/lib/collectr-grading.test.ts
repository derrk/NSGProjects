import { describe, it, expect } from "vitest";
import { type CollectrRow } from "./collectr";
import {
  classifyCollectrGrade,
  collectrRowsToGradingPlays,
} from "./collectr-grading";
import { GRADING_COST_DEFAULTS } from "./grading-play";

// Minimal CollectrRow factory — only the fields the grouping reads matter.
function row(over: Partial<CollectrRow>): CollectrRow {
  return {
    portfolio: "Grading Candidates",
    game: "Pokemon",
    categoryRaw: "Pokemon",
    set: "Base",
    name: "Charizard",
    cardNumber: "4",
    rarity: null,
    variant: null,
    grade: null,
    condition: null,
    assetType: "RawCard",
    quantity: 1,
    costBasisCents: 0,
    marketValueCents: 0,
    priceOverrideCents: null,
    watchlist: false,
    collectrDateAdded: null,
    notes: null,
    naturalKey: "",
    ...over,
  };
}

describe("classifyCollectrGrade", () => {
  it("treats blank / Ungraded / Raw as raw", () => {
    expect(classifyCollectrGrade(null)).toBe("raw");
    expect(classifyCollectrGrade("")).toBe("raw");
    expect(classifyCollectrGrade("Ungraded")).toBe("raw");
    expect(classifyCollectrGrade("Raw")).toBe("raw");
  });

  it("maps PSA 10 (verbose Collectr label) to psa10", () => {
    expect(classifyCollectrGrade("PSA 10.0 GEM - MT")).toBe("psa10");
    expect(classifyCollectrGrade("CGC 10")).toBe("psa10");
  });

  it("maps BGS 10 and Black Label to their own buckets, not PSA 10", () => {
    expect(classifyCollectrGrade("BGS 10")).toBe("bgs10");
    expect(classifyCollectrGrade("BGS 10.0 PRISTINE")).toBe("bgs10");
    expect(classifyCollectrGrade("BGS 10 Black Label")).toBe("blacklabel");
    expect(classifyCollectrGrade("Black Label")).toBe("blacklabel");
  });

  it("maps 9.x → psa9 and 8.x → psa8; junk → other", () => {
    expect(classifyCollectrGrade("PSA 9")).toBe("psa9");
    expect(classifyCollectrGrade("BGS 9.5")).toBe("psa9");
    expect(classifyCollectrGrade("PSA 8.5")).toBe("psa8");
    expect(classifyCollectrGrade("PSA 7")).toBe("other");
    expect(classifyCollectrGrade("Authentic")).toBe("other");
  });
});

describe("collectrRowsToGradingPlays", () => {
  it("groups raw + PSA 10 + BGS 10 of one card into a single wanted play", () => {
    const plays = collectrRowsToGradingPlays([
      row({ name: "Charizard", grade: "Ungraded", marketValueCents: 100_00 }),
      row({ name: "Charizard", grade: "PSA 10.0 GEM - MT", marketValueCents: 500_00 }),
      row({ name: "Charizard", grade: "BGS 10", marketValueCents: 650_00 }),
    ]);
    expect(plays).toHaveLength(1);
    const p = plays[0];
    expect(p.rawValueCents).toBe(100_00);
    expect(p.psa10Cents).toBe(500_00);
    expect(p.bgs10Cents).toBe(650_00);
    expect(p.status).toBe("LookingFor"); // wanted play — the action sets assetId: null
    expect("assetId" in p).toBe(false); // never carries an inventory link
    expect(p.purchasePriceCents).toBeNull();
    expect(p.gemRatePct).toBe(50);
  });

  it("carries the grading-cost defaults onto every candidate", () => {
    const [p] = collectrRowsToGradingPlays([
      row({ grade: "Ungraded", marketValueCents: 10_00 }),
      row({ grade: "PSA 10", marketValueCents: 90_00 }),
    ]);
    expect(p.feeCents).toBe(GRADING_COST_DEFAULTS.feeCents);
    expect(p.shippingCents).toBe(GRADING_COST_DEFAULTS.shippingCents);
    expect(p.insuranceCents).toBe(GRADING_COST_DEFAULTS.insuranceCents);
    expect(p.preGradingFeeCents).toBe(GRADING_COST_DEFAULTS.preGradingFeeCents);
  });

  it("prefers an explicit price override over market value", () => {
    const [p] = collectrRowsToGradingPlays([
      row({ grade: "Ungraded", marketValueCents: 10_00, priceOverrideCents: 25_00 }),
      row({ grade: "PSA 10", marketValueCents: 90_00 }),
    ]);
    expect(p.rawValueCents).toBe(25_00);
  });

  it("keeps different cards in separate candidates", () => {
    const plays = collectrRowsToGradingPlays([
      row({ name: "Charizard", cardNumber: "4", grade: "PSA 10", marketValueCents: 500_00 }),
      row({ name: "Blastoise", cardNumber: "9", grade: "PSA 10", marketValueCents: 300_00 }),
    ]);
    expect(plays).toHaveLength(2);
    expect(plays.map((p) => p.name).sort()).toEqual(["Blastoise", "Charizard"]);
  });

  it("groups across zero-padded card-number differences (038 vs 38)", () => {
    const plays = collectrRowsToGradingPlays([
      row({ cardNumber: "038", grade: "Ungraded", marketValueCents: 40_00 }),
      row({ cardNumber: "38", grade: "PSA 10", marketValueCents: 200_00 }),
    ]);
    expect(plays).toHaveLength(1);
    expect(plays[0].rawValueCents).toBe(40_00);
    expect(plays[0].psa10Cents).toBe(200_00);
  });

  it("when a grade repeats (NM vs LP raw), the highest market value wins", () => {
    const [p] = collectrRowsToGradingPlays([
      row({ grade: "Ungraded", condition: "Near Mint", marketValueCents: 60_00 }),
      row({ grade: "Ungraded", condition: "Lightly Played", marketValueCents: 40_00 }),
      row({ grade: "PSA 10", marketValueCents: 300_00 }),
    ]);
    expect(p.rawValueCents).toBe(60_00);
  });

  it("a candidate with no PSA 10 comp keeps psa10 = 0 (caller's guard drops it)", () => {
    const [p] = collectrRowsToGradingPlays([
      row({ grade: "Ungraded", marketValueCents: 40_00 }),
      row({ grade: "BGS 10", marketValueCents: 500_00 }),
    ]);
    expect(p.psa10Cents).toBe(0);
    expect(p.bgs10Cents).toBe(500_00);
  });

  it("also captures PSA 9 / PSA 8 / Black Label comps when present", () => {
    const [p] = collectrRowsToGradingPlays([
      row({ grade: "Ungraded", marketValueCents: 40_00 }),
      row({ grade: "PSA 10", marketValueCents: 200_00 }),
      row({ grade: "PSA 9", marketValueCents: 120_00 }),
      row({ grade: "PSA 8", marketValueCents: 80_00 }),
      row({ grade: "Black Label", marketValueCents: 900_00 }),
    ]);
    expect(p.psa9Cents).toBe(120_00);
    expect(p.psa8Cents).toBe(80_00);
    expect(p.bgsBlackLabelCents).toBe(900_00);
  });

  it("clamps the default gem rate to 0–100", () => {
    expect(collectrRowsToGradingPlays([row({ grade: "PSA 10", marketValueCents: 1 })], { defaultGemRatePct: 150 })[0].gemRatePct).toBe(100);
    expect(collectrRowsToGradingPlays([row({ grade: "PSA 10", marketValueCents: 1 })], { defaultGemRatePct: -5 })[0].gemRatePct).toBe(0);
  });
});
