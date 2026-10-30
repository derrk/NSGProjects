import { describe, it, expect } from "vitest";
import { analyzeCard, planLiquidation, shippingFor, DEFAULT_SHIP } from "./sell-channel";

const chan = (a: ReturnType<typeof analyzeCard>, key: string) => a.perChannel.find((c) => c.key === key)!;

describe("shippingFor", () => {
  it("$6 over $50, $1 at/under, $0 for non-shipping channels", () => {
    expect(shippingFor(100_00, true, DEFAULT_SHIP)).toBe(6_00);
    expect(shippingFor(50_00, true, DEFAULT_SHIP)).toBe(1_00); // exactly $50 = not over
    expect(shippingFor(20_00, true, DEFAULT_SHIP)).toBe(1_00);
    expect(shippingFor(100_00, false, DEFAULT_SHIP)).toBe(0);
  });
});

describe("analyzeCard — the user's examples", () => {
  it("$80 basis / $100 market → hold for a show (fees+shipping gut the margin)", () => {
    const a = analyzeCard(80_00, 100_00);
    expect(chan(a, "show").netCents).toBe(100_00);
    expect(chan(a, "show").profitCents).toBe(20_00);
    // TCGplayer: 100 − 12% − $6 = $82 net, $2 profit
    expect(chan(a, "tcgplayer").netCents).toBe(82_00);
    expect(chan(a, "tcgplayer").profitCents).toBe(2_00);
    expect(a.recommendation.action).toBe("hold");
    expect(a.recommendation.channelKey).toBe("show");
  });

  it("$10 basis / $100 market → sell online (still a healthy profit, fast cash)", () => {
    const a = analyzeCard(10_00, 100_00);
    // show profit $90; TCGplayer net $82, profit $72 → 80% retention ≥ 60%
    expect(chan(a, "tcgplayer").profitCents).toBe(72_00);
    expect(a.recommendation.action).toBe("sell");
    expect(["tcgplayer", "whatnot"]).toContain(a.recommendation.channelKey);
  });

  it("picks the higher-net online channel (Whatnot's lower fee) as best", () => {
    const a = analyzeCard(10_00, 100_00);
    // Whatnot 8% → net $86 beats TCGplayer 12% → $82
    expect(a.bestOnline?.key).toBe("whatnot");
    expect(chan(a, "whatnot").netCents).toBe(86_00);
  });

  it("under-$50 card uses $1 shipping", () => {
    const a = analyzeCard(5_00, 40_00);
    expect(chan(a, "tcgplayer").shippingCents).toBe(1_00);
    expect(chan(a, "tcgplayer").netCents).toBe(40_00 - Math.round(40_00 * 0.12) - 1_00);
  });

  it("underwater card → hold (a show loses the least)", () => {
    const a = analyzeCard(120_00, 100_00);
    expect(a.showProfitCents).toBeLessThan(0);
    expect(a.recommendation.action).toBe("hold");
    expect(a.recommendation.channelKey).toBe("show");
  });
});

describe("planLiquidation", () => {
  const cards = [
    { id: "a", name: "Cheap→High", basisCents: 10_00, marketCents: 100_00 }, // online net $86, sacrifice small
    { id: "b", name: "Thin margin", basisCents: 80_00, marketCents: 100_00 }, // online net $86, sacrifice big
    { id: "c", name: "Mid", basisCents: 30_00, marketCents: 60_00 }, // online net ~$49
  ];

  it("raises the target with the least profit sacrificed first", () => {
    const plan = planLiquidation(cards, 80_00);
    expect(plan.raisedCents).toBeGreaterThanOrEqual(80_00);
    expect(plan.targetMet).toBe(true);
    // The most efficient (least sacrifice per $) card is picked first — the cheap→high card.
    expect(plan.picks[0].id).toBe("a");
  });

  it("reports shortfall when the target can't be met", () => {
    const plan = planLiquidation(cards, 100_000_00);
    expect(plan.targetMet).toBe(false);
    expect(plan.raisedCents).toBeLessThan(100_000_00);
  });

  it("stops once the target is reached (doesn't liquidate everything)", () => {
    const plan = planLiquidation(cards, 50_00);
    expect(plan.picks.length).toBeLessThan(cards.length);
  });
});
