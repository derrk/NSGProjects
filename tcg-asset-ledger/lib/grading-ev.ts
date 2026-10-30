// EV-based grading play engine — PURE, side-effect-free. All money is DOLLARS
// (floats) here to match the spec's acceptance vectors exactly; the app stores
// cents and converts at the boundary. Nothing in this file does I/O.
//
// Model (spec §3):
//   net(g)   = price(g)*(1 - fee) - shipping_out
//   all_in   = raw + grading_fee + shipping_in (+ membership amortized, optional)
//   p10      = gem_rate_adjusted (capped)
//   p9/p8    = split the non-gem remainder
//   EV       = p10*net10 + p9*net9 + p8*net8 ; roi = (EV - all_in)/all_in
//   breakeven_gem = clamp((all_in - net9)/(net10 - net9), 0, 1)
//   max_buy(t)    = EV/(1+t) - fixed_costs

export interface EvConfig {
  marketplaceFeeRate: number;
  shippingOut: number;
  gradingFee: number;
  shippingInPerCard: number;
  membershipAnnual: number;
  membershipAmortize: boolean;
  expectedAnnualCards: number;
  targetRoiFloor: number;
  downsideRecoveryFloor: number;
  liquidityFloorSales30d: number;
  gemMarginFloor: number;
  gradeSplit9: number;
  psa8PriceFallbackMult: number;
  staleDays: number;
  rejectRecoveryRate: number;
  qcUpliftTable: Record<number, number>;
  p10Cap: number;
  personalBlendK: number;
  dvCap: number;
  insuranceSurchargeThreshold: number;
  insuranceSurchargeRate: number;
  feeDominatedFloor: number;
  /** Fallback gem rate (0..1) per game when a card has no real pop number. */
  defaultGemByGame: Record<string, number>;
}

export const DEFAULT_EV_CONFIG: EvConfig = {
  marketplaceFeeRate: 0.13,
  shippingOut: 5.0,
  gradingFee: 80.0,
  shippingInPerCard: 10.0,
  membershipAnnual: 149.0,
  membershipAmortize: false,
  expectedAnnualCards: 78,
  targetRoiFloor: 0.4,
  downsideRecoveryFloor: 0.65,
  liquidityFloorSales30d: 5,
  gemMarginFloor: 0.15,
  gradeSplit9: 0.875,
  psa8PriceFallbackMult: 0.5,
  staleDays: 14,
  rejectRecoveryRate: 0.85,
  qcUpliftTable: { 2: 0.05, 3: 0.08, 4: 0.09, 5: 0.1 },
  p10Cap: 0.9,
  personalBlendK: 10,
  dvCap: 1500,
  insuranceSurchargeThreshold: 499,
  insuranceSurchargeRate: 0.02,
  feeDominatedFloor: 250,
  defaultGemByGame: { "One Piece": 0.75, Pokemon: 0.4 },
};

export type Verdict = "BUY" | "WATCH" | "PASS";

export interface CardInputs {
  rawPrice: number;
  psa10Price: number;
  psa9Price: number | null;
  psa8Price: number | null;
  /** gem_rate_adjusted — the blended (+QC) probability of a PSA 10, 0..1. */
  gemRate: number;
  sales30d: number | null;
  dataAgeDays: number;
}

export interface EvResult {
  net10: number;
  net9: number;
  net8: number;
  fixedCosts: number;
  allIn: number;
  p10: number;
  p9: number;
  p8: number;
  expectedProceeds: number;
  expectedProfit: number;
  roi: number;
  breakevenGem: number;
  gemMargin: number;
  maxBuyAtFloor: number;
  verdict: Verdict;
  reasonCode: string;
  reason: string;
  warnings: string[];
  psa8Estimated: boolean;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Net proceeds after marketplace fees and outbound shipping. */
export function net(price: number, cfg: EvConfig): number {
  return price * (1 - cfg.marketplaceFeeRate) - cfg.shippingOut;
}

export function fixedCosts(cfg: EvConfig): number {
  return (
    cfg.gradingFee +
    cfg.shippingInPerCard +
    (cfg.membershipAmortize ? cfg.membershipAnnual / cfg.expectedAnnualCards : 0)
  );
}

/** Highest raw buy price that still hits a target ROI (exact — EV is raw-independent). */
export function maxBuyPrice(expectedProceeds: number, fc: number, target: number): number {
  return expectedProceeds / (1 + target) - fc;
}

function warningsFor(psa10Price: number, cfg: EvConfig, psa8Estimated: boolean): string[] {
  const w: string[] = [];
  if (psa10Price > cfg.dvCap) w.push("upcharge_risk");
  if (psa10Price > cfg.insuranceSurchargeThreshold) w.push("insurance_surcharge");
  if (psa10Price < cfg.feeDominatedFloor) w.push("fee_dominated");
  if (psa8Estimated) w.push("estimated_psa8");
  return w;
}

/**
 * Evaluate a single card. `allInOverride` / `p10Override` support best-of-N
 * (§5.4) — pass the effective all-in and effective p10.
 */
export function evaluateCard(
  inp: CardInputs,
  cfg: EvConfig = DEFAULT_EV_CONFIG,
  opts?: { allInOverride?: number },
): EvResult {
  const fc = fixedCosts(cfg);
  const allIn = opts?.allInOverride ?? inp.rawPrice + fc;

  // psa8 fallback (never guess the 9).
  let psa8 = inp.psa8Price;
  let psa8Estimated = false;
  if (psa8 == null && inp.psa9Price != null) {
    psa8 = cfg.psa8PriceFallbackMult * inp.psa9Price;
    psa8Estimated = true;
  }
  const warnings = warningsFor(inp.psa10Price, cfg, psa8Estimated);

  const base = (verdict: Verdict, reasonCode: string, reason: string, extra: Partial<EvResult> = {}): EvResult => ({
    net10: 0, net9: 0, net8: 0, fixedCosts: fc, allIn, p10: 0, p9: 0, p8: 0,
    expectedProceeds: 0, expectedProfit: 0, roi: 0, breakevenGem: 0, gemMargin: 0,
    maxBuyAtFloor: 0, verdict, reasonCode, reason, warnings, psa8Estimated, ...extra,
  });

  // Missing PSA 9 → never guess it → WATCH.
  if (inp.psa9Price == null) {
    return base("WATCH", "insufficient_comps", "WATCH — no PSA 9 comp (won't guess it)");
  }

  const net10 = net(inp.psa10Price, cfg);
  const net9 = net(inp.psa9Price, cfg);
  const net8 = net(psa8 ?? 0, cfg);

  // Inverted comps → break-even undefined → automatic PASS.
  if (net10 <= net9) {
    return base("PASS", "inverted_comps", "PASS — PSA 10 net ≤ PSA 9 net (inverted comps)", { net10, net9, net8 });
  }

  const p10 = clamp(inp.gemRate, 0, cfg.p10Cap);
  const p9 = (1 - p10) * cfg.gradeSplit9;
  const p8 = (1 - p10) * (1 - cfg.gradeSplit9);

  const expectedProceeds = p10 * net10 + p9 * net9 + p8 * net8;
  const expectedProfit = expectedProceeds - allIn;
  const roi = allIn > 0 ? expectedProfit / allIn : 0;

  const breakevenGem = clamp((allIn - net9) / (net10 - net9), 0, 1);
  const gemMargin = p10 - breakevenGem;
  const maxBuyAtFloor = maxBuyPrice(expectedProceeds, fc, cfg.targetRoiFloor);

  const shared = {
    net10, net9, net8, p10, p9, p8, expectedProceeds, expectedProfit, roi,
    breakevenGem, gemMargin, maxBuyAtFloor,
  };

  // max_buy < 0 → PASS.
  if (maxBuyAtFloor < 0) {
    return base("PASS", "max_buy_negative", "PASS — even a free card misses the ROI floor", shared);
  }

  // Verdict gates (§8).
  const gDownside = net9 / allIn >= cfg.downsideRecoveryFloor;
  const gLiquidity = (inp.sales30d ?? 0) >= cfg.liquidityFloorSales30d;
  const gGem = gemMargin >= cfg.gemMarginFloor;
  const gRoi = roi >= cfg.targetRoiFloor;
  const gFresh = inp.dataAgeDays <= cfg.staleDays;

  const fails: { code: string; text: string }[] = [];
  if (!gRoi) fails.push({ code: "roi", text: `ROI ${(roi * 100).toFixed(0)}% < ${(cfg.targetRoiFloor * 100).toFixed(0)}%` });
  if (!gGem) fails.push({ code: "gem_margin", text: `gem margin ${(gemMargin * 100).toFixed(0)}pts < ${(cfg.gemMarginFloor * 100).toFixed(0)}pts` });
  if (!gDownside) fails.push({ code: "downside", text: `PSA 9 recovers ${((net9 / allIn) * 100).toFixed(0)}% < ${(cfg.downsideRecoveryFloor * 100).toFixed(0)}%` });
  if (!gLiquidity) fails.push({ code: "liquidity", text: `liquidity ${inp.sales30d ?? 0}/30d < ${cfg.liquidityFloorSales30d}` });
  if (!gFresh) fails.push({ code: "stale_data", text: `data ${inp.dataAgeDays}d old > ${cfg.staleDays}d` });

  if (fails.length === 0) {
    return base("BUY", "buy", `BUY — ROI ${(roi * 100).toFixed(0)}%, gem margin ${(gemMargin * 100).toFixed(0)}pts`, shared);
  }

  const binding = fails[0];
  const watch =
    fails.length === 1 ||
    roi >= cfg.targetRoiFloor - 0.15 ||
    !gFresh;
  const verdict: Verdict = watch ? "WATCH" : "PASS";
  const reasonCode = !gFresh && fails.length === 1 ? "stale_data" : binding.code;
  return base(verdict, reasonCode, `${verdict} — ${binding.text}`, shared);
}

// ── Gem-rate blending (§4) ────────────────────────────────────────────────────

/** Blend a personal gem rate with the population prior. */
export function blendGemRate(
  personalRate: number | null,
  nPersonal: number,
  populationRate: number,
  cfg: EvConfig = DEFAULT_EV_CONFIG,
): number {
  if (personalRate == null || nPersonal <= 0) return populationRate;
  const K = cfg.personalBlendK;
  return (nPersonal * personalRate + K * populationRate) / (nPersonal + K);
}

// ── Best-of-N (§5.4) ──────────────────────────────────────────────────────────

export interface BestOfNResult extends EvResult {
  recovered: number;
  effectiveAllIn: number;
  p10Effective: number;
}

/** Model buying N copies and grading only the best one. */
export function evaluateBestOfN(
  rawPrices: number[],
  otherInputs: Omit<CardInputs, "rawPrice">,
  cfg: EvConfig = DEFAULT_EV_CONFIG,
): BestOfNResult {
  const N = rawPrices.length;
  const fc = fixedCosts(cfg);
  const sumRaw = rawPrices.reduce((s, p) => s + p, 0);
  const avgRaw = N > 0 ? sumRaw / N : 0;
  const recovered = (N - 1) * avgRaw * cfg.rejectRecoveryRate;
  const effectiveAllIn = sumRaw + fc - recovered;
  const uplift = cfg.qcUpliftTable[N] ?? 0;
  const p10Effective = Math.min(otherInputs.gemRate + uplift, cfg.p10Cap);

  const res = evaluateCard(
    { ...otherInputs, rawPrice: avgRaw, gemRate: p10Effective },
    cfg,
    { allInOverride: effectiveAllIn },
  );
  return { ...res, recovered, effectiveAllIn, p10Effective };
}
