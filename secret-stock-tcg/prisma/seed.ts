import "dotenv/config";
import { PrismaClient, type ProductType } from "@prisma/client";
import { products, categories } from "../src/lib/data";
import type { Product } from "../src/lib/types";

// Moves the hardcoded catalog in src/lib/data.ts into Postgres. Reads that file
// directly rather than duplicating the rows, so the two can't drift while the
// storefront still renders from the array.
//
// Idempotent: products are upserted by SKU, and the opening INVENTORY ledger row
// is only written the first time a product is created, so re-running never
// invents stock movements that didn't happen.

const prisma = new PrismaClient();

const TYPE_MAP: Record<Product["type"], ProductType> = {
  "raw-single": "RAW_CARD",
  "graded-slab": "GRADED_SLAB",
  "sealed-product": "SEALED",
  artwork: "ART",
  "apparel-item": "APPAREL",
};

// Which game/brand a category implies, for search and filtering later.
const BRAND_MAP: Record<string, string | null> = {
  pokemon: "Pokemon",
  "one-piece": "One Piece",
  "sports-cards": "Sports",
  "sealed-products": null,
  "graded-slabs": null,
  art: "Pokemon",
  apparel: "Pokemon",
  vintage: null,
  "high-end": null,
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function suggestSku(name: string, brand?: string | null): string {
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

async function main() {
  // ── Categories ─────────────────────────────────────────────────────────────
  // "collections-wanted" is a call to action on the storefront, not something
  // products belong to, so it isn't seeded as a category.
  const seedable = categories.filter((c) => c.id !== "collections-wanted");
  const categoryBySlug = new Map<string, string>();

  for (const [index, c] of seedable.entries()) {
    const row = await prisma.category.upsert({
      where: { slug: c.id },
      update: { name: c.name, sortOrder: index },
      create: { name: c.name, slug: c.id, sortOrder: index },
    });
    categoryBySlug.set(c.id, row.id);
  }
  console.log(`categories: ${seedable.length} upserted`);

  // ── Products ───────────────────────────────────────────────────────────────
  let created = 0;
  let updated = 0;

  for (const p of products) {
    const brand = BRAND_MAP[p.category] ?? null;
    const sku = suggestSku(p.name, brand);
    const productType = TYPE_MAP[p.type];

    // One-of-a-kind: a graded slab or an original painting is literally the only
    // copy, so stock can never be restocked past 1.
    const isUnique =
      (productType === "GRADED_SLAB" || productType === "ART") && p.quantity <= 1;

    // Long-tail fields that have no promoted column.
    const attributes: Record<string, unknown> = {};
    if (p.type === "apparel-item") {
      // Size runs stay here until the variant layer lands — see BACKEND.md D3.
      attributes.sizes = p.sizes;
      attributes.design = p.design;
      attributes.apparelType = p.apparelType;
    }
    if (p.type === "sealed-product") attributes.sealedCategory = p.productType;
    attributes.legacyId = p.id; // traceable back to the data.ts row

    const data = {
      name: p.name,
      slug: slugify(p.name),
      description: p.description ?? null,
      productType,
      categoryId: categoryBySlug.get(p.category) ?? null,
      brand,
      game: brand,
      images: [p.image],
      priceCents: Math.round(p.price * 100),
      compareAtCents:
        p.marketPrice != null ? Math.round(p.marketPrice * 100) : null,
      isUnique,
      // Everything in data.ts is on the live site today, so it carries over
      // visible. Items still priced at 0 show as "inquire" until they're priced.
      published: true,
      featured: p.featured,
      collectrId: p.collectrId ?? null,
      attributes: attributes as object,

      // Type-specific columns — only the ones this product type actually has.
      setName: "set" in p ? p.set : null,
      cardNumber: "cardNumber" in p ? p.cardNumber : null,
      condition: "condition" in p ? p.condition : null,
      language: "language" in p ? p.language : null,
      gradingCompany: "gradingCompany" in p ? p.gradingCompany : null,
      grade: "grade" in p ? p.grade : null,
      certNumber: "certNumber" in p ? p.certNumber : null,
      sealedType: p.type === "sealed-product" ? p.productType : null,
      releaseDate: "releaseDate" in p ? (p.releaseDate ?? null) : null,
      size:
        p.type === "apparel-item" && p.sizes.length === 1 ? p.sizes[0] : null,
      color: "color" in p ? p.color : null,
      medium: "medium" in p ? p.medium : null,
      dimensions: "dimensions" in p ? (p.dimensions ?? null) : null,
      artist: "artist" in p ? (p.artist ?? null) : null,
    };

    const existing = await prisma.product.findUnique({ where: { sku } });

    if (existing) {
      // Quantity is owned by the ledger, so a re-run must not reset it.
      await prisma.product.update({ where: { sku }, data });
      updated++;
      continue;
    }

    const product = await prisma.product.create({
      data: {
        ...data,
        sku,
        quantity: p.quantity,
        status: p.quantity > 0 ? "ACTIVE" : "SOLD_OUT",
      },
    });

    // Opening balance. Every quantity a product has ever had is explained by a
    // ledger row, including the one it started with.
    await prisma.inventoryTransaction.create({
      data: {
        productId: product.id,
        previousQty: 0,
        quantityChange: p.quantity,
        newQty: p.quantity,
        type: "INITIAL",
        userLabel: "seed",
        note: "Imported from src/lib/data.ts",
      },
    });
    created++;
  }

  console.log(`products: ${created} created, ${updated} updated`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
