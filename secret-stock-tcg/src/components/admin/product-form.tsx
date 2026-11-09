"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import {
  createProduct,
  updateProduct,
  type ProductFormState,
} from "@/app/admin/(dash)/inventory/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageUpload } from "@/components/admin/image-upload";
import { cn } from "@/lib/utils";
import { dollarsToCents, formatCents } from "@/lib/money";
import {
  buildListPrice,
  netAfterCosts,
  STRIPE_PERCENT,
  STRIPE_FIXED_CENTS,
  type ShippingBuildConfig,
} from "@/lib/price-builder";

type ProductType =
  | "RAW_CARD"
  | "GRADED_SLAB"
  | "SEALED"
  | "APPAREL"
  | "ART"
  | "COLLECTIBLE";

export type ProductFormInitial = {
  id?: string;
  name?: string;
  sku?: string;
  slug?: string;
  productType?: ProductType;
  brand?: string;
  categoryId?: string;
  subcategory?: string;
  description?: string;
  tags?: string[];
  costCents?: number;
  priceCents?: number;
  compareAtCents?: number | null;
  quantity?: number;
  trackInventory?: boolean;
  isUnique?: boolean;
  lowStockAt?: number;
  published?: boolean;
  featured?: boolean;
  weightOz?: number | null;
  game?: string | null;
  setName?: string | null;
  setCode?: string | null;
  cardNumber?: string | null;
  year?: number | null;
  rarity?: string | null;
  language?: string | null;
  condition?: string | null;
  gradingCompany?: string | null;
  grade?: string | null;
  certNumber?: string | null;
  sealedType?: string | null;
  releaseDate?: string | null;
  size?: string | null;
  color?: string | null;
  medium?: string | null;
  dimensions?: string | null;
  artist?: string | null;
  collectrId?: string | null;
  images?: string[];
};

const TYPES: { value: ProductType; label: string }[] = [
  { value: "RAW_CARD", label: "Raw Card" },
  { value: "GRADED_SLAB", label: "Graded Slab" },
  { value: "SEALED", label: "Sealed" },
  { value: "APPAREL", label: "Apparel" },
  { value: "ART", label: "Original Art" },
  { value: "COLLECTIBLE", label: "Collectible" },
];

type FieldDef = {
  name: string;
  label: string;
  placeholder?: string;
  type?: "text" | "number";
  list?: string;
};

// Which promoted fields each product type shows.
const TYPE_FIELDS: Record<ProductType, FieldDef[]> = {
  RAW_CARD: [
    { name: "game", label: "Game / Sport", placeholder: "Pokémon, One Piece, Sports…" },
    { name: "setName", label: "Set" },
    { name: "setCode", label: "Set code" },
    { name: "cardNumber", label: "Card number" },
    { name: "year", label: "Year", type: "number" },
    { name: "rarity", label: "Rarity" },
    { name: "language", label: "Language", placeholder: "English" },
    { name: "condition", label: "Condition", list: "cond-card" },
  ],
  GRADED_SLAB: [
    { name: "game", label: "Game / Sport" },
    { name: "setName", label: "Set" },
    { name: "cardNumber", label: "Card number" },
    { name: "year", label: "Year", type: "number" },
    { name: "gradingCompany", label: "Grading company", list: "grading-co" },
    { name: "grade", label: "Grade", placeholder: "10, 9.5 GEM MT" },
    { name: "certNumber", label: "Certification #" },
  ],
  SEALED: [
    { name: "game", label: "Game" },
    { name: "setName", label: "Set" },
    { name: "sealedType", label: "Product type", list: "sealed-type" },
    { name: "releaseDate", label: "Release date", placeholder: "2024-11-08 or Q4 2024" },
  ],
  APPAREL: [
    { name: "size", label: "Size", placeholder: "M, 10.5, XL" },
    { name: "color", label: "Color" },
    { name: "condition", label: "Condition", list: "cond-apparel" },
  ],
  ART: [
    { name: "medium", label: "Medium", placeholder: "Original Canvas, Print…" },
    { name: "dimensions", label: "Dimensions", placeholder: '11" x 14"' },
    { name: "artist", label: "Artist" },
    { name: "year", label: "Year", type: "number" },
  ],
  COLLECTIBLE: [
    { name: "condition", label: "Condition" },
  ],
};

function dollars(cents?: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

export function ProductForm({
  mode,
  categories,
  initial = {},
  build,
}: {
  mode: "create" | "edit";
  categories: { id: string; name: string }[];
  initial?: ProductFormInitial;
  /** Store pricing rules, so the suggestion matches what checkout does. */
  build: ShippingBuildConfig & { includeShippingInPrice: boolean };
}) {
  const action = mode === "create" ? createProduct : updateProduct;
  const [state, formAction, pending] = useActionState<ProductFormState | undefined, FormData>(
    action,
    undefined,
  );

  const [type, setType] = React.useState<ProductType>(initial.productType ?? "COLLECTIBLE");
  const [isUnique, setIsUnique] = React.useState(initial.isUnique ?? false);
  const [trackInventory, setTrackInventory] = React.useState(initial.trackInventory ?? true);

  // Price and weight are controlled so the builder below can read the weight
  // and write a suggested price back into the field.
  const [price, setPrice] = React.useState(dollars(initial.priceCents));
  const [weightOz, setWeightOz] = React.useState(
    initial.weightOz == null ? "" : String(initial.weightOz),
  );
  const [want, setWant] = React.useState("");

  const oz = Number.parseFloat(weightOz);
  const hasWeight = Number.isFinite(oz) && oz > 0;
  const wantCents = want.trim() ? dollarsToCents(want) : 0;
  const built = wantCents > 0 ? buildListPrice(wantCents, oz, build) : null;

  const priceCents = price.trim() ? dollarsToCents(price) : 0;
  const keepsCents =
    priceCents > 0
      ? build.includeShippingInPrice
        ? netAfterCosts(priceCents, oz, build)
        : priceCents -
          (Math.round((priceCents * STRIPE_PERCENT) / 100) + STRIPE_FIXED_CENTS)
      : null;

  const v = (x: string | number | null | undefined) => (x == null ? "" : String(x));

  return (
    <form action={formAction} className="space-y-6">
      {mode === "edit" && <input type="hidden" name="id" value={initial.id} />}
      {/* Set by the Collectr sync, not by hand. Carried through the form so an
          edit here doesn't blank it. */}
      <input type="hidden" name="collectrId" value={initial.collectrId ?? ""} />
      <input type="hidden" name="productType" value={type} />

      {/* Product type selector */}
      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              type === t.value
                ? "border-primary bg-primary/15 text-primary"
                : "border-input text-foreground/80 hover:bg-accent",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name *</Label>
                <Input id="name" name="name" defaultValue={initial.name} required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="brand">Brand</Label>
                  <Input id="brand" name="brand" defaultValue={v(initial.brand)} placeholder="Pokémon, Nike…" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="categoryId">Category</Label>
                  <Select id="categoryId" name="categoryId" defaultValue={initial.categoryId ?? ""}>
                    <option value="">— None —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sku">SKU</Label>
                  <Input id="sku" name="sku" defaultValue={v(initial.sku)} placeholder="auto from name if blank" className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="slug">URL slug</Label>
                  <Input id="slug" name="slug" defaultValue={v(initial.slug)} placeholder="auto from name if blank" className="font-mono" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" defaultValue={v(initial.description)} rows={4} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input id="tags" name="tags" defaultValue={(initial.tags ?? []).join(", ")} placeholder="vintage, chase, graded" />
              </div>
            </CardContent>
          </Card>

          {/* Type-specific attributes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {TYPES.find((t) => t.value === type)?.label} attributes
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {TYPE_FIELDS[type].map((f) => (
                <div key={f.name} className="space-y-1.5">
                  <Label htmlFor={f.name}>{f.label}</Label>
                  <Input
                    id={f.name}
                    name={f.name}
                    type={f.type ?? "text"}
                    list={f.list}
                    placeholder={f.placeholder}
                    defaultValue={v(initial[f.name as keyof ProductFormInitial] as string | number | null)}
                  />
                </div>
              ))}
              {/* datalists reused across types */}
              <datalist id="cond-card">
                {["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <datalist id="cond-apparel">
                {["New", "New With Tags", "Excellent", "Good", "Used", "Other"].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <datalist id="grading-co">
                {["PSA", "CGC", "BGS", "SGC", "Other"].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <datalist id="sealed-type">
                {["Booster Pack", "Booster Box", "Elite Trainer Box", "Collection Box", "Bundle", "Case", "Starter Deck", "Other"].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Images</CardTitle>
            </CardHeader>
            <CardContent>
              <ImageUpload initial={initial.images ?? []} />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="cost">Cost basis (USD)</Label>
                <Input id="cost" name="cost" inputMode="decimal" defaultValue={dollars(initial.costCents)} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="price">Selling price (USD) *</Label>
                <Input
                  id="price"
                  name="price"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  required
                />
                {keepsCents != null && (
                  <p className="text-xs text-muted-foreground">
                    Keeps about{" "}
                    <span className={cn(keepsCents < 0 && "text-destructive")}>
                      {formatCents(keepsCents)}
                    </span>{" "}
                    {build.includeShippingInPrice
                      ? "after postage and card fees."
                      : "after card fees; shipping is billed separately."}
                  </p>
                )}
              </div>

              {/* Works backwards from what the owner wants to clear, so a
                  price can be set on the shop floor without doing the
                  postage and card-fee arithmetic by hand. */}
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="takeHome" className="text-xs">
                    Price builder
                  </Label>
                  <span className="text-[11px] text-muted-foreground">
                    {build.includeShippingInPrice
                      ? "shipping included"
                      : "shipping extra"}
                  </span>
                </div>
                <Input
                  id="takeHome"
                  inputMode="decimal"
                  value={want}
                  onChange={(e) => setWant(e.target.value)}
                  placeholder="What you want to clear, e.g. 20.00"
                  className="h-9"
                />
                {built && (
                  <>
                    <dl className="space-y-0.5 text-xs text-muted-foreground">
                      <div className="flex justify-between gap-2">
                        <dt>Item</dt>
                        <dd>{formatCents(built.baseCents)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>
                          Postage {hasWeight ? `(${oz} oz)` : "(est.)"}
                          {build.shipMarkupPercent > 0
                            ? ` + ${build.shipMarkupPercent}%`
                            : ""}
                        </dt>
                        <dd>{formatCents(built.shippingCents)}</dd>
                      </div>
                      {built.stripeFeeCents > 0 && (
                        <div className="flex justify-between gap-2">
                          <dt>Card fee</dt>
                          <dd>{formatCents(built.stripeFeeCents)}</dd>
                        </div>
                      )}
                    </dl>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={() =>
                        setPrice((built.listPriceCents / 100).toFixed(2))
                      }
                    >
                      Use {formatCents(built.listPriceCents)}
                    </Button>
                    {!hasWeight && (
                      <p className="text-[11px] text-muted-foreground">
                        No weight set, so postage is a rough estimate. Add a
                        weight below for a closer figure.
                      </p>
                    )}
                  </>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="compareAt">Compare-at (was) price</Label>
                <Input id="compareAt" name="compareAt" inputMode="decimal" defaultValue={dollars(initial.compareAtCents)} placeholder="optional" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inventory</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="isUnique"
                  checked={isUnique}
                  onChange={(e) => setIsUnique(e.target.checked)}
                  className="size-4 accent-[hsl(var(--primary))]"
                />
                Unique item (one of a kind — qty 1)
              </label>
              {!isUnique && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="trackInventory"
                    checked={trackInventory}
                    onChange={(e) => setTrackInventory(e.target.checked)}
                    className="size-4 accent-[hsl(var(--primary))]"
                  />
                  Track stock quantity
                </label>
              )}
              {!isUnique && trackInventory && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input id="quantity" name="quantity" type="number" min={0} defaultValue={initial.quantity ?? 0} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lowStockAt">Low-stock at</Label>
                    <Input id="lowStockAt" name="lowStockAt" type="number" min={0} defaultValue={initial.lowStockAt ?? 2} />
                  </div>
                </div>
              )}
              {isUnique && (
                <p className="text-xs text-muted-foreground">
                  Quantity is pinned to 1. Once it sells, it&apos;s automatically marked sold out.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Shipping</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                <Label htmlFor="weightOz">Weight (oz)</Label>
                <Input
                  id="weightOz"
                  name="weightOz"
                  type="number"
                  min={0}
                  value={weightOz}
                  onChange={(e) => setWeightOz(e.target.value)}
                  placeholder="for shipping labels and pricing"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Visibility</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="published" defaultChecked={initial.published ?? false} className="size-4 accent-[hsl(var(--primary))]" />
                Published (live on store)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="featured" defaultChecked={initial.featured ?? false} className="size-4 accent-[hsl(var(--primary))]" />
                Featured
              </label>
            </CardContent>
          </Card>
        </div>
      </div>

      {state?.error && (
        <p className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">{state.error}</p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Create product" : "Save changes"}
        </Button>
        <Link href="/admin/inventory">
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  );
}
