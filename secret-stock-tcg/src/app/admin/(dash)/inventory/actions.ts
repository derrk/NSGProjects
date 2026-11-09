"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type SalesChannel, type InventoryTxnType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isAdminAuthed } from "@/lib/auth";
import { productSchema, type ProductInput } from "@/lib/validators";
import { dollarsToCents } from "@/lib/money";
import { slugify, normalizeSku, suggestSku } from "@/lib/sku";
import { applyInventoryChange, setInventoryQuantity } from "@/lib/inventory";
import { toProductData } from "@/lib/product-mapping";

export type ProductFormState = { error?: string };

async function assertAdmin() {
  if (!(await isAdminAuthed())) throw new Error("Unauthorized");
}

// Refresh the admin views and the storefront so a change behind the counter
// shows up on the shop immediately.
function revalidateAll(slug?: string) {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/inventory");
  if (slug) revalidatePath(`/product/${slug}`);
}

// ── On-the-fly stock controls (all ledgered via lib/inventory) ───────────────—

export async function adjustQuantity(productId: string, delta: number) {
  await assertAdmin();
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: { slug: true },
  });
  if (!p) return;
  await applyInventoryChange(prisma, productId, delta, {
    type: delta > 0 ? "RESTOCK" : "MANUAL_ADJUSTMENT",
    note: "Quick adjust",
  });
  revalidateAll(p.slug);
}

export async function setQuantity(productId: string, quantity: number) {
  await assertAdmin();
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: { slug: true },
  });
  if (!p) return;
  await setInventoryQuantity(prisma, productId, quantity, {
    type: "MANUAL_ADJUSTMENT",
    note: "Set count",
  });
  revalidateAll(p.slug);
}

// "Sold one" — records an out-of-website sale (counter by default) and drops
// stock by one. Never goes below zero.
export async function sellOne(productId: string, channel: SalesChannel = "IN_STORE") {
  await assertAdmin();
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: { slug: true, quantity: true, trackInventory: true },
  });
  if (!p) return;
  if (p.trackInventory && p.quantity <= 0) return;
  await applyInventoryChange(prisma, productId, -1, {
    type: channel === "CARD_SHOW" ? "CARD_SHOW_SALE" : "IN_STORE_SALE",
    channel,
    note: "Counter sale",
  });
  revalidateAll(p.slug);
}

const ADJUST_REASONS: InventoryTxnType[] = [
  "RESTOCK",
  "MANUAL_ADJUSTMENT",
  "DAMAGE",
  "LOSS",
  "RETURN",
  "IN_STORE_SALE",
  "CARD_SHOW_SALE",
  "TRADE",
  "COLLECTION_PURCHASE",
];

// Full manual adjustment with a reason + optional sales channel + note — e.g.
// "Remove 1, reason Card show sale, channel CARD_SHOW, note: Dallas".
export async function recordAdjustment(
  productId: string,
  input: {
    mode: "add" | "remove" | "set";
    quantity: number;
    reason: string;
    channel?: string;
    note?: string;
  },
): Promise<{ error?: string }> {
  await assertAdmin();
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: { slug: true },
  });
  if (!p) return { error: "Product not found." };

  const type = (ADJUST_REASONS as string[]).includes(input.reason)
    ? (input.reason as InventoryTxnType)
    : "MANUAL_ADJUSTMENT";
  const channel = input.channel ? (input.channel as SalesChannel) : null;
  const qty = Math.max(0, Math.floor(input.quantity || 0));
  const opts = { type, channel, note: input.note?.trim() || null };

  if (input.mode === "set") {
    await setInventoryQuantity(prisma, productId, qty, opts);
  } else {
    await applyInventoryChange(prisma, productId, input.mode === "add" ? qty : -qty, opts);
  }
  revalidateAll(p.slug);
  return {};
}

// Pull an item from the store (or put it back) instantly.
export async function togglePublished(productId: string, published: boolean) {
  await assertAdmin();
  const p = await prisma.product.update({
    where: { id: productId },
    data: { published },
  });
  revalidateAll(p.slug);
}

export async function toggleFeatured(productId: string, featured: boolean) {
  await assertAdmin();
  const p = await prisma.product.update({
    where: { id: productId },
    data: { featured },
  });
  revalidateAll(p.slug);
}

export async function deleteProduct(productId: string) {
  await assertAdmin();
  const p = await prisma.product.findUnique({
    where: { id: productId },
    include: { _count: { select: { orderItems: true } } },
  });
  if (!p) return;
  // Preserve products with order history (archive instead of delete) so the
  // order snapshots keep their link.
  if (p._count.orderItems > 0) {
    await prisma.product.update({
      where: { id: productId },
      data: { published: false, status: "ARCHIVED", quantity: 0 },
    });
  } else {
    await prisma.product.delete({ where: { id: productId } });
  }
  revalidateAll(p.slug);
}

// ── Create / update from the product form ─────────────────────────────────────

function parseForm(formData: FormData): ProductInput {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const name = get("name");
  const brand = get("brand");

  let sku = normalizeSku(get("sku"));
  if (!sku) sku = normalizeSku(suggestSku(name, brand));
  let slug = slugify(get("slug"));
  if (!slug) slug = slugify(name);

  let images: string[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("images") ?? "[]"));
    if (Array.isArray(parsed)) images = parsed.filter((x) => typeof x === "string");
  } catch {
    // ignore malformed images payload
  }

  const isUnique = formData.get("isUnique") === "on";
  const trackInventory = isUnique ? true : formData.get("trackInventory") === "on";
  const quantity = isUnique ? 1 : Number.parseInt(get("quantity"), 10) || 0;

  const yearRaw = get("year");
  const year = yearRaw ? Number.parseInt(yearRaw, 10) || undefined : undefined;
  const tagsRaw = get("tags");
  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const compareAtRaw = get("compareAt");
  const weightRaw = get("weightOz");

  return productSchema.parse({
    name,
    sku,
    slug,
    productType: get("productType") || undefined,
    brand,
    categoryId: get("categoryId"),
    subcategory: get("subcategory"),
    description: get("description"),
    tags,
    costCents: dollarsToCents(get("cost") || "0"),
    priceCents: dollarsToCents(get("price") || "0"),
    compareAtCents: compareAtRaw ? dollarsToCents(compareAtRaw) : undefined,
    quantity,
    trackInventory,
    isUnique,
    lowStockAt: Number.parseInt(get("lowStockAt") || "2", 10) || 0,
    published: formData.get("published") === "on",
    featured: formData.get("featured") === "on",
    weightOz: weightRaw ? Number.parseInt(weightRaw, 10) : undefined,
    game: get("game"),
    setName: get("setName"),
    setCode: get("setCode"),
    cardNumber: get("cardNumber"),
    year,
    rarity: get("rarity"),
    language: get("language"),
    condition: get("condition"),
    gradingCompany: get("gradingCompany"),
    grade: get("grade"),
    certNumber: get("certNumber"),
    sealedType: get("sealedType"),
    releaseDate: get("releaseDate"),
    size: get("size"),
    color: get("color"),
    // Original art + prints. Every field the form renders has to be read back
    // here — the schema defaults a missing one to "", so an omission saves as
    // null without any error to notice.
    medium: get("medium"),
    dimensions: get("dimensions"),
    artist: get("artist"),
    // No visible input: the form carries it through a hidden field so editing a
    // product doesn't wipe an id set by the Collectr sync.
    collectrId: get("collectrId"),
    images,
  });
}

function friendlyError(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = (err.meta?.target as string[] | undefined)?.join(", ") ?? "value";
    return `That ${target.includes("sku") ? "SKU" : target.includes("slug") ? "URL slug" : target} is already in use.`;
  }
  if (err instanceof Error) return err.message;
  return "Could not save the product.";
}

export async function createProduct(
  _prev: ProductFormState | undefined,
  formData: FormData,
): Promise<ProductFormState> {
  await assertAdmin();
  let data: ProductInput;
  try {
    data = parseForm(formData);
  } catch {
    return { error: "Please fill in the required fields (name, price)." };
  }

  const initialQty = data.trackInventory ? data.quantity : 0;
  try {
    // Create at 0, then post the opening stock through the ledger as INITIAL.
    const created = await prisma.product.create({
      data: { ...toProductData(data), quantity: 0, status: data.published ? "ACTIVE" : "DRAFT" },
    });
    if (initialQty > 0) {
      await setInventoryQuantity(prisma, created.id, initialQty, {
        type: "INITIAL",
        note: "Opening stock",
      });
    }
  } catch (err) {
    return { error: friendlyError(err) };
  }

  revalidateAll(data.slug);
  redirect("/admin/inventory");
}

export async function updateProduct(
  _prev: ProductFormState | undefined,
  formData: FormData,
): Promise<ProductFormState> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing product id." };

  let data: ProductInput;
  try {
    data = parseForm(formData);
  } catch {
    return { error: "Please fill in the required fields (name, price)." };
  }

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return { error: "Product not found." };

  try {
    await prisma.product.update({ where: { id }, data: toProductData(data) });
    // Quantity edits go through the ledger as a correction.
    if (data.trackInventory && data.quantity !== existing.quantity) {
      await setInventoryQuantity(prisma, id, data.quantity, {
        type: "MANUAL_ADJUSTMENT",
        note: "Edited via form",
      });
    }
  } catch (err) {
    return { error: friendlyError(err) };
  }

  revalidateAll(data.slug);
  redirect("/admin/inventory");
}
