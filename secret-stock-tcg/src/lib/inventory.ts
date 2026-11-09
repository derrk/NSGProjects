import { prisma } from "@/lib/db";
import type {
  Prisma,
  InventoryTxnType,
  SalesChannel,
  ProductStatus,
} from "@prisma/client";

// The one place stock changes. Every mutation reads the current quantity, clamps,
// writes the new quantity, flips status if needed, and records an
// InventoryTransaction — so the ledger can always explain "why is this N?".
// See ARCHITECTURE.md D4.

// ── Pure math (unit-tested) ──────────────────────────────────────────────────

// Stock can never go negative.
export function nextQuantity(previous: number, change: number): number {
  return Math.max(0, previous + change);
}

// Auto-transition status from a quantity change. Manual states (DRAFT/ARCHIVED)
// are never overridden; ACTIVE ⇄ SOLD_OUT follows stock.
export function statusForQuantity(
  current: ProductStatus,
  quantity: number,
  trackInventory: boolean,
): ProductStatus {
  if (current === "ARCHIVED" || current === "DRAFT") return current;
  if (!trackInventory) return "ACTIVE";
  if (quantity <= 0) return "SOLD_OUT";
  return "ACTIVE";
}

// ── Ledgered mutations ───────────────────────────────────────────────────────

type ChangeOpts = {
  type: InventoryTxnType;
  channel?: SalesChannel | null;
  orderId?: string | null;
  userLabel?: string | null;
  note?: string | null;
};

// Accepts either the base client or a transaction client so callers can compose
// this with other writes in one atomic $transaction.
type Client = typeof prisma | Prisma.TransactionClient;

// Apply a relative change (+restock / −sale) and record it.
//
// The quantity write and the ledger write must land together or not at all —
// a half-applied change is stock that moved for no recorded reason, which is
// the one thing the ledger exists to prevent. When handed the base client we
// open our own transaction; when handed a transaction client we're already
// inside one and just run.
export async function applyInventoryChange(
  client: Client,
  productId: string,
  change: number,
  opts: ChangeOpts,
): Promise<number> {
  if ("$transaction" in client) {
    return client.$transaction((tx) => applyInventoryChange(tx, productId, change, opts));
  }
  const product = await client.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error("Product not found");

  const previousQty = product.quantity;
  const newQty = nextQuantity(previousQty, change);
  const actualChange = newQty - previousQty;
  if (actualChange === 0) return previousQty; // no-op: don't write a noise row
  const status = statusForQuantity(product.status, newQty, product.trackInventory);

  await client.product.update({
    where: { id: productId },
    data: { quantity: newQty, status },
  });
  await client.inventoryTransaction.create({
    data: {
      productId,
      previousQty,
      quantityChange: actualChange,
      newQty,
      type: opts.type,
      channel: opts.channel ?? null,
      orderId: opts.orderId ?? null,
      userLabel: opts.userLabel ?? "owner",
      note: opts.note ?? null,
    },
  });
  return newQty;
}

// Set an absolute quantity (a stock correction). Records the delta.
export async function setInventoryQuantity(
  client: Client,
  productId: string,
  target: number,
  opts: ChangeOpts,
): Promise<number> {
  // Same reason as above: read the current quantity inside the transaction that
  // writes it, or two corrections racing can both compute from a stale number.
  if ("$transaction" in client) {
    return client.$transaction((tx) => setInventoryQuantity(tx, productId, target, opts));
  }
  const product = await client.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error("Product not found");
  const clamped = Math.max(0, Math.floor(target));
  const change = clamped - product.quantity;
  if (change === 0) return product.quantity;
  return applyInventoryChange(client, productId, change, opts);
}

// ── Valuation ────────────────────────────────────────────────────────────────

export function inventoryValue(
  items: { quantity: number; costCents: number; priceCents: number }[],
): { costCents: number; retailCents: number } {
  return items.reduce(
    (acc, i) => ({
      costCents: acc.costCents + i.costCents * i.quantity,
      retailCents: acc.retailCents + i.priceCents * i.quantity,
    }),
    { costCents: 0, retailCents: 0 },
  );
}
