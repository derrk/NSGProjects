import { describe, it, expect } from "vitest";
import { ripEconomics, type RipLine } from "./rips";

describe("ripEconomics", () => {
  it("cost = sealed basis out, pulled = market of the cards in, net = pulled − cost", () => {
    const lines: RipLine[] = [
      { direction: "OUT", quantity: 1, unitValueCents: 0, unitBasisCents: 120_00 }, // $120 ETB
      { direction: "IN", quantity: 1, unitValueCents: 30_00, unitBasisCents: 0 }, // chase $30
      { direction: "IN", quantity: 4, unitValueCents: 5_00, unitBasisCents: 0 }, // 4 hits @ $5
    ];
    const e = ripEconomics(lines);
    expect(e.costCents).toBe(120_00);
    expect(e.pulledValueCents).toBe(30_00 + 4 * 5_00); // $50
    expect(e.netCents).toBe(50_00 - 120_00); // −$70 (the fun tax)
    expect(e.pullCount).toBe(5);
  });

  it("a big hit flips the rip positive", () => {
    const e = ripEconomics([
      { direction: "OUT", quantity: 1, unitValueCents: 0, unitBasisCents: 100_00 },
      { direction: "IN", quantity: 1, unitValueCents: 400_00, unitBasisCents: 0 },
    ]);
    expect(e.netCents).toBe(300_00);
  });

  it("multiple sealed units sum their basis", () => {
    const e = ripEconomics([
      { direction: "OUT", quantity: 2, unitValueCents: 0, unitBasisCents: 90_00 },
      { direction: "IN", quantity: 1, unitValueCents: 10_00, unitBasisCents: 0 },
    ]);
    expect(e.costCents).toBe(180_00);
    expect(e.netCents).toBe(10_00 - 180_00);
  });
});
