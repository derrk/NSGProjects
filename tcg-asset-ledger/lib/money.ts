// All money is stored as integer cents. These helpers are the ONLY place
// dollars <-> cents conversion happens, so rounding stays consistent.

/** Parse a user/CSV dollar string or number into integer cents. */
export function toCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : parseFloat(String(value).replace(/[$,]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Convert integer cents to a plain dollar number (for inputs). */
export function toDollars(cents: number | null | undefined): number {
  return (cents ?? 0) / 100;
}

/** Format integer cents as USD, e.g. 16700 -> "$167.00". */
export function formatUSD(cents: number | null | undefined): string {
  const dollars = (cents ?? 0) / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/** Format a signed delta with an explicit +/- sign. */
export function formatSignedUSD(cents: number | null | undefined): string {
  const c = cents ?? 0;
  const sign = c > 0 ? "+" : c < 0 ? "-" : "";
  return sign + formatUSD(Math.abs(c));
}

/**
 * Allocate a total (in cents) across items proportional to their weights.
 * Guarantees the parts sum exactly to `total` (remainder goes to the largest
 * weight to avoid rounding drift). Falls back to an even split when all
 * weights are zero.
 */
export function allocateByWeight(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const sumW = weights.reduce((a, b) => a + b, 0);

  let parts: number[];
  if (sumW <= 0) {
    // Even split
    const base = Math.floor(total / n);
    parts = new Array(n).fill(base);
  } else {
    parts = weights.map((w) => Math.floor((total * w) / sumW));
  }

  // Distribute the rounding remainder to the largest-weight item.
  let allocated = parts.reduce((a, b) => a + b, 0);
  let remainder = total - allocated;
  if (remainder !== 0) {
    // index of max weight (or index 0 if all equal/zero)
    let maxIdx = 0;
    for (let i = 1; i < n; i++) {
      if (weights[i] > weights[maxIdx]) maxIdx = i;
    }
    parts[maxIdx] += remainder;
  }
  return parts;
}
