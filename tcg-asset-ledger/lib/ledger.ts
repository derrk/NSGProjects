// Ledger service — the single place that mutates inventory. Every business
// action is posted as a Transaction with one or more TransactionLines, and
// asset rows change ONLY as a side effect of posting. Nothing here is called
// directly from the client; server actions wrap these functions.

import { prisma } from "./db";
import type { Prisma } from "@prisma/client";
import { allocateByWeight } from "./money";
import { acquisitionCostCents, blendUnitBasis } from "./costbasis";
import { buildNaturalKey } from "./domain";
import { reconcileAssetSync } from "./sync-backlog";

type Tx = Prisma.TransactionClient;

/** Derive Collectr sync-backlog tasks for every asset this transaction touched.
 *  Runs INSIDE the posting transaction so ledger + backlog commit atomically —
 *  a posted buy can never silently miss its "add to Collectr" reminder. */
async function reconcileTouched(tx: Tx, transactionId: string) {
  const lines = await tx.transactionLine.findMany({
    where: { transactionId },
    select: { assetId: true },
  });
  for (const id of new Set(lines.map((l) => l.assetId))) {
    await reconcileAssetSync(tx, id, transactionId);
  }
}

/** Describes an asset being received (IN). Either targets an existing asset
 *  by id, or describes a brand-new one. */
export interface ReceivedLine {
  assetId?: string;
  /**
   * How to apply an IN line that targets an existing asset (assetId set):
   *   "add"     – blend basis and increase quantity (genuinely new stock)
   *   "reprice" – set the cost basis from this transaction, leave quantity as-is
   *               (the unit is already counted, e.g. imported from Collectr, and
   *               we're just attaching its real basis + papertrail). Prevents
   *               duplicate rows / double-counting when logging after the fact.
   */
  matchMode?: "add" | "reprice";
  name?: string;
  game?: string;
  assetType?: string;
  set?: string | null;
  cardNumber?: string | null;
  rarity?: string | null;
  variant?: string | null;
  grade?: string | null;
  condition?: string | null;
  location?: string | null;
  source?: string | null;
  notes?: string | null;

  quantity: number;
  unitMarketValueCents: number;
  /** Pin this line's per-unit basis instead of letting allocation set it. */
  unitBasisCentsOverride?: number;
}

/** Describes an asset being given up (OUT). Must reference an existing asset. */
export interface GivenLine {
  assetId: string;
  quantity: number;
  /** Sale price / trade-in value per unit (for records & proceeds split). */
  unitValueCents?: number;
}

interface CommonMeta {
  counterparty?: string | null;
  /** Optional link to a known Customer — additive; counterparty text is the
   *  fast default path and is never required. */
  customerId?: string | null;
  date?: Date;
  notes?: string | null;
  /** Where the deal happened (Show, Whatnot, eBay, ...). Auto-set to "Show"
   *  while Show Mode is active if not explicitly provided. */
  source?: string | null;
  /** Attribute this transaction to a specific show (post-hoc logging, e.g. a
   *  catch-up sale from last weekend). Overrides the active Show Mode stamp.
   *  Pass the literal "none" to force NO show even while Show Mode is active
   *  (null/undefined = auto). */
  showId?: string | null;
}

/** Show Mode stamp: while a show is active, every posted transaction gets the
 *  showId and (unless overridden) source "Show" — no manual selection. An
 *  explicit showId (post-hoc logging) always wins; the sentinel "none" means
 *  "explicitly no show" and skips the Show Mode fallback. */
async function showStamp(
  tx: Tx,
  explicitSource?: string | null,
  explicitShowId?: string | null,
): Promise<{ showId: string | null; source: string | null }> {
  let showId: string | null = null;
  if (explicitShowId === "none") {
    showId = null;
  } else if (explicitShowId) {
    // Validate it's a real show so a bad id can't silently orphan the txn.
    const show = await tx.show.findUnique({ where: { id: explicitShowId } });
    if (!show) throw new Error("Selected show no longer exists.");
    showId = show.id;
  } else {
    const state = await tx.appState.findUnique({ where: { id: 1 } });
    showId = state?.activeShowId ?? null;
  }
  // Empty string counts as "auto" — never let it mask the Show stamp.
  const explicit = explicitSource?.trim() ? explicitSource : null;
  return { showId, source: explicit ?? (showId ? "Show" : null) };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Split a basis pool across received lines: pinned lines keep their override,
 *  the rest share the remainder by market-value weight. Returns TOTAL basis
 *  (cents) per line. */
function splitReceivedBasis(received: ReceivedLine[], poolCents: number): number[] {
  const pinned = received.map((r) =>
    r.unitBasisCentsOverride != null ? r.unitBasisCentsOverride * r.quantity : null,
  );
  const pinnedSum = pinned.reduce<number>((a, b) => a + (b ?? 0), 0);
  const remaining = Math.max(0, poolCents - pinnedSum);

  const freeIdx = received.map((_, i) => i).filter((i) => pinned[i] == null);
  const weights = freeIdx.map(
    (i) => (received[i].unitMarketValueCents || 0) * received[i].quantity,
  );
  const alloc = allocateByWeight(remaining, weights);

  const result = received.map((_, i) => pinned[i] ?? 0);
  freeIdx.forEach((idx, k) => {
    result[idx] = alloc[k];
  });
  return result;
}

/** Apply an IN line: create or blend into an asset, and write the ledger line. */
async function applyIn(
  tx: Tx,
  transactionId: string,
  line: ReceivedLine,
  totalBasisCents: number,
): Promise<string> {
  // Per-unit basis of the units acquired in THIS line (pool / line qty).
  const unitBasis = line.quantity > 0 ? Math.round(totalBasisCents / line.quantity) : totalBasisCents;

  // Guard: a "reprice" line must target a real asset. Without this a malformed
  // payload would fall through and create a duplicate — the exact thing reprice
  // exists to prevent.
  if (line.matchMode === "reprice" && !line.assetId) {
    throw new Error("Match-existing line has no inventory asset selected.");
  }

  // Match to an existing asset the user picked. Quantity is untouched because
  // the unit is already counted (e.g. imported from Collectr before the trade
  // was logged); we blend the acquired units' basis into the existing lot so
  // the per-unit figure stays correct across the whole lot.
  if (line.assetId && line.matchMode === "reprice") {
    const asset = await tx.asset.findUniqueOrThrow({ where: { id: line.assetId } });
    if (asset.status === "Grading") {
      throw new Error(
        `"${asset.name}" is out for grading — its lot can't be changed until the return is recorded.`,
      );
    }
    if (line.quantity > asset.quantity) {
      throw new Error(
        `Can't reprice ${line.quantity} of "${asset.name}" — only ${asset.quantity} in stock. Use "New card" to add stock.`,
      );
    }
    // Units not touched by this transaction keep their existing basis; the
    // acquired units take the allocated pool. Blend across the full lot size.
    const blendedUnitBasis = blendUnitBasis(
      asset.quantity - line.quantity,
      asset.costBasisCents,
      line.quantity,
      totalBasisCents,
    );
    await tx.asset.update({
      where: { id: asset.id },
      data: {
        costBasisCents: blendedUnitBasis,
        marketValueCents: line.unitMarketValueCents || asset.marketValueCents,
        status: "InStock",
        acquiredAt: asset.acquiredAt ?? new Date(),
        ledgerTouched: true,
      },
    });
    await tx.transactionLine.create({
      data: {
        transactionId,
        assetId: asset.id,
        direction: "IN",
        quantity: line.quantity,
        unitValueCents: line.unitMarketValueCents,
        unitBasisCents: unitBasis,
      },
    });
    return asset.id;
  }

  // Resolve target asset: explicit id, else match by natural key, else create.
  let assetId = line.assetId;
  if (!assetId) {
    const naturalKey = buildNaturalKey({
      game: line.game,
      set: line.set,
      name: line.name,
      cardNumber: line.cardNumber,
      variant: line.variant,
      grade: line.grade,
      condition: line.condition,
    });
    const existing = await tx.asset.findUnique({ where: { naturalKey } });
    if (existing) assetId = existing.id;

    if (!assetId) {
      // Days-held metrics run from the posting transaction's date.
      const txnDate = (
        await tx.transaction.findUniqueOrThrow({
          where: { id: transactionId },
          select: { date: true },
        })
      ).date;
      const created = await tx.asset.create({
        data: {
          name: line.name ?? "Unnamed asset",
          game: line.game ?? "Other",
          assetType: line.assetType ?? "RawCard",
          set: line.set ?? null,
          cardNumber: line.cardNumber ?? null,
          rarity: line.rarity ?? null,
          variant: line.variant ?? null,
          grade: line.grade ?? null,
          condition: line.condition ?? null,
          location: line.location ?? null,
          source: line.source ?? null,
          notes: line.notes ?? null,
          quantity: line.quantity,
          costBasisCents: unitBasis,
          marketValueCents: line.unitMarketValueCents,
          status: "InStock",
          naturalKey,
          ledgerTouched: true,
          acquiredAt: txnDate,
        },
      });
      assetId = created.id;
      await tx.transactionLine.create({
        data: {
          transactionId,
          assetId,
          direction: "IN",
          quantity: line.quantity,
          unitValueCents: line.unitMarketValueCents,
          unitBasisCents: unitBasis,
        },
      });
      return assetId;
    }
  }

  // Blend into the existing asset (weighted-average per-unit basis).
  const asset = await tx.asset.findUniqueOrThrow({ where: { id: assetId } });
  if (asset.status === "Grading") {
    throw new Error(
      `"${asset.name}" is out for grading — its lot can't be changed until the return is recorded. ` +
        `If this is a different physical copy, give it a distinguishing field (e.g. condition or location).`,
    );
  }
  const blended = blendUnitBasis(
    asset.quantity,
    asset.costBasisCents,
    line.quantity,
    totalBasisCents,
  );
  // Restocking an emptied lot starts a fresh aging clock; a live lot keeps its
  // original acquisition date. Null (legacy rows) backfills to now.
  const wasEmpty = asset.quantity <= 0;
  await tx.asset.update({
    where: { id: assetId },
    data: {
      quantity: asset.quantity + line.quantity,
      costBasisCents: blended,
      marketValueCents: line.unitMarketValueCents || asset.marketValueCents,
      status: "InStock",
      acquiredAt: wasEmpty ? new Date() : (asset.acquiredAt ?? new Date()),
      ledgerTouched: true,
    },
  });
  await tx.transactionLine.create({
    data: {
      transactionId,
      assetId,
      direction: "IN",
      quantity: line.quantity,
      unitValueCents: line.unitMarketValueCents,
      unitBasisCents: unitBasis,
    },
  });
  return assetId;
}

/** Apply an OUT line: reduce quantity, set closing status, write ledger line.
 *  Returns the total basis (cents) that left inventory. */
async function applyOut(
  tx: Tx,
  transactionId: string,
  line: GivenLine,
  statusWhenEmpty: string,
): Promise<number> {
  const asset = await tx.asset.findUniqueOrThrow({ where: { id: line.assetId } });
  if (asset.status === "Grading") {
    throw new Error(
      `"${asset.name}" is out for grading — record the grading return before selling or trading it.`,
    );
  }
  if (line.quantity > asset.quantity) {
    throw new Error(
      `Cannot remove ${line.quantity} of "${asset.name}" — only ${asset.quantity} in stock.`,
    );
  }
  const unitBasis = asset.costBasisCents;
  const newQty = asset.quantity - line.quantity;
  await tx.asset.update({
    where: { id: asset.id },
    data: {
      quantity: newQty,
      status: newQty <= 0 ? statusWhenEmpty : asset.status,
      // A lot that fully leaves inventory is no longer a brick.
      ...(newQty <= 0 ? { isBrick: false } : {}),
      ledgerTouched: true,
    },
  });
  await tx.transactionLine.create({
    data: {
      transactionId,
      assetId: asset.id,
      direction: "OUT",
      quantity: line.quantity,
      unitValueCents: line.unitValueCents ?? asset.marketValueCents,
      unitBasisCents: unitBasis,
    },
  });
  return unitBasis * line.quantity;
}

// ── Public posting API ───────────────────────────────────────────────────────

/** BUY: cash out, assets in. Basis of received = cash paid, allocated by
 *  market value (pinned per-line costs respected). */
export async function recordBuy(input: CommonMeta & {
  cashPaidCents: number;
  received: ReceivedLine[];
}) {
  if (input.received.length === 0) throw new Error("A buy needs at least one item.");
  return prisma.$transaction(async (tx) => {
    const txn = await tx.transaction.create({
      data: {
        type: "BUY",
        date: input.date ?? new Date(),
        counterparty: input.counterparty ?? null,
        customerId: input.customerId ?? null,
        cashDeltaCents: -Math.abs(input.cashPaidCents),
        notes: input.notes ?? null,
        ...(await showStamp(tx, input.source, input.showId)),
      },
    });
    const basisPerLine = splitReceivedBasis(input.received, input.cashPaidCents);
    for (let i = 0; i < input.received.length; i++) {
      await applyIn(tx, txn.id, input.received[i], basisPerLine[i]);
    }
    await reconcileTouched(tx, txn.id);
    return txn;
  });
}

/** SALE: assets out, cash in. Realized profit = proceeds − basis. */
export async function recordSale(input: CommonMeta & {
  proceedsCents: number;
  given: GivenLine[];
}) {
  if (input.given.length === 0) throw new Error("A sale needs at least one item.");
  return prisma.$transaction(async (tx) => {
    const txn = await tx.transaction.create({
      data: {
        type: "SALE",
        date: input.date ?? new Date(),
        counterparty: input.counterparty ?? null,
        customerId: input.customerId ?? null,
        cashDeltaCents: Math.abs(input.proceedsCents),
        notes: input.notes ?? null,
        ...(await showStamp(tx, input.source, input.showId)),
      },
    });

    // Split proceeds across sold lines by their sale value so each line records
    // a fair share (used for per-item realized P/L).
    const weights = input.given.map(
      (g) => (g.unitValueCents ?? 0) * g.quantity,
    );
    const proceedsPerLine = allocateByWeight(input.proceedsCents, weights);

    for (let i = 0; i < input.given.length; i++) {
      const g = input.given[i];
      const unitProceeds = g.quantity > 0 ? Math.round(proceedsPerLine[i] / g.quantity) : 0;
      await applyOut(tx, txn.id, { ...g, unitValueCents: unitProceeds }, "Sold");
    }
    await reconcileTouched(tx, txn.id);
    return txn;
  });
}

/** TRADE: assets out + assets in + optional cash either way. The flagship
 *  cost-basis flow — basis carries from given assets (+cash) into received. */
export async function recordTrade(input: CommonMeta & {
  /** Signed: negative = you paid cash, positive = you received cash. */
  cashDeltaCents: number;
  given: GivenLine[];
  received: ReceivedLine[];
}) {
  if (input.given.length === 0 && input.received.length === 0) {
    throw new Error("A trade needs items on at least one side.");
  }
  return prisma.$transaction(async (tx) => {
    const txn = await tx.transaction.create({
      data: {
        type: "TRADE",
        date: input.date ?? new Date(),
        counterparty: input.counterparty ?? null,
        customerId: input.customerId ?? null,
        cashDeltaCents: input.cashDeltaCents,
        notes: input.notes ?? null,
        ...(await showStamp(tx, input.source, input.showId)),
      },
    });

    // 1) Remove given assets and total up the basis leaving inventory.
    let givenBasisCents = 0;
    for (const g of input.given) {
      givenBasisCents += await applyOut(tx, txn.id, g, "Traded");
    }

    // 2) Basis to spread across received = given basis + cash paid.
    const pool = acquisitionCostCents({
      givenBasisCents,
      cashDeltaCents: input.cashDeltaCents,
    });
    const basisPerLine = splitReceivedBasis(input.received, pool);
    for (let i = 0; i < input.received.length; i++) {
      await applyIn(tx, txn.id, input.received[i], basisPerLine[i]);
    }
    await reconcileTouched(tx, txn.id);
    return txn;
  });
}

/** BREAK: turn a sealed product into packs/cards. Parent basis is allocated
 *  to the children by market value. */
export async function recordBreak(input: CommonMeta & {
  sealedAssetId: string;
  quantity: number;
  received: ReceivedLine[];
}) {
  if (input.received.length === 0) throw new Error("A break needs resulting items.");
  return prisma.$transaction(async (tx) => {
    const txn = await tx.transaction.create({
      data: {
        type: "BREAK",
        date: input.date ?? new Date(),
        counterparty: input.counterparty ?? null,
        customerId: input.customerId ?? null,
        cashDeltaCents: 0,
        notes: input.notes ?? null,
        ...(await showStamp(tx, input.source, input.showId)),
      },
    });
    const parentBasis = await applyOut(
      tx,
      txn.id,
      { assetId: input.sealedAssetId, quantity: input.quantity },
      "BrokenDown",
    );
    const basisPerLine = splitReceivedBasis(input.received, parentBasis);
    for (let i = 0; i < input.received.length; i++) {
      await applyIn(tx, txn.id, input.received[i], basisPerLine[i]);
    }
    await reconcileTouched(tx, txn.id);
    return txn;
  });
}

/** PRIZE: give an asset away as a prize. Its basis becomes a write-off. */
export async function recordPrize(input: CommonMeta & {
  given: GivenLine[];
}) {
  if (input.given.length === 0) throw new Error("A prize needs at least one item.");
  return prisma.$transaction(async (tx) => {
    const txn = await tx.transaction.create({
      data: {
        type: "PRIZE",
        date: input.date ?? new Date(),
        counterparty: input.counterparty ?? null,
        customerId: input.customerId ?? null,
        cashDeltaCents: 0,
        notes: input.notes ?? null,
        ...(await showStamp(tx, input.source, input.showId)),
      },
    });
    for (const g of input.given) {
      await applyOut(tx, txn.id, { ...g, unitValueCents: 0 }, "UsedAsPrize");
    }
    await reconcileTouched(tx, txn.id);
    return txn;
  });
}

/** One spin within a paid wheel session. */
export interface WheelSpinLine {
  slotId: string;
  /** Inventory asset paid out on this spin (omit for bundles / no-cost prizes). */
  assetId?: string;
  quantity?: number;
}

/** WHEEL SESSION: a customer buys spins (1/$10, 3/$25, 5/$40, ...). Posts one
 *  WHEEL_REVENUE transaction for the cash, one WHEEL_PRIZE transaction for any
 *  inventory payouts (real basis leaves as prize cost), and a WheelSpin row per
 *  spin — slot hit, allocated revenue share, and prize cost (asset basis or the
 *  slot's estimated bundle cost). */
export async function recordWheelSession(input: CommonMeta & {
  priceCents: number;
  spins: WheelSpinLine[];
}) {
  if (input.spins.length === 0) throw new Error("A wheel session needs at least one spin.");
  if (input.priceCents < 0) throw new Error("Session price can't be negative.");
  return prisma.$transaction(async (tx) => {
    const stamp = await showStamp(tx, input.source, input.showId);
    const date = input.date ?? new Date();

    const revenueTxn = await tx.transaction.create({
      data: {
        type: "WHEEL_REVENUE",
        date,
        counterparty: input.counterparty ?? null,
        customerId: input.customerId ?? null,
        cashDeltaCents: Math.abs(input.priceCents),
        notes: input.notes ?? `Wheel — ${input.spins.length} spin(s)`,
        ...stamp,
      },
    });

    // Inventory payouts share one WHEEL_PRIZE posting.
    const hasInventoryPrizes = input.spins.some((s) => s.assetId);
    let prizeTxnId: string | null = null;
    const basisBySpin = new Map<number, number>();
    if (hasInventoryPrizes) {
      const prizeTxn = await tx.transaction.create({
        data: {
          type: "WHEEL_PRIZE",
          date,
          counterparty: input.counterparty ?? null,
          customerId: input.customerId ?? null,
          cashDeltaCents: 0,
          notes: "Wheel prizes paid from inventory",
          ...stamp,
        },
      });
      prizeTxnId = prizeTxn.id;
      for (const [i, s] of input.spins.entries()) {
        if (!s.assetId) continue;
        const basis = await applyOut(
          tx,
          prizeTxn.id,
          { assetId: s.assetId, quantity: s.quantity ?? 1, unitValueCents: 0 },
          "UsedAsPrize",
        );
        basisBySpin.set(i, basis);
      }
    }

    // Even revenue split across the session's spins (exact to the cent).
    const revenueSplit = allocateByWeight(
      Math.abs(input.priceCents),
      input.spins.map(() => 1),
    );
    for (const [i, s] of input.spins.entries()) {
      const slot = await tx.wheelSlot.findUniqueOrThrow({ where: { id: s.slotId } });
      await tx.wheelSpin.create({
        data: {
          date,
          slotId: s.slotId,
          assetId: s.assetId ?? null,
          quantity: s.quantity ?? 1,
          revenueCents: revenueSplit[i],
          prizeCostCents: basisBySpin.get(i) ?? slot.estCostCents,
          showId: stamp.showId,
          revenueTransactionId: revenueTxn.id,
          prizeTransactionId: s.assetId ? prizeTxnId : null,
        },
      });
    }

    if (prizeTxnId) await reconcileTouched(tx, prizeTxnId);
    return revenueTxn;
  });
}

/** WHEEL PRIZE (catch-up): an inventory card went out on the wheel, but the
 *  spins were logged without the prize attached (busy show — slot est-cost was
 *  used). Attach the card to the most recent prize-less spins of its slot:
 *  posts the WHEEL_PRIZE outflow at real basis and swaps the spins' estimated
 *  cost for the truth. Revenue is NOT touched — it was logged with the session. */
export async function recordWheelPrizeAttach(input: {
  assetId: string;
  slotId: string;
  quantity: number;
  date?: Date;
}) {
  if (input.quantity < 1) throw new Error("Quantity must be at least 1.");
  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findUniqueOrThrow({ where: { id: input.assetId } });
    const slot = await tx.wheelSlot.findUniqueOrThrow({ where: { id: input.slotId } });

    const spins = await tx.wheelSpin.findMany({
      where: { slotId: slot.id, assetId: null },
      orderBy: { date: "desc" },
      take: input.quantity,
    });
    if (spins.length < input.quantity) {
      throw new Error(
        `Only ${spins.length} logged "${slot.label}" spin(s) are missing a prize. ` +
          `Log the session on the Wheel page (with the prize attached) instead.`,
      );
    }

    // Attribute the outflow to the show the spins belong to (if any).
    const showId = spins.find((s) => s.showId)?.showId ?? null;

    const txn = await tx.transaction.create({
      data: {
        type: "WHEEL_PRIZE",
        date: input.date ?? spins[0].date,
        cashDeltaCents: 0,
        notes: `Wheel prize (catch-up) — attached to ${input.quantity} logged "${slot.label}" spin(s)`,
        source: "Show",
        showId,
      },
    });

    const totalBasis = await applyOut(
      tx,
      txn.id,
      { assetId: asset.id, quantity: input.quantity, unitValueCents: 0 },
      "UsedAsPrize",
    );
    const unitBasis = Math.round(totalBasis / input.quantity);

    for (const s of spins) {
      await tx.wheelSpin.update({
        where: { id: s.id },
        data: {
          assetId: asset.id,
          quantity: 1,
          // Replace the slot's estimated cost with the card's real basis.
          prizeCostCents: unitBasis,
          prizeTransactionId: txn.id,
        },
      });
    }

    await reconcileTouched(tx, txn.id);
    return txn;
  });
}

/** ADJUSTMENT: manual correction with an audit trail. Adjusts quantity and/or
 *  market value / basis on a single asset. */
export async function recordAdjustment(input: CommonMeta & {
  assetId: string;
  quantityDelta?: number;
  newMarketValueCents?: number;
  newCostBasisCents?: number;
}) {
  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findUniqueOrThrow({ where: { id: input.assetId } });
    const txn = await tx.transaction.create({
      data: {
        type: "ADJUSTMENT",
        date: input.date ?? new Date(),
        counterparty: input.counterparty ?? null,
        customerId: input.customerId ?? null,
        cashDeltaCents: 0,
        notes: input.notes ?? null,
        ...(await showStamp(tx, input.source, input.showId)),
      },
    });

    const delta = input.quantityDelta ?? 0;
    if (delta !== 0 && asset.status === "Grading") {
      throw new Error(
        `"${asset.name}" is out for grading — record the return before adjusting its quantity.`,
      );
    }
    const newQty = Math.max(0, asset.quantity + delta);
    // Restocking via adjustment restores InStock from ANY emptied status
    // (Sold/Traded/BrokenDown/UsedAsPrize) — not just Sold. Grading stays.
    const TERMINAL = ["Sold", "Traded", "BrokenDown", "UsedAsPrize"];
    const restocked = newQty > 0 && TERMINAL.includes(asset.status);
    const newStatus =
      newQty <= 0
        ? TERMINAL.includes(asset.status)
          ? asset.status
          : "Sold"
        : restocked
          ? "InStock"
          : asset.status;
    await tx.asset.update({
      where: { id: asset.id },
      data: {
        quantity: newQty,
        marketValueCents: input.newMarketValueCents ?? asset.marketValueCents,
        costBasisCents: input.newCostBasisCents ?? asset.costBasisCents,
        status: newStatus,
        // A restock starts a fresh aging clock; emptied lots stop being bricks.
        ...(restocked ? { acquiredAt: new Date() } : {}),
        ...(newQty <= 0 ? { isBrick: false } : {}),
        ledgerTouched: true,
      },
    });

    if (delta !== 0) {
      await tx.transactionLine.create({
        data: {
          transactionId: txn.id,
          assetId: asset.id,
          direction: delta > 0 ? "IN" : "OUT",
          quantity: Math.abs(delta),
          unitValueCents: input.newMarketValueCents ?? asset.marketValueCents,
          unitBasisCents: input.newCostBasisCents ?? asset.costBasisCents,
        },
      });
    }
    // Zero-delta adjustments create no lines, so reconcile the asset directly.
    await reconcileAssetSync(tx, asset.id, txn.id);
    return txn;
  });
}

/** GRADING SUBMIT: send a card to PSA/CGC. The SAME asset stays in the ledger —
 *  status flips to Grading and the grading costs (shipping + insurance + fee)
 *  are folded into its cost basis via a real transaction. Papertrail: an OUT
 *  line marks the card leaving for the grader. */
export async function recordGradingSubmit(input: CommonMeta & {
  assetId: string;
  company: string;
  serviceLevel?: string | null;
  expectedReturnAt?: Date | null;
  shippingCents: number;
  insuranceCents: number;
  feeCents: number;
}) {
  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findUniqueOrThrow({ where: { id: input.assetId } });
    if (asset.status !== "InStock" || asset.quantity <= 0) {
      throw new Error(`"${asset.name}" isn't in stock — only in-stock cards can be submitted.`);
    }
    const open = await tx.gradingSubmission.findFirst({
      where: { assetId: asset.id, status: "Out" },
    });
    if (open) throw new Error(`"${asset.name}" is already out for grading.`);

    const totalFeesCents =
      Math.abs(input.shippingCents) + Math.abs(input.insuranceCents) + Math.abs(input.feeCents);

    const txn = await tx.transaction.create({
      data: {
        type: "GRADING_SUBMIT",
        date: input.date ?? new Date(),
        counterparty: input.company,
        customerId: input.customerId ?? null,
        cashDeltaCents: -totalFeesCents,
        notes: input.notes ?? null,
        ...(await showStamp(tx, input.source, input.showId)),
      },
    });

    // Fold the fees into the lot's per-unit basis (usually qty 1).
    const newUnitBasis = Math.round(
      (asset.costBasisCents * asset.quantity + totalFeesCents) / asset.quantity,
    );
    await tx.asset.update({
      where: { id: asset.id },
      data: { status: "Grading", costBasisCents: newUnitBasis, ledgerTouched: true },
    });

    // OUT line = the card left for the grader (it's still owned).
    await tx.transactionLine.create({
      data: {
        transactionId: txn.id,
        assetId: asset.id,
        direction: "OUT",
        quantity: asset.quantity,
        unitValueCents: asset.priceOverrideCents ?? asset.marketValueCents,
        unitBasisCents: newUnitBasis,
      },
    });

    await tx.gradingSubmission.create({
      data: {
        assetId: asset.id,
        company: input.company,
        serviceLevel: input.serviceLevel ?? null,
        submittedAt: input.date ?? new Date(),
        expectedReturnAt: input.expectedReturnAt ?? null,
        quantity: asset.quantity,
        shippingCents: Math.abs(input.shippingCents),
        insuranceCents: Math.abs(input.insuranceCents),
        feeCents: Math.abs(input.feeCents),
        marketValueAtSubmitCents: asset.priceOverrideCents ?? asset.marketValueCents,
        basisBeforeCents: asset.costBasisCents,
        notes: input.notes ?? null,
        submitTransactionId: txn.id,
      },
    });

    await reconcileAssetSync(tx, asset.id, txn.id);
    return txn;
  });
}

/** GRADING RETURN: the card comes back graded. Still the same asset — it gains
 *  a grade, cert number, and (usually) a new market value. Its natural key is
 *  recomputed (grade changed) and its Collectr sync state resets so the backlog
 *  tells you to update the listing there. */
export async function recordGradingReturn(input: CommonMeta & {
  submissionId: string;
  grade: string;
  certNumber?: string | null;
  newMarketValueCents?: number | null;
}) {
  return prisma.$transaction(async (tx) => {
    const sub = await tx.gradingSubmission.findUniqueOrThrow({
      where: { id: input.submissionId },
      include: { asset: true },
    });
    if (sub.status !== "Out") throw new Error("This submission has already been returned.");
    const asset = sub.asset;
    if (asset.status !== "Grading" || asset.quantity <= 0) {
      throw new Error(
        `"${asset.name}" is no longer in the Grading state (status ${asset.status}, qty ${asset.quantity}) — fix the asset before recording the return.`,
      );
    }

    const newMarket = input.newMarketValueCents ?? asset.marketValueCents;
    const newKey = buildNaturalKey({ ...asset, grade: input.grade });
    if (newKey !== asset.naturalKey) {
      const clash = await tx.asset.findUnique({ where: { naturalKey: newKey } });
      if (clash) {
        throw new Error(
          `Another asset already exists with this graded identity ("${clash.name}", ${input.grade}). Merge or edit it first.`,
        );
      }
    }

    const txn = await tx.transaction.create({
      data: {
        type: "GRADING_RETURN",
        date: input.date ?? new Date(),
        counterparty: sub.company,
        customerId: input.customerId ?? null,
        cashDeltaCents: 0,
        notes: input.notes ?? null,
        ...(await showStamp(tx, input.source, input.showId)),
      },
    });

    await tx.asset.update({
      where: { id: asset.id },
      data: {
        status: "InStock",
        assetType: "GradedCard",
        grade: input.grade,
        gradingCompany: sub.company,
        certNumber: input.certNumber ?? null,
        marketValueCents: newMarket,
        // The raw card's manual price override no longer applies to a slab.
        priceOverrideCents: null,
        naturalKey: newKey,
        ledgerTouched: true,
        // Collectr still lists the RAW card. Reset sync state so the backlog
        // surfaces "add the graded version" (update the Collectr listing).
        inCollectr: false,
        collectrCostCents: null,
        collectrQuantity: null,
      },
    });

    // IN line = the card came back (now graded). Quantity comes from the
    // submission record, never from lot drift.
    await tx.transactionLine.create({
      data: {
        transactionId: txn.id,
        assetId: asset.id,
        direction: "IN",
        quantity: sub.quantity,
        unitValueCents: newMarket,
        unitBasisCents: asset.costBasisCents,
      },
    });

    await tx.gradingSubmission.update({
      where: { id: sub.id },
      data: {
        status: "Returned",
        returnedAt: input.date ?? new Date(),
        grade: input.grade,
        certNumber: input.certNumber ?? null,
        marketValueAtReturnCents: newMarket,
        // Remember the raw identity so a Collectr re-import of the old listing
        // is flagged instead of silently re-created.
        rawNaturalKey: asset.naturalKey,
        returnTransactionId: txn.id,
      },
    });

    await reconcileAssetSync(tx, asset.id, txn.id);
    return txn;
  });
}
