import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getCategories } from "@/lib/products";
import { getStoreConfig } from "@/lib/settings";
import { ProductForm } from "@/components/admin/product-form";

export default async function NewProductPage() {
  const [categories, config] = await Promise.all([
    getCategories(),
    getStoreConfig(),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/inventory"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Inventory
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold">Add product</h1>
        <div className="purple-rule mt-2" />
      </div>
      <ProductForm
        mode="create"
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        build={{
          shipBaseCents: config.shipBaseCents,
          shipPerOzCents: config.shipPerOzCents,
          shipMarkupPercent: config.shipMarkupPercent,
          coverStripeFees: config.coverStripeFees,
          includeShippingInPrice: config.includeShippingInPrice,
        }}
      />
    </div>
  );
}
