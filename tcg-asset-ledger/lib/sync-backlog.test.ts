import { describe, it, expect } from "vitest";
import { desiredSyncKind, syncNote } from "./sync-backlog";

const base = {
  status: "InStock",
  quantity: 1,
  inCollectr: false,
  costBasisCents: 7000, // $70
  collectrCostCents: null as number | null,
  collectrQuantity: null as number | null,
  marketValueCents: 10000, // $100
  priceOverrideCents: null as number | null,
};

describe("desiredSyncKind — the Collectr backlog rules", () => {
  it("a card bought in the app (not in Collectr) needs an add", () => {
    expect(desiredSyncKind({ ...base })).toBe("add");
  });

  it("a card never in Collectr that's already gone needs nothing", () => {
    expect(desiredSyncKind({ ...base, status: "Sold", quantity: 0 })).toBe(null);
  });

  it("a card in Collectr with matching cost is in sync", () => {
    expect(desiredSyncKind({ ...base, inCollectr: true, collectrCostCents: 7000 })).toBe(null);
  });

  it("app has a real basis but Collectr shows $0 → update (push the cost)", () => {
    // Trades/buys compute a basis Collectr can't know. Tell Collectr to set it.
    expect(desiredSyncKind({ ...base, inCollectr: true, collectrCostCents: 0 })).toBe("update");
  });

  it("cost unknown (null, e.g. just marked done) → no re-nag", () => {
    expect(desiredSyncKind({ ...base, inCollectr: true, collectrCostCents: null })).toBe(null);
  });

  it("both app basis and Collectr cost are $0 → nothing to push", () => {
    expect(
      desiredSyncKind({ ...base, inCollectr: true, costBasisCents: 0, collectrCostCents: 0 }),
    ).toBe(null);
  });

  it("conflicting non-zero Collectr cost → update", () => {
    expect(desiredSyncKind({ ...base, inCollectr: true, collectrCostCents: 6500 })).toBe("update");
  });

  it("sold card still listed in Collectr → remove", () => {
    expect(
      desiredSyncKind({ ...base, inCollectr: true, collectrCostCents: 7000, status: "Sold", quantity: 0 }),
    ).toBe("remove");
  });

  it("traded-away card still listed in Collectr → remove", () => {
    expect(
      desiredSyncKind({ ...base, inCollectr: true, status: "Traded", quantity: 0 }),
    ).toBe("remove");
  });

  it("partial sale: sold 2 of 5 → quantity drift surfaces an update", () => {
    // The high-severity review finding: Collectr still shows 5.
    expect(
      desiredSyncKind({
        ...base,
        inCollectr: true,
        quantity: 3,
        collectrQuantity: 5,
        collectrCostCents: 7000,
      }),
    ).toBe("update");
  });

  it("quantities matching → in sync", () => {
    expect(
      desiredSyncKind({
        ...base,
        inCollectr: true,
        quantity: 5,
        collectrQuantity: 5,
        collectrCostCents: 7000,
      }),
    ).toBe(null);
  });

  it("unknown Collectr quantity (manually marked done) → no qty nag", () => {
    expect(
      desiredSyncKind({
        ...base,
        inCollectr: true,
        quantity: 3,
        collectrQuantity: null,
        collectrCostCents: null,
      }),
    ).toBe(null);
  });

  it("card at PSA (Grading) is still owned — never a remove", () => {
    expect(
      desiredSyncKind({ ...base, inCollectr: true, status: "Grading", collectrCostCents: 7000 }),
    ).toBe(null);
    expect(desiredSyncKind({ ...base, status: "Grading" })).toBe("add");
  });

  it("qty note names both sides", () => {
    const note = syncNote(
      { ...base, inCollectr: true, quantity: 3, collectrQuantity: 5, collectrCostCents: 7000 },
      "update",
    );
    expect(note).toContain("set quantity to 3");
    expect(note).toContain("Collectr shows 5");
  });
});
