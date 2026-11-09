import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getProductById, getCategories } from "@/lib/products";
import { getStoreConfig } from "@/lib/settings";
import { ProductForm } from "@/components/admin/product-form";

type Params = { params: Promise<{ id: string }> };

export default async function EditProductPage({ params }: Params) {
  const { id } = await params;
  const [product, categories, config] = await Promise.all([
    getProductById(id),
    getCategories(),
    getStoreConfig(),
  ]);
  if (!product) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/inventory"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Inventory
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold">{product.name}</h1>
        <div className="purple-rule mt-2" />
      </div>
      <ProductForm
        mode="edit"
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        build={{
          shipBaseCents: config.shipBaseCents,
          shipPerOzCents: config.shipPerOzCents,
          shipMarkupPercent: config.shipMarkupPercent,
          coverStripeFees: config.coverStripeFees,
          includeShippingInPrice: config.includeShippingInPrice,
        }}
        initial={{
          id: product.id,
          name: product.name,
          sku: product.sku,
          slug: product.slug,
          productType: product.productType,
          brand: product.brand ?? "",
          categoryId: product.categoryId ?? "",
          subcategory: product.subcategory ?? "",
          description: product.description ?? "",
          tags: product.tags,
          costCents: product.costCents,
          priceCents: product.priceCents,
          compareAtCents: product.compareAtCents,
          quantity: product.quantity,
          trackInventory: product.trackInventory,
          isUnique: product.isUnique,
          lowStockAt: product.lowStockAt,
          published: product.published,
          featured: product.featured,
          weightOz: product.weightOz,
          game: product.game,
          setName: product.setName,
          setCode: product.setCode,
          cardNumber: product.cardNumber,
          year: product.year,
          rarity: product.rarity,
          language: product.language,
          condition: product.condition,
          gradingCompany: product.gradingCompany,
          grade: product.grade,
          certNumber: product.certNumber,
          sealedType: product.sealedType,
          releaseDate: product.releaseDate,
          size: product.size,
          color: product.color,
          medium: product.medium,
          dimensions: product.dimensions,
          artist: product.artist,
          collectrId: product.collectrId,
          images: product.images,
        }}
      />
    </div>
  );
}
