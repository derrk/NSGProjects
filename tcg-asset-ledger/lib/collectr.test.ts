import { describe, it, expect } from "vitest";
import { parseCollectrCsv, parseAsOfDate, effectiveMarketCents } from "./collectr";

// A slice of the real Collectr export (header + representative rows).
const SAMPLE = `Portfolio Name,Category,Set,Product Name,Card Number,Rarity,Variance,Grade,Card Condition,Average Cost Paid,Quantity,Market Price (As of 2026-07-07),Price Override,Watchlist,Date Added,Notes
full collection,One Piece,500 Years in the Future,Monkey.D.Luffy (109),OP07-109,SR,Foil,Ungraded,Near Mint,0,1,3.88,0,FALSE,6/30/2026,
full collection,One Piece,Carrying On His Will,Portgas.D.Ace (119) (Parallel),OP13-119,SEC,Foil,Ungraded,Near Mint,10,1,21.77,0,FALSE,6/30/2026,
full collection,One Piece,Extra Booster: One Piece Heroine's Edition,Uta (061) (Alternate Art),EB03-061,SEC,Foil,PSA 10.0 GEM - MT,Near Mint,31,2,73.34,78,FALSE,6/3/2026,
full collection,One Piece,The Time of Battle,DON!! Card (Alternate Art) (Gold),,DON!!,Foil,Ungraded,Near Mint,0,1,5.94,0,FALSE,6/27/2026,
full collection,Pokemon,Base Set (1st Edition & Shadowless),Ninetales,12,Holo Rare,Shadowless Holofoil,Ungraded,Moderately Played,0,1,87.05,0,FALSE,7/6/2026,`;

describe("parseAsOfDate", () => {
  it("extracts the date from the market price header", () => {
    const d = parseAsOfDate("Market Price (As of 2026-07-07)");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(6); // July (0-indexed)
    expect(d?.getDate()).toBe(7);
  });
});

describe("parseCollectrCsv", () => {
  const parsed = parseCollectrCsv(SAMPLE);

  it("has no fatal errors and reads all rows", () => {
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(5);
    expect(parsed.asOfDate?.getDate()).toBe(7);
  });

  it("maps games and money correctly", () => {
    const luffy = parsed.rows[0];
    expect(luffy.game).toBe("One Piece");
    expect(luffy.marketValueCents).toBe(388);
    expect(luffy.costBasisCents).toBe(0);
    expect(luffy.assetType).toBe("RawCard");
  });

  it("detects graded cards and price overrides", () => {
    const uta = parsed.rows[2];
    expect(uta.grade).toBe("PSA 10.0 GEM - MT");
    expect(uta.assetType).toBe("GradedCard");
    expect(uta.quantity).toBe(2);
    expect(uta.costBasisCents).toBe(3100); // $31 avg
    expect(uta.priceOverrideCents).toBe(7800); // $78 override
    expect(effectiveMarketCents(uta)).toBe(7800); // override wins
  });

  it("handles a blank card number (the DON!! card)", () => {
    const don = parsed.rows[3];
    expect(don.cardNumber).toBeNull();
    expect(don.name).toContain("DON!!");
    expect(don.naturalKey).toContain("|"); // still builds a key
  });

  it("keeps non-NM conditions", () => {
    const nine = parsed.rows[4];
    expect(nine.game).toBe("Pokemon");
    expect(nine.condition).toBe("Moderately Played");
    expect(nine.variant).toBe("Shadowless Holofoil");
  });

  it("builds unique natural keys per distinct card", () => {
    const keys = new Set(parsed.rows.map((r) => r.naturalKey));
    expect(keys.size).toBe(5);
  });
});
