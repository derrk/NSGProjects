// SKU + slug helpers. A Product is entered ONCE with a unique SKU, then restocked
// by quantity — so getting these right up front keeps the catalog clean.

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Suggest a SKU from the product name + optional brand, e.g.
// suggestSku("151 Elite Trainer Box", "Pokemon") -> "POK-151-ELITE-TRAINER-BOX".
// The owner can always override it.
export function suggestSku(name: string, brand?: string | null): string {
  const prefix = brand
    ? brand.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase()
    : "SST";
  const body = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 5)
    .join("-");
  return [prefix || "SST", body].filter(Boolean).join("-");
}

export function normalizeSku(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "-").replace(/[^A-Z0-9-]/g, "");
}

const SKU_RE = /^[A-Z0-9][A-Z0-9-]*$/;

export function isValidSku(input: string): boolean {
  const s = input.trim();
  return SKU_RE.test(s) && s.length >= 2 && s.length <= 40;
}
