// Reconcile a parsed Collectr export against the asset ledger.
//
// Rules (Collectr is the pricing/collection backbone; this app owns live
// transaction truth):
//   • unknown natural key                 → CREATE a new asset
//   • known key, never touched by ledger  → REFRESH qty + cost + price
//   • known key, ledger has transactions  → PRICE-ONLY refresh (never clobber
//                                            a computed cost basis or quantity;
//                                            flag any quantity mismatch)

import { prisma } from "./db";
import { effectiveMarketCents, type CollectrRow } from "./collectr";
import { reconcileAssetSync, reconcileAbsentFromImport } from "./sync-backlog";
import { upsertReconcileTask } from "./reconcile-tasks";

export type ImportAction = "create" | "refresh" | "price-only";

export interface ImportPlanItem {
  naturalKey: string;
  name: string;
  action: ImportAction;
  existingId?: string;
  qtyBefore: number | null;
  qtyAfter: number;
  costBeforeCents: number | null;
  costAfterCents: number;
  marketBeforeCents: number | null;
  marketAfterCents: number;
  quantityMismatch: boolean;
  /** For "create" rows: name of an existing hand-entered asset this row
   *  probably IS (same game + similar name but non-matching key). Committing
   *  would double-count — the user should fix the asset's fields to match. */
  possibleDuplicateOf?: string;
  row: CollectrRow;
}

export interface ImportPlan {
  items: ImportPlanItem[];
  createCount: number;
  refreshCount: number;
  priceOnlyCount: number;
  mismatchCount: number;
  duplicateWarningCount: number;
}

/** Merge duplicate rows that share a natural key (sum qty, weighted-avg cost). */
function aggregateRows(rows: CollectrRow[]): CollectrRow[] {
  const map = new Map<string, CollectrRow>();
  for (const r of rows) {
    const existing = map.get(r.naturalKey);
    if (!existing) {
      map.set(r.naturalKey, { ...r });
      continue;
    }
    const totalQty = existing.quantity + r.quantity;
    const blendedCost =
      totalQty > 0
        ? Math.round(
            (existing.costBasisCents * existing.quantity + r.costBasisCents * r.quantity) / totalQty,
          )
        : 0;
    map.set(r.naturalKey, {
      ...existing,
      quantity: totalQty,
      costBasisCents: blendedCost,
      // Prefer the most recent market/override (last row wins).
      marketValueCents: r.marketValueCents || existing.marketValueCents,
      priceOverrideCents: r.priceOverrideCents ?? existing.priceOverrideCents,
    });
  }
  return [...map.values()];
}

/** Loose identity for duplicate warnings: game + normalized name (parenthetical
 *  qualifiers stripped, lowercased). Catches hand-typed buys whose set/variant
 *  spelling doesn't byte-match Collectr's canonical CSV values. */
function looseIdentity(game: string, name: string): string {
  const n = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return `${game.trim().toLowerCase()}|${n}`;
}

export async function planImport(rows: CollectrRow[]): Promise<ImportPlan> {
  const agg = aggregateRows(rows);
  const keys = agg.map((r) => r.naturalKey);
  const existing = await prisma.asset.findMany({
    where: { naturalKey: { in: keys } },
  });
  const byKey = new Map(existing.map((a) => [a.naturalKey, a]));

  // Assets NOT in Collectr yet (hand-entered buys/trades awaiting sync) — a
  // "create" row loosely matching one of these is probably the same card with
  // divergent hand-typed fields, and committing it would double-count.
  const unsynced = await prisma.asset.findMany({
    where: { inCollectr: false, status: { in: ["InStock", "Grading"] }, quantity: { gt: 0 } },
    select: { game: true, name: true, naturalKey: true },
  });
  const looseUnsynced = new Map(unsynced.map((a) => [looseIdentity(a.game, a.name), a.name]));

  // Raw identities of cards that have since been GRADED here: the Collectr
  // export may still carry the old raw listing. Creating it would resurrect a
  // card that now exists as a slab — flag it instead.
  const returnedSubs = await prisma.gradingSubmission.findMany({
    where: { status: "Returned", rawNaturalKey: { not: null } },
    include: { asset: { select: { name: true, grade: true } } },
  });
  const rawKeyToGraded = new Map(
    returnedSubs.map((s) => [
      s.rawNaturalKey!,
      `${s.asset.name} (now ${s.asset.grade ?? "graded"} — update the Collectr listing)`,
    ]),
  );

  const items: ImportPlanItem[] = agg.map((row) => {
    const market = effectiveMarketCents(row);
    const found = byKey.get(row.naturalKey);
    if (!found) {
      return {
        naturalKey: row.naturalKey,
        name: row.name,
        action: "create",
        qtyBefore: null,
        qtyAfter: row.quantity,
        costBeforeCents: null,
        costAfterCents: row.costBasisCents,
        marketBeforeCents: null,
        marketAfterCents: market,
        quantityMismatch: false,
        possibleDuplicateOf:
          rawKeyToGraded.get(row.naturalKey) ?? looseUnsynced.get(looseIdentity(row.game, row.name)),
        row,
      };
    }
    const priceOnly = found.ledgerTouched;
    return {
      naturalKey: row.naturalKey,
      name: row.name,
      action: priceOnly ? "price-only" : "refresh",
      existingId: found.id,
      qtyBefore: found.quantity,
      qtyAfter: priceOnly ? found.quantity : row.quantity,
      costBeforeCents: found.costBasisCents,
      costAfterCents: priceOnly ? found.costBasisCents : row.costBasisCents,
      marketBeforeCents: found.priceOverrideCents ?? found.marketValueCents,
      marketAfterCents: market,
      quantityMismatch: priceOnly && found.quantity !== row.quantity,
      row,
    };
  });

  return {
    items,
    createCount: items.filter((i) => i.action === "create").length,
    refreshCount: items.filter((i) => i.action === "refresh").length,
    priceOnlyCount: items.filter((i) => i.action === "price-only").length,
    mismatchCount: items.filter((i) => i.quantityMismatch).length,
    duplicateWarningCount: items.filter((i) => i.possibleDuplicateOf).length,
  };
}

export async function applyPlan(
  plan: ImportPlan,
  meta: { fileName?: string; asOfDate: Date | null },
): Promise<{ created: number; updated: number; syncedCount: number }> {
  let created = 0;
  let updated = 0;
  let syncedCount = 0;

  await prisma.$transaction(async (tx) => {
    // Snapshot the ids of tasks pending BEFORE the import so syncedCount
    // reports actual confirmations, unskewed by tasks the import creates.
    const pendingBefore = await tx.syncTask.findMany({
      where: { status: "pending" },
      select: { id: true },
    });
    const touchedAssetIds: string[] = [];

    // A brand-new row in a routine import = something acquired that the ledger
    // hasn't heard about → ask "how?" on the catch-up backlog. A fresh seed
    // (empty database) is cataloging, not acquiring — skip the questions then.
    const isSeedImport = (await tx.asset.count()) === 0;

    for (const item of plan.items) {
      const row = item.row;
      if (item.action === "create") {
        const createdAsset = await tx.asset.create({
          data: {
            name: row.name,
            game: row.game,
            assetType: row.assetType,
            set: row.set,
            cardNumber: row.cardNumber,
            rarity: row.rarity,
            variant: row.variant,
            grade: row.grade,
            condition: row.condition,
            quantity: row.quantity,
            costBasisCents: row.costBasisCents,
            marketValueCents: row.marketValueCents,
            priceOverrideCents: row.priceOverrideCents,
            status: "InStock",
            source: "Collectr import",
            portfolio: row.portfolio || null,
            notes: row.notes,
            collectrDateAdded: row.collectrDateAdded,
            marketPriceAsOf: meta.asOfDate,
            watchlist: row.watchlist,
            naturalKey: row.naturalKey,
            ledgerTouched: false,
            acquiredAt: row.collectrDateAdded ?? new Date(),
            // It came FROM Collectr, so it's in sync by definition.
            inCollectr: true,
            collectrCostCents: row.costBasisCents,
            collectrQuantity: row.quantity,
          },
        });
        if (!isSeedImport) {
          await upsertReconcileTask(tx, createdAsset, "appeared", null, row.quantity);
        }
        created++;
      } else if (item.action === "refresh") {
        await tx.asset.update({
          where: { id: item.existingId! },
          data: {
            quantity: row.quantity,
            costBasisCents: row.costBasisCents,
            marketValueCents: row.marketValueCents,
            priceOverrideCents: row.priceOverrideCents,
            status: row.quantity > 0 ? "InStock" : "Sold",
            portfolio: row.portfolio || null,
            marketPriceAsOf: meta.asOfDate,
            watchlist: row.watchlist,
            inCollectr: true,
            collectrCostCents: row.costBasisCents,
            collectrQuantity: row.quantity,
          },
        });
        touchedAssetIds.push(item.existingId!);
        updated++;
      } else {
        // price-only: refresh market data, protect ledger-owned qty/basis.
        // Seeing the card in the export proves it IS in Collectr; record the
        // cost/quantity Collectr shows so the backlog can confirm or nudge
        // (e.g. "you sold 2 — set Collectr's quantity to 3").
        const before = await tx.asset.findUniqueOrThrow({ where: { id: item.existingId! } });
        await tx.asset.update({
          where: { id: item.existingId! },
          data: {
            marketValueCents: row.marketValueCents,
            priceOverrideCents: row.priceOverrideCents,
            marketPriceAsOf: meta.asOfDate,
            watchlist: row.watchlist,
            inCollectr: true,
            collectrCostCents: row.costBasisCents,
            collectrQuantity: row.quantity,
          },
        });
        // Collectr's count dropped below the ledger's — likely an unrecorded
        // sale. Put it on the catch-up backlog (auto-resolves once recorded).
        if (row.quantity < before.quantity) {
          await upsertReconcileTask(
            tx,
            { ...before, inCollectr: true, collectrQuantity: row.quantity },
            "qty-drop",
            before.collectrQuantity,
            row.quantity,
          );
        }
        touchedAssetIds.push(item.existingId!);
        updated++;
      }
    }

    // Reconcile backlog: matched assets may resolve their pending add/update
    // tasks (or surface an "update" if Collectr's cost/qty conflicts)…
    for (const id of touchedAssetIds) await reconcileAssetSync(tx, id);
    // …and assets absent from the export are no longer in Collectr: pending
    // "remove" tasks resolve; still-owned cards surface "add" tasks.
    await reconcileAbsentFromImport(
      tx,
      plan.items.map((i) => i.naturalKey),
      plan.items.map((i) => i.row.portfolio),
    );

    // Confirmations = tasks that were pending before and are now done.
    syncedCount = await tx.syncTask.count({
      where: { id: { in: pendingBefore.map((t) => t.id) }, status: "done" },
    });

    await tx.importBatch.create({
      data: {
        source: "collectr",
        fileName: meta.fileName ?? null,
        marketPriceAsOf: meta.asOfDate,
        createdCount: created,
        updatedCount: updated,
        skippedCount: 0,
      },
    });
  }, { timeout: 30_000 }); // large imports run many statements in one tx

  return { created, updated, syncedCount };
}
