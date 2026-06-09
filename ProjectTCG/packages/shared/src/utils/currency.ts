// All monetary values are stored as integer USD cents to avoid floating-point errors.

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function applyPercentage(cents: number, percent: number): number {
  return Math.floor((cents * percent) / 100);
}
