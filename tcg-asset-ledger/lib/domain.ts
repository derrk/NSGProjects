// Domain vocabulary. SQLite has no enums, so these string unions are the
// single source of truth, validated at the edges with zod.

export const GAMES = ["Pokemon", "One Piece", "Sports", "Other"] as const;
export type Game = (typeof GAMES)[number];

export const ASSET_TYPES = [
  "RawCard",
  "GradedCard",
  "SealedProduct",
  "LoosePack",
  "Bundle",
  "Misc",
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_STATUSES = [
  "InStock",
  "Sold",
  "Traded",
  "Grading",
  "BrokenDown",
  "UsedAsPrize",
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const CONDITIONS = [
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
] as const;

export const TRANSACTION_TYPES = [
  "BUY",
  "SALE",
  "TRADE",
  "BREAK",
  "PRIZE",
  "ADJUSTMENT",
  "GRADING_SUBMIT",
  "GRADING_RETURN",
  "WHEEL_REVENUE",
  "WHEEL_PRIZE",
  "WHEEL_SPIN",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/** Where a deal happened. "Show" is auto-set while Show Mode is active. */
export const TRANSACTION_SOURCES = [
  "Show",
  "Whatnot",
  "TCGPlayer",
  "eBay",
  "Local",
  "Facebook",
  "Trade Night",
  "Personal",
  "Other",
] as const;
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

export const DIRECTIONS = ["IN", "OUT"] as const;
export type Direction = (typeof DIRECTIONS)[number];

// Human-friendly labels
export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  RawCard: "Raw Card",
  GradedCard: "Graded Card",
  SealedProduct: "Sealed Product",
  LoosePack: "Loose Pack",
  Bundle: "Bundle",
  Misc: "Misc",
};

export const STATUS_LABELS: Record<AssetStatus, string> = {
  InStock: "In Stock",
  Sold: "Sold",
  Traded: "Traded",
  Grading: "Grading",
  BrokenDown: "Broken Down",
  UsedAsPrize: "Used as Prize",
};

export const TXN_TYPE_LABELS: Record<TransactionType, string> = {
  BUY: "Buy",
  SALE: "Sale",
  TRADE: "Trade",
  BREAK: "Break",
  PRIZE: "Prize",
  ADJUSTMENT: "Adjustment",
  GRADING_SUBMIT: "Sent to Grading",
  GRADING_RETURN: "Grading Returned",
  WHEEL_REVENUE: "Wheel Spins",
  WHEEL_PRIZE: "Wheel Prize",
  WHEEL_SPIN: "Wheel Spin",
};

/**
 * Normalize a card number for matching. Collectr sometimes zero-pads promo
 * numbers between exports (e.g. "38" one time, "038" the next), which would
 * otherwise look like two different cards. Strip leading zeros within each run
 * of digits so "38" and "038" — and "005/131" and "5/131" — match.
 */
export function normalizeCardNumber(n: string | null | undefined): string {
  if (!n) return "";
  return n
    .trim()
    .toLowerCase()
    .replace(/\d+/g, (d) => String(parseInt(d, 10)));
}

/** Build the natural key used to reconcile with Collectr re-imports. */
export function buildNaturalKey(parts: {
  game?: string | null;
  set?: string | null;
  name?: string | null;
  cardNumber?: string | null;
  variant?: string | null;
  grade?: string | null;
  condition?: string | null;
}): string {
  return [
    (parts.game ?? "").trim().toLowerCase(),
    (parts.set ?? "").trim().toLowerCase(),
    (parts.name ?? "").trim().toLowerCase(),
    normalizeCardNumber(parts.cardNumber),
    (parts.variant ?? "").trim().toLowerCase(),
    (parts.grade ?? "").trim().toLowerCase(),
    (parts.condition ?? "").trim().toLowerCase(),
  ].join("|");
}

/** Map a Collectr "Category" to our Game union. */
export function normalizeGame(category: string | null | undefined): Game {
  const c = (category ?? "").trim().toLowerCase();
  if (c === "pokemon" || c === "pokémon") return "Pokemon";
  if (c === "one piece" || c === "onepiece") return "One Piece";
  if (
    c === "sports" ||
    c === "baseball" ||
    c === "basketball" ||
    c === "football" ||
    c === "hockey"
  )
    return "Sports";
  return "Other";
}

/** Derive asset type from a Collectr grade string. */
export function assetTypeFromGrade(grade: string | null | undefined): AssetType {
  const g = (grade ?? "").trim().toLowerCase();
  if (g && g !== "ungraded") return "GradedCard";
  return "RawCard";
}

/**
 * Sealed-product detection for imported rows. Cards often carry packish words
 * INSIDE parentheses ("Yamato (CS 2024 Event Pack)") and have a card number —
 * so we strip parentheticals, require a packish word in the base name, and
 * require NO card number before calling something sealed.
 */
const PACK_WORDS = /\b(booster pack|sleeved booster|booster bundle|booster box|booster display|elite trainer box|etb|blister|build & battle|premium collection|collection box|poster collection|display box|tin)\b/i;
const LOOSE_PACK = /\bpack\b/i;

export function inferSealedAssetType(
  name: string,
  cardNumber: string | null | undefined,
  grade: string | null | undefined,
): AssetType {
  const graded = assetTypeFromGrade(grade);
  if (graded === "GradedCard") return graded;
  if (cardNumber && cardNumber.trim() !== "") return "RawCard"; // numbered = a card
  const base = name.replace(/\([^)]*\)/g, " ").trim();
  if (PACK_WORDS.test(base)) return LOOSE_PACK.test(base) ? "LoosePack" : "SealedProduct";
  if (LOOSE_PACK.test(base)) return "LoosePack";
  return "RawCard";
}
