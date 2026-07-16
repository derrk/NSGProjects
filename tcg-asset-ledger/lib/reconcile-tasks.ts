// Catch-up backlog (the mirror of the Collectr sync backlog): Collectr knows
// something the ledger doesn't. Tasks are created by imports (a card vanished
// from the export, or Collectr's count dropped below the app's) and resolve
// automatically the moment a transaction brings the app back in line — or
// manually ("still have it" / merged into an imported duplicate).
import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

const OWNED_STATUSES = new Set(["InStock", "Grading"]);

interface AssetReconcileFields {
  id: string;
  status: string;
  quantity: number;
  inCollectr: boolean;
  collectrQuantity: number | null;
}

function isOwned(a: AssetReconcileFields): boolean {
  return OWNED_STATUSES.has(a.status) && a.quantity > 0;
}

/** One pending catch-up task per asset: update it in place or create it.
 *  Respects prior dismissals — "still have it" for the SAME gap isn't re-asked
 *  on every import. */
export async function upsertReconcileTask(
  db: Db,
  asset: AssetReconcileFields,
  kind: "vanished" | "qty-drop",
  collectrQtyBefore: number | null,
  collectrQtyAfter: number | null,
) {
  if (!isOwned(asset)) return; // nothing to catch up — the ledger already agrees it's gone

  // The user already answered "still have it" for this exact discrepancy.
  const dismissed = await db.reconcileTask.findFirst({
    where: { assetId: asset.id, status: "dismissed", kind },
    orderBy: { resolvedAt: "desc" },
  });
  if (dismissed && dismissed.collectrQtyAfter === collectrQtyAfter) return;

  const pending = await db.reconcileTask.findFirst({
    where: { assetId: asset.id, status: "pending" },
  });
  const data = {
    kind,
    appQty: asset.quantity,
    collectrQtyBefore,
    collectrQtyAfter,
  };
  if (pending) {
    await db.reconcileTask.update({ where: { id: pending.id }, data });
  } else {
    try {
      await db.reconcileTask.create({ data: { assetId: asset.id, ...data } });
    } catch (e) {
      // Partial unique index (one pending per asset) — a concurrent writer won
      // the race; update theirs instead.
      const raced = await db.reconcileTask.findFirst({
        where: { assetId: asset.id, status: "pending" },
      });
      if (raced) await db.reconcileTask.update({ where: { id: raced.id }, data });
      else throw e;
    }
  }
}

/**
 * Auto-resolution — runs whenever an asset's state changes (inside ledger
 * postings and imports, via reconcileAssetSync). DIRECTION-AWARE: it matters
 * which side moved.
 *   • asset no longer owned                      → transaction recorded
 *   • app qty dropped to the task's target       → recorded (enough sales)
 *   • Collectr count ROSE to meet the app (via an import — collectrQuantity is
 *     only ever set by imports; manual "Done" sets it null) → the user fixed
 *     Collectr, i.e. "I still have them"         → collectr-corrected
 *   • vanished card back in an export             → reappeared
 */
export async function autoResolveReconcileTasks(db: Db, asset: AssetReconcileFields) {
  const pending = await db.reconcileTask.findMany({
    where: { assetId: asset.id, status: "pending" },
  });
  for (const t of pending) {
    let resolution: string | null = null;
    if (!isOwned(asset)) {
      resolution = "recorded";
    } else if (t.kind === "vanished") {
      // Import evidence only: collectrQuantity != null distinguishes a real
      // export match from a manual mark-synced (which must NOT close the
      // "did it sell?" question).
      if (asset.inCollectr && asset.collectrQuantity != null) resolution = "reappeared";
    } else if (t.kind === "qty-drop") {
      if (asset.quantity <= (t.collectrQtyAfter ?? 0)) {
        // The APP side came down to the gap the task was raised for.
        resolution = "recorded";
      } else if (
        asset.inCollectr &&
        asset.collectrQuantity != null &&
        asset.collectrQuantity >= asset.quantity
      ) {
        // COLLECTR rose to meet the app (fresh import) — the user corrected
        // Collectr, which answers the question as "still have them".
        resolution = "collectr-corrected";
      }
    }
    if (resolution) {
      await db.reconcileTask.update({
        where: { id: t.id },
        data: { status: "resolved", resolution, resolvedAt: new Date() },
      });
    }
  }
}

/** Pending catch-up items with their asset, most valuable first. */
export async function listPendingReconcileTasks() {
  const tasks = await prisma.reconcileTask.findMany({
    where: { status: "pending" },
    include: { asset: true },
  });
  return tasks.sort((a, b) => {
    const va = (a.asset.priceOverrideCents ?? a.asset.marketValueCents) * a.asset.quantity;
    const vb = (b.asset.priceOverrideCents ?? b.asset.marketValueCents) * b.asset.quantity;
    return vb - va;
  });
}

export async function countPendingReconcileTasks(): Promise<number> {
  return prisma.reconcileTask.count({ where: { status: "pending" } });
}
