// Money helpers. Every amount in the Secret Stock store is an INTEGER number of cents, so we
// never lose a penny to floating-point drift. Format only at the edges.

export function formatCents(cents: number): string {
  const rounded = Math.round(cents);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}$${dollars.toLocaleString("en-US")}.${remainder
    .toString()
    .padStart(2, "0")}`;
}

export function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

// Parse a human-entered dollar amount ("12", "12.5", "$1,299.99") into cents.
// Anything unparseable becomes 0 — callers validate separately.
export function dollarsToCents(input: string | number): number {
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(input * 100) : 0;
  }
  const cleaned = input.replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return 0;
  const value = Number.parseFloat(cleaned);
  return Number.isNaN(value) ? 0 : Math.round(value * 100);
}
