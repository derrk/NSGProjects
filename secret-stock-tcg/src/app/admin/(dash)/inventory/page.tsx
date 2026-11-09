import Link from "next/link";
import { Plus } from "lucide-react";
import { getAdminProducts } from "@/lib/products";
import { Button } from "@/components/ui/button";
import { InventoryTable, type InventoryRow } from "@/components/admin/inventory-table";

export default async function InventoryPage() {
  const products = await getAdminProducts();
  const rows: InventoryRow[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    slug: p.slug,
    image: p.images[0] ?? null,
    productType: p.productType,
    brand: p.brand,
    setName: p.setName,
    cardNumber: p.cardNumber,
    certNumber: p.certNumber,
    condition: p.condition,
    costCents: p.costCents,
    priceCents: p.priceCents,
    quantity: p.quantity,
    trackInventory: p.trackInventory,
    isUnique: p.isUnique,
    lowStockAt: p.lowStockAt,
    published: p.published,
    featured: p.featured,
    categoryName: p.category?.name ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Inventory</h1>
          <div className="purple-rule mt-2" />
          <p className="mt-2 text-sm text-muted-foreground">
            Adjust stock, flip items on and off the store, record counter sales.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/inventory/new">
            <Button>
              <Plus /> Add product
            </Button>
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-20 text-center">
          <p className="text-muted-foreground">No products yet.</p>
          <Link href="/admin/inventory/new" className="mt-4 inline-block">
            <Button>Add your first product</Button>
          </Link>
        </div>
      ) : (
        <InventoryTable initialRows={rows} />
      )}
    </div>
  );
}
