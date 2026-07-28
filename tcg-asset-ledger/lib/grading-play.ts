// Grading Play Analyzer math — pure functions over stored inputs.
// EV = gemRate × PSA10 + (1 − gemRate) × raw
// Investment = purchase price (falling back to raw value) + grading costs
// Profit = EV − investment; ROI = profit / investment.

import { normalizeCardNumber } from "./domain";
import { formatUSD } from "./money";

/**
 * Dedupe identity for a grading play. Card numbers are normalized (038 == 38)
 * so re-importing the same card never doubles the watch list even when the
 * source (e.g. Collectr) flips its zero-padding between exports.
 */
export function playDedupeKey(r: {
  name: string;
  set?: string | null;
  cardNumber?: string | null;
  variant?: string | null;
}): string {
  return [
    (r.name ?? "").trim().toLowerCase(),
    (r.set ?? "").trim().toLowerCase(),
    normalizeCardNumber(r.cardNumber),
    (r.variant ?? "").trim().toLowerCase(),
  ].join("|");
}

// Real per-card grading cost, itemized: $80 PSA fee + $3 shipping + $2 insurance
// + $7 pre-grading fee (Derrik pre-grades every candidate before risking a PSA
// submission). Totals $92; each field stays editable per play.
export const GRADING_COST_DEFAULTS = {
  feeCents: 80_00,
  shippingCents: 3_00,
  insuranceCents: 2_00,
  preGradingFeeCents: 7_00,
} as const;

export const PLAY_STATUSES = [
  "LookingFor",
  "Purchased",
  "Submitted",
  "AtPSA",
  "Returned",
  "Sold",
] as const;
export type PlayStatus = (typeof PLAY_STATUSES)[number];

export const PLAY_STATUS_LABELS: Record<PlayStatus, string> = {
  LookingFor: "Looking For",
  Purchased: "Purchased",
  Submitted: "Submitted to PSA",
  AtPSA: "At PSA",
  Returned: "Returned",
  Sold: "Sold",
};

export const PLAY_PRIORITIES = ["Low", "Medium", "High", "MustBuy"] as const;
export type PlayPriority = (typeof PLAY_PRIORITIES)[number];

export const PLAY_PRIORITY_LABELS: Record<PlayPriority, string> = {
  Low: "Low",
  Medium: "Medium",
  High: "High",
  MustBuy: "Must Buy",
};

// PSA 10 population (entered by hand from the pop report), classified into tiers
// with an investment outlook. Low pop → scarcity-driven upside; high pop →
// demand-driven. Drives the buy-vs-grade long-term-hold signal.
export type PopTierKey = "UltraLow" | "Low" | "Medium" | "High" | "VeryHigh";

export interface PopTier {
  key: PopTierKey;
  label: string;
  /** Inclusive upper bound of the tier (Infinity for the top tier). */
  max: number;
  range: string;
  outlook: string;
}

export const POP_TIERS: PopTier[] = [
  {
    key: "UltraLow",
    label: "Ultra Low",
    max: 100,
    range: "0–100",
    outlook: "Very high scarcity. Strong upside if demand exists, but liquidity can be low.",
  },
  {
    key: "Low",
    label: "Low",
    max: 500,
    range: "101–500",
    outlook: "Excellent balance of scarcity and liquidity — the sweet spot.",
  },
  {
    key: "Medium",
    label: "Medium",
    max: 2000,
    range: "501–2,000",
    outlook: "Healthy population. Appreciation depends more on demand than scarcity.",
  },
  {
    key: "High",
    label: "High",
    max: 10000,
    range: "2,001–10,000",
    outlook: "Plenty available. Growth usually comes from increasing demand over time.",
  },
  {
    key: "VeryHigh",
    label: "Very High",
    max: Infinity,
    range: "10,000+",
    outlook: "Scarcity is no longer the driver. Focus on iconic cards and long-term collector demand.",
  },
];

/** Bucket a PSA 10 population count into its tier. Null for unknown/blank/negative. */
export function classifyPop(pop: number | null | undefined): PopTier | null {
  if (pop == null || !Number.isFinite(pop) || pop < 0) return null;
  return POP_TIERS.find((t) => pop <= t.max) ?? null;
}

export interface PlayInputs {
  rawValueCents: number;
  purchasePriceCents: number | null;
  psa10Cents: number;
  gemRatePct: number; // whole percent 0–100
  feeCents: number;
  shippingCents: number;
  insuranceCents: number;
  preGradingFeeCents: number;
}

export type Recommendation =
  | "Skip"
  | "Borderline"
  | "Good Candidate"
  | "Excellent Candidate"
  | "Must Buy";

export interface PlayMath {
  gradingCostCents: number;
  /** Purchase price when known, else raw value stands in. */
  acquisitionCents: number;
  totalInvestmentCents: number;
  expectedValueCents: number;
  estimatedProfitCents: number;
  /** Null when investment is 0 (nothing to divide by). */
  roiPct: number | null;
  recommendation: Recommendation;
  /** red | yellow | green per the ROI thresholds. */
  tone: "red" | "yellow" | "green";
}

export function computePlay(p: PlayInputs): PlayMath {
  const gradingCostCents =
    p.feeCents + p.shippingCents + p.insuranceCents + p.preGradingFeeCents;
  const acquisitionCents = p.purchasePriceCents ?? p.rawValueCents;
  const totalInvestmentCents = acquisitionCents + gradingCostCents;

  const gem = Math.min(100, Math.max(0, p.gemRatePct)) / 100;
  const expectedValueCents = Math.round(
    gem * p.psa10Cents + (1 - gem) * p.rawValueCents,
  );

  const estimatedProfitCents = expectedValueCents - totalInvestmentCents;
  const roiPct =
    totalInvestmentCents > 0 ? (estimatedProfitCents / totalInvestmentCents) * 100 : null;

  return {
    gradingCostCents,
    acquisitionCents,
    totalInvestmentCents,
    expectedValueCents,
    estimatedProfitCents,
    roiPct,
    recommendation: recommend(roiPct),
    tone: tone(roiPct),
  };
}

export function recommend(roiPct: number | null): Recommendation {
  if (roiPct === null || roiPct < 10) return "Skip";
  if (roiPct <= 30) return "Borderline";
  if (roiPct <= 50) return "Good Candidate";
  if (roiPct <= 75) return "Excellent Candidate";
  return "Must Buy";
}

export function tone(roiPct: number | null): "red" | "yellow" | "green" {
  if (roiPct === null || roiPct < 10) return "red";
  if (roiPct <= 30) return "yellow";
  return "green";
}

// ── Buy-and-grade vs buy-the-slab ─────────────────────────────────────────────
// Two ways to end up holding a PSA 10:
//   Grade it   — buy the raw + pay grading ($92), succeed at the gem rate.
//   Buy slab   — pay the graded 10's market price, guaranteed, no gem risk.
// Grading wins when it lands a 10 for meaningfully less than the slab AND the gem
// rate makes that likely. Low pop (scarcity) layers a long-term-hold signal on
// top: a scarce 10 is worth owning even when the near-term grading edge is thin.

export type BuyVsGradeVerdict = "Grade it" | "Buy the slab" | "Either way" | "Skip";

export interface BuyVsGrade {
  /** Raw acquisition + grading cost — what it costs to *attempt* a 10. */
  gradeCostCents: number;
  /** Market price of the graded 10 (PSA 10) — the buy-the-slab cost. */
  slabCents: number;
  /** slab − gradeCost. Positive means grading a 10 beats buying one, if you hit. */
  edgeCents: number;
  verdict: BuyVsGradeVerdict;
  /** Scarcity says hold for appreciation, not flip. */
  longTermHold: boolean;
  /** PSA 10 population tier, when a pop count is known. */
  popTier: PopTier | null;
  reason: string;
}

// Gem-rate bands for the buy-vs-grade call.
const GRADE_GEM_FLOOR = 60; // ≥ this (with a price edge) → worth grading yourself
const SLAB_GEM_CEILING = 45; // < this → too much of a coin-flip, buy the sure 10

export function buyVsGrade(input: {
  rawValueCents: number;
  psa10Cents: number;
  gemRatePct: number;
  gradingCostCents: number;
  psa10Pop?: number | null;
}): BuyVsGrade {
  const slabCents = input.psa10Cents;
  const gradeCostCents = input.rawValueCents + input.gradingCostCents;
  const edgeCents = slabCents - gradeCostCents;
  const gem = Math.min(100, Math.max(0, input.gemRatePct));
  const popTier = classifyPop(input.psa10Pop);
  // Low pop drives scarcity upside; a very high pop means scarcity isn't the story.
  const scarce = popTier?.key === "UltraLow" || popTier?.key === "Low";
  const common = popTier?.key === "VeryHigh";

  if (slabCents <= 0) {
    return {
      gradeCostCents,
      slabCents,
      edgeCents,
      verdict: "Skip",
      longTermHold: false,
      popTier,
      reason: "Add a PSA 10 price to compare grading against buying the slab.",
    };
  }

  let verdict: BuyVsGradeVerdict;
  let reason: string;
  if (edgeCents > 0 && gem >= GRADE_GEM_FLOOR) {
    verdict = "Grade it";
    reason = `Grading your own 10 (~${formatUSD(gradeCostCents)}) comes in ${formatUSD(edgeCents)} under the ${formatUSD(slabCents)} slab, and a ${gem}% gem rate makes that likely.`;
  } else if (gem < SLAB_GEM_CEILING || edgeCents <= 0) {
    verdict = "Buy the slab";
    reason =
      edgeCents <= 0
        ? `Grading (~${formatUSD(gradeCostCents)}) costs about the same as—or more than—the ${formatUSD(slabCents)} slab, so skip the coin-flip and buy the graded 10.`
        : `A ${gem}% gem rate is too much of a gamble — buy the already-graded 10 for ${formatUSD(slabCents)}.`;
  } else {
    verdict = "Either way";
    reason = `Grading saves ~${formatUSD(edgeCents)} when you hit, but a ${gem}% gem rate is middling — your call on the risk.`;
  }

  let longTermHold = false;
  if (scarce) {
    longTermHold = true;
    if (verdict === "Either way") {
      verdict = "Buy the slab";
      reason += ` ${popTier!.label} pop tips it: own the scarce 10 and hold for appreciation.`;
    } else if (verdict === "Buy the slab") {
      reason += ` ${popTier!.label} pop — strong long-term hold.`;
    } else {
      reason += ` ${popTier!.label} pop — also a solid long-term hold once it's a 10.`;
    }
  } else if (common) {
    reason +=
      verdict === "Grade it"
        ? " Very high pop, though — treat it as a near-term flip, not a long-term hold."
        : " Very high pop — limited long-term upside; this is a flip, not a hold.";
  }

  return { gradeCostCents, slabCents, edgeCents, verdict, longTermHold, popTier, reason };
}

/**
 * Map a returned grade to the matching comp price — EXPLICITLY, never by loose
 * substring. Recognizes BGS Black Label, BGS 10, and PSA/numeric grades:
 *   Black Label            → bgsBlackLabelCents
 *   BGS 10                 → bgs10Cents
 *   10 (PSA/CGC/generic)   → psa10Cents
 *   9 / 9.5                → psa9Cents
 *   8 / 8.5                → psa8Cents
 *   anything else / junk   → null (leave the asset's market value untouched)
 */
export function gradeToMarketCents(
  grade: string,
  comps: {
    psa10Cents: number;
    psa9Cents: number | null;
    psa8Cents: number | null;
    bgs10Cents?: number | null;
    bgsBlackLabelCents?: number | null;
  },
): number | null {
  const g = grade.trim().toLowerCase();
  if (!g) return null;
  const m = /(\d+(?:\.\d+)?)/.exec(g);
  const n = m ? parseFloat(m[1]) : NaN;

  // BGS Black Label (Pristine 10, all four subgrades 10).
  if (g.includes("black")) return comps.bgsBlackLabelCents || null;
  // BGS 10 specifically.
  if (g.includes("bgs") && n === 10) return comps.bgs10Cents || comps.psa10Cents || null;
  // PSA / CGC / generic numeric.
  if (n === 10) return comps.psa10Cents || null;
  if (n >= 9) return comps.psa9Cents || null;
  if (n >= 8) return comps.psa8Cents || null;
  return null;
}
