import type { ProductInput } from "@/lib/validators";

// Maps validated product input to Product columns. Quantity + status are handled
// separately through the inventory ledger, so they're intentionally excluded.
// Shared by the admin product form and the CSV importer.
export function toProductData(data: ProductInput) {
  const nn = (s: string | undefined) => (s && s.trim() ? s.trim() : null);
  return {
    name: data.name,
    sku: data.sku,
    slug: data.slug,
    productType: data.productType,
    brand: nn(data.brand),
    subcategory: nn(data.subcategory),
    categoryId: data.categoryId || null,
    description: nn(data.description),
    tags: data.tags,
    costCents: data.costCents,
    priceCents: data.priceCents,
    compareAtCents: data.compareAtCents ?? null,
    images: data.images,
    trackInventory: data.trackInventory,
    isUnique: data.isUnique,
    lowStockAt: data.lowStockAt,
    published: data.published,
    featured: data.featured,
    weightOz: data.weightOz ?? null,
    game: nn(data.game),
    setName: nn(data.setName),
    setCode: nn(data.setCode),
    cardNumber: nn(data.cardNumber),
    year: data.year ?? null,
    rarity: nn(data.rarity),
    language: nn(data.language),
    condition: nn(data.condition),
    gradingCompany: nn(data.gradingCompany),
    grade: nn(data.grade),
    certNumber: nn(data.certNumber),
    sealedType: nn(data.sealedType),
    releaseDate: nn(data.releaseDate),
    size: nn(data.size),
    color: nn(data.color),
    medium: nn(data.medium),
    dimensions: nn(data.dimensions),
    artist: nn(data.artist),
    collectrId: nn(data.collectrId),
  };
}
