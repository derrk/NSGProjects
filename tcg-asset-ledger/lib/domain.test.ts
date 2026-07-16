import { describe, it, expect } from "vitest";
import { buildNaturalKey, normalizeCardNumber } from "./domain";

describe("normalizeCardNumber", () => {
  it("strips leading zeros within digit runs", () => {
    expect(normalizeCardNumber("038")).toBe("38");
    expect(normalizeCardNumber("38")).toBe("38");
    expect(normalizeCardNumber("005/131")).toBe("5/131");
    expect(normalizeCardNumber("256/217")).toBe("256/217");
    expect(normalizeCardNumber("SWSH262")).toBe("swsh262");
    expect(normalizeCardNumber("")).toBe("");
    expect(normalizeCardNumber(null)).toBe("");
  });
});

describe("buildNaturalKey — Collectr zero-pad resilience", () => {
  const base = {
    game: "Pokemon",
    set: "Mega Evolution Promos",
    name: "N's Zekrom",
    variant: "Holofoil",
    grade: "Ungraded",
    condition: "Near Mint",
  };

  it("treats zero-padded and unpadded card numbers as the same card", () => {
    const a = buildNaturalKey({ ...base, cardNumber: "31" });
    const b = buildNaturalKey({ ...base, cardNumber: "031" });
    expect(a).toBe(b);
  });

  it("still distinguishes genuinely different card numbers", () => {
    const a = buildNaturalKey({ ...base, cardNumber: "31" });
    const b = buildNaturalKey({ ...base, cardNumber: "32" });
    expect(a).not.toBe(b);
  });
});
