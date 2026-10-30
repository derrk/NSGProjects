// Pluggable graded-price sources (spec §7 v2). An adapter is "configured" only
// when its API key is present in the environment — with none set, the analyzer
// runs fully on manual entry + CSV. Prices come back in integer cents.
//
// Adding a source: implement PriceSource and register it in SOURCES. The first
// configured one wins. NEVER scrape a site without checking its ToS.

export interface GradedQuote {
  productName: string;
  matchedId: string | null;
  console: string | null; // e.g. "Pokemon Surging Sparks"
  rawCents: number | null;
  psa10Cents: number | null;
  psa9Cents: number | null;
  psa8Cents: number | null;
  sourceName: string;
  /** Raw provider fields, surfaced so a wrong grade→field mapping is visible. */
  rawFields?: Record<string, number>;
}

export interface PriceSource {
  name: string;
  isConfigured(): boolean;
  /** Search + quote in one shot; returns up to `limit` candidates with prices. */
  searchQuotes(query: string, limit: number): Promise<GradedQuote[]>;
}

const centsOf = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

// ── PriceCharting ─────────────────────────────────────────────────────────────
// Docs: https://www.pricecharting.com/api-documentation. Prices are integer
// pennies. Card grade mapping (default; override in one place if a live key
// shows different): loose-price=Ungraded, graded-price=Grade 9, manual-only-price=Grade 10.
const PC_MAP = { raw: "loose-price", psa9: "graded-price", psa10: "manual-only-price" } as const;

class PriceChartingSource implements PriceSource {
  name = "PriceCharting";
  private token = process.env.PRICECHARTING_API_TOKEN ?? "";
  isConfigured() {
    return this.token.length > 0;
  }
  async searchQuotes(query: string, limit: number): Promise<GradedQuote[]> {
    if (!this.isConfigured()) return [];
    const url = `https://www.pricecharting.com/api/products?t=${encodeURIComponent(this.token)}&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`PriceCharting search failed (${res.status})`);
    const data = (await res.json()) as { products?: Record<string, unknown>[] };
    const products = (data.products ?? []).slice(0, limit);
    return products.map((p) => {
      const num = (k: string) => centsOf(p[k]);
      return {
        productName: String(p["product-name"] ?? query),
        matchedId: p["id"] != null ? String(p["id"]) : null,
        console: p["console-name"] != null ? String(p["console-name"]) : null,
        rawCents: num(PC_MAP.raw),
        psa9Cents: num(PC_MAP.psa9),
        psa10Cents: num(PC_MAP.psa10),
        psa8Cents: null,
        sourceName: this.name,
        rawFields: {
          "loose-price": Number(p["loose-price"]) || 0,
          "graded-price": Number(p["graded-price"]) || 0,
          "manual-only-price": Number(p["manual-only-price"]) || 0,
          "bgs-10-price": Number(p["bgs-10-price"]) || 0,
        },
      };
    });
  }
}

const SOURCES: PriceSource[] = [new PriceChartingSource()];

/** The first configured price source, or null (manual/CSV only). */
export function getPriceSource(): PriceSource | null {
  return SOURCES.find((s) => s.isConfigured()) ?? null;
}

export function priceSourceStatus(): { configured: boolean; name: string | null; candidates: string[] } {
  const active = getPriceSource();
  return { configured: !!active, name: active?.name ?? null, candidates: SOURCES.map((s) => s.name) };
}
