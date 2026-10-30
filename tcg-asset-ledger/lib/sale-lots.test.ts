import { describe, it, expect } from "vitest";
import { lotEconomics, econFor, type LotItemEcon } from "./sale-lots";

const items: LotItemEcon[] = [
  { basisCents: 20_00, marketCents: 30_00, quantity: 1 },
  { basisCents: 10_00, marketCents: 15_00, quantity: 2 }, // $20 basis, $30 market
];

describe("lotEconomics", () => {
  it("sums basis, market, and unit count across items", () => {
    const e = lotEconomics(items, null, null);
    expect(e.totalBasisCents).toBe(20_00 + 2 * 10_00); // $40
    expect(e.totalMarketCents).toBe(30_00 + 2 * 15_00); // $60
    expect(e.unitCount).toBe(3);
  });

  it("leaves fees/profit null until sale figures are entered (open lot)", () => {
    const e = lotEconomics(items, null, null);
    expect(e.feesCents).toBeNull();
    expect(e.profitCents).toBeNull();
  });

  it("fees = gross − net; profit = net − basis", () => {
    // Sold the lot for $100 gross, netted $88 after fees.
    const e = lotEconomics(items, 100_00, 88_00);
    expect(e.feesCents).toBe(12_00);
    expect(e.profitCents).toBe(88_00 - 40_00); // $48
  });

  it("a lot sold below basis shows a loss", () => {
    const e = lotEconomics(items, 40_00, 35_00);
    expect(e.profitCents).toBe(35_00 - 40_00); // −$5
  });

  it("fees never go negative if net somehow exceeds gross", () => {
    const e = lotEconomics(items, 50_00, 60_00);
    expect(e.feesCents).toBe(0);
  });
});

describe("econFor — snapshot vs live basis", () => {
  // Live items now say basis $40 total (a card was re-acquired at a higher basis).
  const liveItems: LotItemEcon[] = [{ basisCents: 40_00, marketCents: 60_00, quantity: 1 }];

  it("an OPEN lot uses the live item basis", () => {
    const e = econFor({ status: "Open", grossCents: null, netCents: null, totalBasisCents: null }, liveItems);
    expect(e.totalBasisCents).toBe(40_00);
  });

  it("a SOLD lot uses the frozen snapshot basis, not the drifted live basis", () => {
    // At settle the basis was $20 and it sold net $50 → profit $30. Live basis has since risen to $40.
    const e = econFor({ status: "Sold", grossCents: 60_00, netCents: 50_00, totalBasisCents: 20_00 }, liveItems);
    expect(e.totalBasisCents).toBe(20_00); // snapshot, not 40
    expect(e.profitCents).toBe(30_00); // 50 − 20, matches the ledger — didn't drift to 10
  });

  it("a SOLD lot with no snapshot falls back to live (legacy safety)", () => {
    const e = econFor({ status: "Sold", grossCents: 60_00, netCents: 50_00, totalBasisCents: null }, liveItems);
    expect(e.totalBasisCents).toBe(40_00);
  });
});
