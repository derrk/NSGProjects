// Collectr sync backlog.
//
// The asset ledger captures buys/trades/breaks the moment they happen; Collectr
// doesn't know about them yet. This module derives a to-do list ("SyncTask") of
// what needs to change in your Collectr portfolio so the two stay in sync, and
// resolves those tasks automatically when a re-import confirms the change.
//
// Desired state per asset:
//   • not in Collectr, still owned          → "add"    (create it in Collectr)
//   • in Collectr, no longer owned           → "remove" (remove/zero it in Collectr)
//   • in Collectr, owned, cost basis differs → "update" (fix its cost in Collectr)
//   • otherwise                              → in sync (no task)

import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { formatUSD } from "./money";
import { autoResolveReconcileTasks, upsertReconcileTask } from "./reconcile-tasks";

type Db = Prisma.TransactionClient | typeof prisma;
export type SyncKind = "add" | "update" | "remove";

interface AssetSyncFields {
  status: string;
  quantity: number;
  inCollectr: boolean;
  costBasisCents: number;
  collectrCostCents: number | null;
  collectrQuantity: number | null;
  marketValueCents: number;
  priceOverrideCents: number | null;
}

/** Cards at PSA/CGC are still owned — don't tell the user to remove them. */
const OWNED_STATUSES = new Set(["InStock", "Grading"]);

/** What (if anything) Collectr needs updated to match this asset. */
export function desiredSyncKind(a: AssetSyncFields): SyncKind | null {
  const owned = OWNED_STATUSES.has(a.status) && a.quantity > 0;
  if (!a.inCollectr) return owned ? "add" : null;
  if (!owned) return "remove";
  // Quantity drift: Collectr's last-known quantity no longer matches (e.g.
  // sold 2 of 5) — Collectr needs its count fixed.
  if (a.collectrQuantity != null && a.collectrQuantity !== a.quantity) return "update";
  // Only nudge to fix cost when Collectr has a *conflicting non-zero* cost.
  // A blank (0) Collectr cost is fine — the app's basis stays authoritative
  // and simply fills the gap (you said forgetting the price is OK).
  if (a.collectrCostCents != null && a.collectrCostCents > 0 && a.costBasisCents !== a.collectrCostCents)
    return "update";
  return null;
}

/** Human-readable instruction for the backlog. */
export function syncNote(a: AssetSyncFields, kind: SyncKind): string {
  const market = a.priceOverrideCents ?? a.marketValueCents;
  if (kind === "add")
    return `Add to Collectr — qty ${a.quantity}, cost basis ${formatUSD(a.costBasisCents)}/u, market ${formatUSD(market)}.`;
  if (kind === "update") {
    const parts: string[] = [];
    if (a.collectrQuantity != null && a.collectrQuantity !== a.quantity)
      parts.push(`set quantity to ${a.quantity} (Collectr shows ${a.collectrQuantity})`);
    if (a.collectrCostCents != null && a.collectrCostCents > 0 && a.costBasisCents !== a.collectrCostCents)
      parts.push(
        `set cost basis to ${formatUSD(a.costBasisCents)}/u (Collectr shows ${formatUSD(a.collectrCostCents)})`,
      );
    return `Update in Collectr — ${parts.join("; ")}.`;
  }
  return `Remove or zero-out in Collectr — no longer in stock.`;
}

/**
 * Reconcile a single asset's pending sync task with its current state.
 * Idempotent: creates, retargets, or resolves the one pending task as needed.
 */
export async function reconcileAssetSync(db: Db, assetId: string, transactionId?: string | null) {
  const a = await db.asset.findUnique({ where: { id: assetId } });
  if (!a) return;

  // Catch-up tasks (the mirror backlog) self-resolve on any state change that
  // brings the ledger back in line with Collectr.
  await autoResolveReconcileTasks(db, a);

  const desired = desiredSyncKind(a);

  // While a catch-up question is open on this asset, don't emit Collectr-side
  // instructions that would contradict it (e.g. "set Collectr's quantity to 5"
  // while the catch-up asks "did 2 of these sell?"). Sync state re-derives as
  // soon as the question is answered.
  if (desired === "add" || desired === "update") {
    const openQuestion = await db.reconcileTask.findFirst({
      where: { assetId, status: "pending" },
      select: { id: true },
    });
    if (openQuestion) return;
  }
  const pending = await db.syncTask.findFirst({ where: { assetId, status: "pending" } });

  if (!desired) {
    if (pending) {
      await db.syncTask.update({
        where: { id: pending.id },
        data: { status: "done", resolvedAt: new Date() },
      });
    }
    return;
  }

  const note = syncNote(a, desired);
  if (pending) {
    await db.syncTask.update({
      where: { id: pending.id },
      data: { kind: desired, note, transactionId: transactionId ?? pending.transactionId },
    });
  } else {
    await db.syncTask.create({
      data: { assetId, kind: desired, note, transactionId: transactionId ?? null },
    });
  }
}

/**
 * After a Collectr import, any inCollectr asset whose key is ABSENT from the
 * export is no longer in Collectr. Both directions resolve through the normal
 * reconcile: a pending "remove" task completes (you deleted it in Collectr),
 * and a still-owned card surfaces an "add" task (it's missing over there).
 *
 * Scoped to the portfolios present in the import so a per-portfolio partial
 * export can't wrongly flip assets from other portfolios. Assets with no
 * recorded portfolio (e.g. manually marked synced) are treated as in scope.
 */
export async function reconcileAbsentFromImport(
  db: Db,
  importedKeys: string[],
  importedPortfolios: string[],
) {
  const keySet = new Set(importedKeys);
  const portfolios = new Set(importedPortfolios.map((p) => p.trim().toLowerCase()).filter(Boolean));

  const candidates = await db.asset.findMany({
    where: { inCollectr: true },
  });
  for (const a of candidates) {
    if (keySet.has(a.naturalKey)) continue;
    const scope = (a.portfolio ?? "").trim().toLowerCase();
    if (scope && portfolios.size > 0 && !portfolios.has(scope)) continue; // other portfolio — untouched

    // A card the ledger still owns just VANISHED from Collectr — most likely an
    // unrecorded sale. Surface it on the catch-up backlog before flipping state.
    await upsertReconcileTask(db, a, "vanished", a.collectrQuantity, 0);

    await db.asset.update({
      where: { id: a.id },
      data: { inCollectr: false, collectrCostCents: null, collectrQuantity: null },
    });
    await reconcileAssetSync(db, a.id);
  }
}

/** Pending backlog items with their asset + originating transaction. */
export async function listPendingSyncTasks() {
  return prisma.syncTask.findMany({
    where: { status: "pending" },
    include: {
      asset: true,
      transaction: { select: { id: true, type: true, date: true } },
    },
    orderBy: [{ kind: "asc" }, { createdAt: "desc" }],
  });
}

export async function countPendingSyncTasks(): Promise<number> {
  return prisma.syncTask.count({ where: { status: "pending" } });
}
