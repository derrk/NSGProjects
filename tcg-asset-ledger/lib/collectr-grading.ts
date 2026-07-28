// Turn a Collectr portfolio export into THEORETICAL grading plays (a wishlist of
// cards worth grading), completely separate from real inventory.
//
// The workflow: in Collectr you add, per candidate, the RAW card plus its graded
// versions (PSA 10, BGS 10, …). Those come in as separate rows sharing the same
// card identity but different grades. We group them back into one candidate and
// read the market value off each grade: raw → rawValue, PSA 10 → psa10, BGS 10 →
// bgs10, etc. Gem rate is set by hand afterward; everything else computes exactly
// like a normal grading play.
//
// Pure (no DB, no papaparse) so it is trivially unit-testable.

import { type CollectrRow, effectiveMarketCents } from "./collectr";
import { normalizeCardNumber } from "./domain";
import { GRADING_COST_DEFAULTS } from "./grading-play";

/** A wanted grading play built from a Collectr candidate — shape matches gradingPlaySchema. */
export interface CollectrPlayRow {
  name: string;
  set: string | null;
  cardNumber: string | null;
  variant: string | null;
  game: string | null;
  notes: string | null;
  rawValueCents: number;
  purchasePriceCents: null;
  psa10Cents: number;
  psa9Cents: number | null;
  psa8Cents: number | null;
  bgs10Cents: number | null;
  bgsBlackLabelCents: number | null;
  gemRatePct: number;
  feeCents: number;
  shippingCents: number;
  insuranceCents: number;
  preGradingFeeCents: number;
  priority: "Medium";
  status: "LookingFor";
}

export type GradeClass =
  | "raw"
  | "psa10"
  | "psa9"
  | "psa8"
  | "bgs10"
  | "blacklabel"
  | "other";

/**
 * Classify a Collectr grade string into the comp bucket it feeds. Explicit,
 * never a loose substring: BGS Black Label and BGS 10 win before the generic
 * numeric buckets so "BGS 10" doesn't land in the PSA 10 slot.
 *   ""/"Ungraded"/"Raw"     → raw
 *   Black Label             → blacklabel
 *   BGS 10                  → bgs10
 *   10 (PSA/CGC/generic)    → psa10
 *   9–9.99                  → psa9
 *   8–8.99                  → psa8
 *   anything else           → other (ignored)
 */
export function classifyCollectrGrade(grade: string | null | undefined): GradeClass {
  const g = (grade ?? "").trim().toLowerCase();
  if (!g || g === "ungraded" || g.includes("raw")) return "raw";
  const m = /(\d+(?:\.\d+)?)/.exec(g);
  const n = m ? parseFloat(m[1]) : NaN;
  if (g.includes("black")) return "blacklabel";
  if (g.includes("bgs") && n === 10) return "bgs10";
  if (n === 10) return "psa10";
  if (n >= 9 && n < 10) return "psa9";
  if (n >= 8 && n < 9) return "psa8";
  return "other";
}

/** Identity used to group a candidate's rows together — grade & condition agnostic. */
function groupKey(r: CollectrRow): string {
  return [
    (r.game ?? "").trim().toLowerCase(),
    (r.set ?? "").trim().toLowerCase(),
    (r.name ?? "").trim().toLowerCase(),
    normalizeCardNumber(r.cardNumber),
    (r.variant ?? "").trim().toLowerCase(),
  ].join("|");
}

/**
 * Group Collectr rows into one wanted grading play per card identity, reading
 * each grade's market value into the matching comp. When a grade appears more
 * than once (e.g. NM vs LP raw copies) the highest market value wins — the best
 * copy you'd actually grade. Rows whose grade doesn't map to a comp are ignored
 * for pricing but still anchor the candidate's identity.
 *
 * Groups with no PSA 10 comp keep psa10 = 0; the caller's import guard drops
 * those (the analyzer's math is anchored on PSA 10).
 */
export function collectrRowsToGradingPlays(
  rows: CollectrRow[],
  opts?: { defaultGemRatePct?: number },
): CollectrPlayRow[] {
  const gem = Math.min(100, Math.max(0, Math.round(opts?.defaultGemRatePct ?? 50)));

  const groups = new Map<string, CollectrRow[]>();
  for (const r of rows) {
    const key = groupKey(r);
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  }

  const plays: CollectrPlayRow[] = [];
  for (const group of groups.values()) {
    // Best (max) market value per grade class.
    const best: Partial<Record<GradeClass, number>> = {};
    let rawRep: CollectrRow | null = null;
    const anyRep: CollectrRow = group[0];

    for (const r of group) {
      const cls = classifyCollectrGrade(r.grade);
      const val = effectiveMarketCents(r);
      if (best[cls] == null || val > (best[cls] as number)) best[cls] = val;
      if (cls === "raw" && (rawRep === null || val > effectiveMarketCents(rawRep))) {
        rawRep = r;
      }
    }

    // Prefer a raw row to name the candidate (clean base name); else anything.
    const rep = rawRep ?? anyRep;

    plays.push({
      name: rep.name,
      set: rep.set,
      cardNumber: rep.cardNumber,
      variant: rep.variant,
      game: rep.game,
      notes: null,
      rawValueCents: best.raw ?? 0,
      purchasePriceCents: null,
      psa10Cents: best.psa10 ?? 0,
      psa9Cents: best.psa9 ?? null,
      psa8Cents: best.psa8 ?? null,
      bgs10Cents: best.bgs10 ?? null,
      bgsBlackLabelCents: best.blacklabel ?? null,
      gemRatePct: gem,
      feeCents: GRADING_COST_DEFAULTS.feeCents,
      shippingCents: GRADING_COST_DEFAULTS.shippingCents,
      insuranceCents: GRADING_COST_DEFAULTS.insuranceCents,
      preGradingFeeCents: GRADING_COST_DEFAULTS.preGradingFeeCents,
      priority: "Medium",
      status: "LookingFor",
    });
  }

  return plays;
}
