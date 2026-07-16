// Parse a Collectr portfolio CSV export into normalized rows we can reconcile
// against our asset ledger. Kept pure (no DB) so it is easy to unit-test.

import Papa from "papaparse";
import { toCents } from "./money";
import {
  assetTypeFromGrade,
  buildNaturalKey,
  normalizeGame,
} from "./domain";

export interface CollectrRow {
  portfolio: string;
  game: string; // normalized to our Game union
  categoryRaw: string; // original Collectr "Category"
  set: string | null;
  name: string;
  cardNumber: string | null;
  rarity: string | null;
  variant: string | null;
  grade: string | null;
  condition: string | null;
  assetType: string;
  quantity: number;
  costBasisCents: number; // per unit (Collectr "Average Cost Paid")
  marketValueCents: number; // per unit (Collectr "Market Price")
  priceOverrideCents: number | null; // per unit (Collectr "Price Override")
  watchlist: boolean;
  collectrDateAdded: Date | null;
  notes: string | null;
  naturalKey: string;
}

export interface ParsedCollectr {
  asOfDate: Date | null;
  marketPriceHeader: string | null;
  rows: CollectrRow[];
  errors: string[];
}

/** Pull the "As of YYYY-MM-DD" date out of the market price column header. */
export function parseAsOfDate(header: string | undefined | null): Date | null {
  if (!header) return null;
  const m = header.match(/as of\s*([0-9]{4})-([0-9]{2})-([0-9]{2})/i);
  if (!m) return null;
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

/** Parse an M/D/YYYY (or M/D/YY) date as used in Collectr's "Date Added". */
function parseUsDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let [, mo, d, y] = m;
  let year = Number(y);
  if (year < 100) year += 2000;
  return new Date(year, Number(mo) - 1, Number(d));
}

function normGrade(raw: string | undefined): string | null {
  const g = (raw ?? "").trim();
  if (!g) return null;
  return g; // keep "Ungraded" / "PSA 10.0 GEM - MT" verbatim
}

function clean(v: string | undefined | null): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

/** Find a header key case-insensitively, tolerating the dynamic market-price header. */
function findKey(fields: string[], predicate: (f: string) => boolean): string | undefined {
  return fields.find((f) => predicate(f.toLowerCase().trim()));
}

export function parseCollectrCsv(csvText: string): ParsedCollectr {
  const errors: string[] = [];
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const fields = result.meta.fields ?? [];
  const marketPriceHeader =
    findKey(fields, (f) => f.startsWith("market price")) ?? null;
  const asOfDate = parseAsOfDate(marketPriceHeader);

  const kPortfolio = findKey(fields, (f) => f === "portfolio name");
  const kCategory = findKey(fields, (f) => f === "category");
  const kSet = findKey(fields, (f) => f === "set");
  const kName = findKey(fields, (f) => f === "product name");
  const kNumber = findKey(fields, (f) => f === "card number");
  const kRarity = findKey(fields, (f) => f === "rarity");
  const kVariance = findKey(fields, (f) => f === "variance");
  const kGrade = findKey(fields, (f) => f === "grade");
  const kCondition = findKey(fields, (f) => f === "card condition");
  const kCost = findKey(fields, (f) => f.startsWith("average cost"));
  const kQty = findKey(fields, (f) => f === "quantity");
  const kOverride = findKey(fields, (f) => f.startsWith("price override"));
  const kWatch = findKey(fields, (f) => f === "watchlist");
  const kDate = findKey(fields, (f) => f === "date added");
  const kNotes = findKey(fields, (f) => f === "notes");

  if (!kName) errors.push('Missing "Product Name" column.');

  const rows: CollectrRow[] = [];
  result.data.forEach((raw, idx) => {
    const name = clean(kName ? raw[kName] : undefined);
    if (!name) return; // skip blank rows

    const categoryRaw = (kCategory ? raw[kCategory] : "") ?? "";
    const game = normalizeGame(categoryRaw);
    const grade = normGrade(kGrade ? raw[kGrade] : undefined);
    const set = clean(kSet ? raw[kSet] : undefined);
    const cardNumber = clean(kNumber ? raw[kNumber] : undefined);
    const variant = clean(kVariance ? raw[kVariance] : undefined);
    const condition = clean(kCondition ? raw[kCondition] : undefined);
    const qty = Math.max(1, parseInt((kQty ? raw[kQty] : "1") || "1", 10) || 1);
    const overrideRaw = kOverride ? raw[kOverride] : undefined;
    const overrideCents = toCents(overrideRaw);

    rows.push({
      portfolio: clean(kPortfolio ? raw[kPortfolio] : undefined) ?? "",
      game,
      categoryRaw: categoryRaw.trim(),
      set,
      name,
      cardNumber,
      rarity: clean(kRarity ? raw[kRarity] : undefined),
      variant,
      grade,
      condition,
      assetType: assetTypeFromGrade(grade),
      quantity: qty,
      costBasisCents: toCents(kCost ? raw[kCost] : undefined),
      marketValueCents: toCents(marketPriceHeader ? raw[marketPriceHeader] : undefined),
      priceOverrideCents: overrideCents > 0 ? overrideCents : null,
      watchlist: (kWatch ? raw[kWatch] : "").toString().trim().toUpperCase() === "TRUE",
      collectrDateAdded: parseUsDate(kDate ? raw[kDate] : undefined),
      notes: clean(kNotes ? raw[kNotes] : undefined),
      naturalKey: buildNaturalKey({
        game,
        set,
        name,
        cardNumber,
        variant,
        grade,
        condition,
      }),
    });
  });

  if (result.errors.length) {
    for (const e of result.errors.slice(0, 5)) {
      errors.push(`Row ${e.row ?? "?"}: ${e.message}`);
    }
  }

  return { asOfDate, marketPriceHeader, rows, errors };
}

/** The market price Collectr shows: an explicit override wins, else market. */
export function effectiveMarketCents(row: CollectrRow): number {
  return row.priceOverrideCents ?? row.marketValueCents;
}
