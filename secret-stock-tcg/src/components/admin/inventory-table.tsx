"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Minus, Plus, Pencil, Trash2, Tag, SlidersHorizontal } from "lucide-react";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AdjustDialog } from "@/components/admin/adjust-dialog";
import {
  adjustQuantity,
  setQuantity,
  sellOne,
  togglePublished,
  deleteProduct,
} from "@/app/admin/(dash)/inventory/actions";

export type InventoryRow = {
  id: string;
  name: string;
  sku: string;
  slug: string;
  image: string | null;
  productType: string;
  brand: string | null;
  setName: string | null;
  cardNumber: string | null;
  certNumber: string | null;
  condition: string | null;
  costCents: number;
  priceCents: number;
  quantity: number;
  trackInventory: boolean;
  isUnique: boolean;
  lowStockAt: number;
  published: boolean;
  featured: boolean;
  categoryName: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  RAW_CARD: "Raw card",
  GRADED_SLAB: "Slab",
  SEALED: "Sealed",
  APPAREL: "Apparel",
  ART: "Original art",
  COLLECTIBLE: "Collectible",
};

export function InventoryTable({ initialRows }: { initialRows: InventoryRow[] }) {
  const router = useRouter();
  const [rows, setRows] = React.useState(initialRows);
  const [query, setQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [stockFilter, setStockFilter] = React.useState("all");
  const [adjustRow, setAdjustRow] = React.useState<InventoryRow | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => setRows(initialRows), [initialRows]);

  const patch = (id: string, next: Partial<InventoryRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...next } : r)));

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  function stockStatus(r: InventoryRow): "in" | "low" | "out" {
    if (!r.trackInventory) return "in";
    if (r.quantity <= 0) return "out";
    if (r.quantity <= r.lowStockAt) return "low";
    return "in";
  }

  const filtered = rows.filter((r) => {
    if (typeFilter !== "all" && r.productType !== typeFilter) return false;
    if (stockFilter !== "all" && stockStatus(r) !== stockFilter) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      const hay = [
        r.name,
        r.sku,
        r.categoryName,
        r.brand,
        r.setName,
        r.cardNumber,
        r.certNumber,
        r.condition,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className={cn("space-y-4", pending && "opacity-95")}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search name, SKU, set, cert #, condition…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-auto">
          <option value="all">All types</option>
          <option value="RAW_CARD">Raw cards</option>
          <option value="GRADED_SLAB">Slabs</option>
          <option value="SEALED">Sealed</option>
          <option value="APPAREL">Apparel</option>
          <option value="ART">Original art</option>
          <option value="COLLECTIBLE">Collectibles</option>
        </Select>
        <Select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} className="w-auto">
          <option value="all">All stock</option>
          <option value="in">In stock</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground tnum">
          {filtered.length} of {rows.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-medium">Product</th>
              <th className="px-3 py-2.5 font-medium">Price</th>
              <th className="px-3 py-2.5 font-medium">In stock</th>
              <th className="px-3 py-2.5 font-medium">Value</th>
              <th className="px-3 py-2.5 font-medium">On store</th>
              <th className="px-3 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((r) => {
              const soldOut = r.trackInventory && r.quantity <= 0;
              const low = r.trackInventory && r.quantity > 0 && r.quantity <= r.lowStockAt;
              return (
                <tr key={r.id} className="hover:bg-muted/30">
                  {/* Product */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border border-border bg-secondary">
                        {r.image ? (
                          <Image src={r.image} alt="" fill sizes="44px" className="object-cover" />
                        ) : (
                          <span className="flex h-full items-center justify-center text-[10px] font-bold gradient-text">
                            SST
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/admin/inventory/${r.id}/edit`}
                          className="block truncate font-medium hover:text-primary"
                        >
                          {r.name}
                        </Link>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-secondary-foreground">
                            {TYPE_LABEL[r.productType] ?? r.productType}
                          </span>
                          <span className="font-mono">{r.sku}</span>
                          {r.isUnique && <span className="text-primary">1-of-1</span>}
                          {r.featured && (
                            <span className="inline-flex items-center gap-0.5 text-primary">
                              <Tag className="size-3" /> Featured
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Price + cost */}
                  <td className="px-3 py-3">
                    <div className="tnum">{formatCents(r.priceCents)}</div>
                    {r.costCents > 0 && (
                      <div className="text-xs text-muted-foreground tnum">
                        cost {formatCents(r.costCents)}
                      </div>
                    )}
                  </td>

                  {/* Stock stepper */}
                  <td className="px-3 py-3">
                    {r.trackInventory ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            patch(r.id, { quantity: Math.max(0, r.quantity - 1) });
                            run(() => adjustQuantity(r.id, -1));
                          }}
                          disabled={r.quantity <= 0}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-input hover:bg-accent disabled:opacity-40"
                          aria-label="Decrease stock"
                        >
                          <Minus className="size-3.5" />
                        </button>
                        <input
                          type="number"
                          value={r.quantity}
                          min={0}
                          onChange={(e) =>
                            patch(r.id, { quantity: Math.max(0, Number(e.target.value) || 0) })
                          }
                          onBlur={(e) => {
                            // Never let an empty/invalid field zero out stock —
                            // revert to the server value instead of committing 0.
                            const raw = e.target.value.trim();
                            const n = Number(raw);
                            if (raw === "" || Number.isNaN(n)) {
                              router.refresh();
                              return;
                            }
                            run(() => setQuantity(r.id, Math.max(0, Math.floor(n))));
                          }}
                          className={cn(
                            "h-7 w-14 rounded-md border border-input bg-card text-center text-sm tnum",
                            soldOut && "border-destructive/50 text-destructive",
                            low && "border-warning/50 text-warning",
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            patch(r.id, { quantity: r.quantity + 1 });
                            run(() => adjustQuantity(r.id, 1));
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-input hover:bg-accent"
                          aria-label="Increase stock"
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <Badge variant="muted">Untracked</Badge>
                    )}
                  </td>

                  {/* Retail inventory value */}
                  <td className="px-3 py-3 tnum text-muted-foreground">
                    {r.trackInventory ? formatCents(r.priceCents * r.quantity) : "—"}
                  </td>

                  {/* Publish switch */}
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={r.published}
                      onClick={() => {
                        const next = !r.published;
                        patch(r.id, { published: next });
                        run(() => togglePublished(r.id, next));
                      }}
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                        r.published ? "bg-primary" : "bg-secondary",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-4 w-4 transform rounded-full bg-background transition-transform",
                          r.published ? "translate-x-6" : "translate-x-1",
                        )}
                      />
                    </button>
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (r.quantity <= 0) return;
                          patch(r.id, { quantity: Math.max(0, r.quantity - 1) });
                          run(() => sellOne(r.id));
                        }}
                        disabled={r.trackInventory && r.quantity <= 0}
                        className="rounded-md border border-input px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-40"
                        title="Record a counter sale (−1)"
                      >
                        Sold 1
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdjustRow(r)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-input hover:bg-accent"
                        aria-label="Adjust stock"
                        title="Adjust stock (reason + channel)"
                      >
                        <SlidersHorizontal className="size-3.5" />
                      </button>
                      <Link
                        href={`/admin/inventory/${r.id}/edit`}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-input hover:bg-accent"
                        aria-label="Edit"
                      >
                        <Pencil className="size-3.5" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          if (!confirm(`Delete "${r.name}"? This can't be undone.`)) return;
                          setRows((rs) => rs.filter((x) => x.id !== r.id));
                          run(() => deleteProduct(r.id));
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-input text-muted-foreground hover:border-destructive/50 hover:text-destructive"
                        aria-label="Delete"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                  No products match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {adjustRow && (
        <AdjustDialog
          row={{ id: adjustRow.id, name: adjustRow.name, quantity: adjustRow.quantity }}
          onClose={() => setAdjustRow(null)}
        />
      )}
    </div>
  );
}
