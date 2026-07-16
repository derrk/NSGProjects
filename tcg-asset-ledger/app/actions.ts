"use server";

import { z } from "zod";
import path from "node:path";
import { unlink } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { buildNaturalKey, TRANSACTION_SOURCES } from "@/lib/domain";
import {
  recordBuy,
  recordSale,
  recordTrade,
  recordBreak,
  recordPrize,
  recordAdjustment,
  recordGradingSubmit,
  recordGradingReturn,
  type ReceivedLine,
  type GivenLine,
} from "@/lib/ledger";
import { enterShowMode, endShowMode } from "@/lib/shows";
import { reconcileAssetSync } from "@/lib/sync-backlog";
import { upsertReconcileTask } from "@/lib/reconcile-tasks";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

// ── Schemas ──────────────────────────────────────────────────────────────────
const receivedLineSchema = z
  .object({
    assetId: z.string().optional(),
    matchMode: z.enum(["add", "reprice"]).optional(),
    name: z.string().optional(),
    game: z.string().optional(),
    assetType: z.string().optional(),
    set: z.string().nullish(),
    cardNumber: z.string().nullish(),
    rarity: z.string().nullish(),
    variant: z.string().nullish(),
    grade: z.string().nullish(),
    condition: z.string().nullish(),
    location: z.string().nullish(),
    source: z.string().nullish(),
    notes: z.string().nullish(),
    quantity: z.number().int().positive(),
    unitMarketValueCents: z.number().int().nonnegative(),
    unitBasisCentsOverride: z.number().int().nonnegative().optional(),
  })
  // A "reprice" match must reference a real existing asset, otherwise it would
  // create a duplicate. A plain "new" line must carry a name.
  .refine((v) => v.matchMode !== "reprice" || (!!v.assetId && v.assetId.trim() !== ""), {
    message: "A matched item must reference an existing asset.",
  })
  .refine((v) => Boolean(v.assetId) || (v.name && v.name.trim() !== ""), {
    message: "A new item needs a name.",
  });

// Served upload paths only — local /uploads files or our Vercel Blob store.
// Never arbitrary external URLs.
const attachmentPathSchema = z
  .string()
  .regex(/^(\/uploads\/[A-Za-z0-9._-]+|https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/uploads\/[A-Za-z0-9._-]+)$/);

const givenLineSchema = z.object({
  assetId: z.string().min(1),
  quantity: z.number().int().positive(),
  unitValueCents: z.number().int().nonnegative().optional(),
});

const metaSchema = {
  counterparty: z.string().nullish(),
  notes: z.string().nullish(),
  date: z.string().nullish(),
  // Empty string = "auto" (Show Mode stamps it); anything else must be a real source.
  source: z
    .enum(TRANSACTION_SOURCES)
    .nullish()
    .or(z.literal("").transform(() => null)),
  // Post-hoc show attribution (catch-up logging); empty string = none.
  showId: z
    .string()
    .nullish()
    .transform((v) => (v?.trim() ? v : null)),
  attachmentPaths: z.array(attachmentPathSchema).optional(),
};

function toDate(s: string | null | undefined): Date | undefined {
  if (!s) return undefined;
  // Date-only strings (from <input type="date">) must parse as LOCAL dates.
  // `new Date("2026-07-09")` is UTC midnight per spec, which renders as the
  // previous day in US timezones and made every edit round-trip drift a day.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) {
    const d = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    return isNaN(d.getTime()) ? undefined : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

/** Persist uploaded photo paths against a transaction. Best-effort: the
 *  business event is already committed, so an attachment hiccup must never
 *  make the action report failure (a retry would double-post inventory). */
async function saveAttachments(transactionId: string, paths?: string[]) {
  if (!paths || paths.length === 0) return;
  try {
    await prisma.attachment.createMany({
      data: paths.map((p) => ({ transactionId, path: p, kind: "photo" })),
    });
  } catch (e) {
    console.error("saveAttachments failed (transaction already posted):", e);
  }
}

// ── Asset CRUD ─────────────────────────────────────────────────────────────
const assetSchema = z.object({
  name: z.string().min(1, "Name is required"),
  game: z.string().min(1),
  assetType: z.string().min(1),
  set: z.string().nullish(),
  cardNumber: z.string().nullish(),
  rarity: z.string().nullish(),
  variant: z.string().nullish(),
  grade: z.string().nullish(),
  condition: z.string().nullish(),
  location: z.string().nullish(),
  source: z.string().nullish(),
  notes: z.string().nullish(),
  quantity: z.number().int().nonnegative(),
  costBasisCents: z.number().int().nonnegative(),
  marketValueCents: z.number().int().nonnegative(),
  status: z.string().min(1),
});

export async function createAsset(input: unknown): Promise<ActionResult> {
  const parsed = assetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  const d = parsed.data;
  const naturalKey = buildNaturalKey(d);
  const existing = await prisma.asset.findUnique({ where: { naturalKey } });
  if (existing) {
    return {
      ok: false,
      error: `An identical asset already exists ("${existing.name}"). Use Adjust or a Buy to add more.`,
    };
  }
  const asset = await prisma.asset.create({
    data: { ...d, naturalKey, acquiredAt: new Date() },
  });
  // Manual creates change ownership state — keep the Collectr backlog honest.
  await reconcileAssetSync(prisma, asset.id);
  revalidateAll();
  return { ok: true, id: asset.id };
}

export async function updateAsset(id: string, input: unknown): Promise<ActionResult> {
  const parsed = assetSchema.partial().safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  const current = await prisma.asset.findUnique({ where: { id } });
  if (!current) return { ok: false, error: "Asset not found" };
  const merged = { ...current, ...parsed.data };
  const naturalKey = buildNaturalKey(merged);
  await prisma.asset.update({
    where: { id },
    data: { ...parsed.data, naturalKey },
  });
  // Manual edits can change status/quantity/basis — re-derive the sync task.
  await reconcileAssetSync(prisma, id);
  revalidateAll();
  revalidatePath(`/inventory/${id}`);
  return { ok: true, id };
}

export async function deleteAsset(id: string): Promise<ActionResult> {
  const lineCount = await prisma.transactionLine.count({ where: { assetId: id } });
  if (lineCount > 0) {
    return {
      ok: false,
      error: "This asset has transaction history and can't be deleted. Mark it Sold or adjust its quantity instead.",
    };
  }
  await prisma.asset.delete({ where: { id } });
  revalidatePath("/inventory");
  revalidatePath("/");
  return { ok: true };
}

// ── Transaction flows ─────────────────────────────────────────────────────
function revalidateAll() {
  revalidatePath("/", "layout"); // layout carries the backlog badges
  revalidatePath("/");
  revalidatePath("/inventory");
  revalidatePath("/transactions");
  revalidatePath("/reports");
  revalidatePath("/sync");
  revalidatePath("/reconcile");
}

const buySchema = z.object({
  ...metaSchema,
  cashPaidCents: z.number().int().nonnegative(),
  received: z.array(receivedLineSchema).min(1, "Add at least one item"),
});

export async function recordBuyAction(input: unknown): Promise<ActionResult> {
  const parsed = buySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  try {
    const txn = await recordBuy({
      counterparty: parsed.data.counterparty,
      notes: parsed.data.notes,
      date: toDate(parsed.data.date),
      source: parsed.data.source,
      showId: parsed.data.showId,
      cashPaidCents: parsed.data.cashPaidCents,
      received: parsed.data.received as ReceivedLine[],
    });
    await saveAttachments(txn.id, parsed.data.attachmentPaths);
    revalidateAll();
    return { ok: true, id: txn.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to record buy" };
  }
}

const saleSchema = z.object({
  ...metaSchema,
  proceedsCents: z.number().int().nonnegative(),
  given: z.array(givenLineSchema).min(1, "Add at least one item"),
});

export async function recordSaleAction(input: unknown): Promise<ActionResult> {
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  try {
    const txn = await recordSale({
      counterparty: parsed.data.counterparty,
      notes: parsed.data.notes,
      date: toDate(parsed.data.date),
      source: parsed.data.source,
      showId: parsed.data.showId,
      proceedsCents: parsed.data.proceedsCents,
      given: parsed.data.given as GivenLine[],
    });
    await saveAttachments(txn.id, parsed.data.attachmentPaths);
    revalidateAll();
    return { ok: true, id: txn.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to record sale" };
  }
}

const tradeSchema = z.object({
  ...metaSchema,
  cashDeltaCents: z.number().int(),
  given: z.array(givenLineSchema),
  received: z.array(receivedLineSchema),
});

export async function recordTradeAction(input: unknown): Promise<ActionResult> {
  const parsed = tradeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  if (parsed.data.given.length === 0 && parsed.data.received.length === 0) {
    return { ok: false, error: "Add items to at least one side of the trade" };
  }
  try {
    const txn = await recordTrade({
      counterparty: parsed.data.counterparty,
      notes: parsed.data.notes,
      date: toDate(parsed.data.date),
      source: parsed.data.source,
      showId: parsed.data.showId,
      cashDeltaCents: parsed.data.cashDeltaCents,
      given: parsed.data.given as GivenLine[],
      received: parsed.data.received as ReceivedLine[],
    });
    await saveAttachments(txn.id, parsed.data.attachmentPaths);
    revalidateAll();
    return { ok: true, id: txn.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to record trade" };
  }
}

const breakSchema = z.object({
  ...metaSchema,
  sealedAssetId: z.string().min(1),
  quantity: z.number().int().positive(),
  received: z.array(receivedLineSchema).min(1, "Add at least one resulting item"),
});

export async function recordBreakAction(input: unknown): Promise<ActionResult> {
  const parsed = breakSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  try {
    const txn = await recordBreak({
      notes: parsed.data.notes,
      date: toDate(parsed.data.date),
      source: parsed.data.source,
      showId: parsed.data.showId,
      sealedAssetId: parsed.data.sealedAssetId,
      quantity: parsed.data.quantity,
      received: parsed.data.received as ReceivedLine[],
    });
    await saveAttachments(txn.id, parsed.data.attachmentPaths);
    revalidateAll();
    return { ok: true, id: txn.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to record break" };
  }
}

const prizeSchema = z.object({
  ...metaSchema,
  given: z.array(givenLineSchema).min(1, "Add at least one item"),
});

export async function recordPrizeAction(input: unknown): Promise<ActionResult> {
  const parsed = prizeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  try {
    const txn = await recordPrize({
      notes: parsed.data.notes,
      date: toDate(parsed.data.date),
      source: parsed.data.source,
      showId: parsed.data.showId,
      given: parsed.data.given as GivenLine[],
    });
    await saveAttachments(txn.id, parsed.data.attachmentPaths);
    revalidateAll();
    return { ok: true, id: txn.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to record prize" };
  }
}

const adjustSchema = z.object({
  ...metaSchema,
  assetId: z.string().min(1),
  quantityDelta: z.number().int().optional(),
  newMarketValueCents: z.number().int().nonnegative().optional(),
  newCostBasisCents: z.number().int().nonnegative().optional(),
});

export async function recordAdjustmentAction(input: unknown): Promise<ActionResult> {
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  try {
    const txn = await recordAdjustment({
      notes: parsed.data.notes,
      date: toDate(parsed.data.date),
      source: parsed.data.source,
      showId: parsed.data.showId,
      assetId: parsed.data.assetId,
      quantityDelta: parsed.data.quantityDelta,
      newMarketValueCents: parsed.data.newMarketValueCents,
      newCostBasisCents: parsed.data.newCostBasisCents,
    });
    revalidateAll();
    revalidatePath(`/inventory/${parsed.data.assetId}`);
    return { ok: true, id: txn.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to adjust" };
  }
}

// ── Collectr sync backlog actions ────────────────────────────────────────────

/** Asset sync-state written when the user manually marks a task done. We only
 *  know the change was (reportedly) made in Collectr — not what values were
 *  entered — so cost/quantity are recorded as UNKNOWN (null). The next import
 *  records Collectr's actual values and nags then if something's off
 *  ("trust, but verify on re-import"). */
function manualDoneAssetData(kind: string) {
  return kind === "remove"
    ? { inCollectr: false, collectrCostCents: null, collectrQuantity: null }
    : { inCollectr: true, collectrCostCents: null, collectrQuantity: null };
}

/** Mark a backlog task done and update the asset's sync state so it won't
 *  immediately reappear. Atomic, and a no-op if an import already resolved it. */
export async function markSyncTaskDone(taskId: string): Promise<ActionResult> {
  try {
    await prisma.$transaction(async (tx) => {
      // Guard on pending INSIDE the transaction: a stale tab clicking Done on
      // a task an import already resolved must not clobber the asset's
      // freshly-imported Collectr state.
      const task = await tx.syncTask.findFirst({ where: { id: taskId, status: "pending" } });
      if (!task) return;
      await tx.asset.update({ where: { id: task.assetId }, data: manualDoneAssetData(task.kind) });
      await tx.syncTask.update({
        where: { id: taskId },
        data: { status: "done", resolvedAt: new Date() },
      });
    });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update task" };
  }
}

/** Mark every pending backlog task done (bulk "I've synced everything").
 *  Atomic, and scoped to the exact tasks read — a task created concurrently
 *  is left pending rather than silently swallowed. */
export async function markAllSyncTasksDone(): Promise<ActionResult> {
  try {
    await prisma.$transaction(async (tx) => {
      const tasks = await tx.syncTask.findMany({
        where: { status: "pending" },
        select: { id: true, kind: true, assetId: true },
      });
      for (const t of tasks) {
        await tx.asset.update({ where: { id: t.assetId }, data: manualDoneAssetData(t.kind) });
      }
      await tx.syncTask.updateMany({
        where: { id: { in: tasks.map((t) => t.id) } },
        data: { status: "done", resolvedAt: new Date() },
      });
    });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update tasks" };
  }
}

/** Delete an entire transaction. Note: this removes the ledger record but does
 *  NOT auto-reverse asset quantities — use an Adjustment to correct stock.
 *  Also unlinks any attached photo files so public/uploads doesn't accumulate
 *  orphans. */
export async function deleteTransaction(id: string): Promise<ActionResult> {
  // Grading transactions are welded to their submission record (basis change,
  // grade, cert). Deleting one would strand the submission and misstate basis.
  const grading = await prisma.gradingSubmission.findFirst({
    where: { OR: [{ submitTransactionId: id }, { returnTransactionId: id }] },
  });
  if (grading) {
    return {
      ok: false,
      error:
        "This transaction belongs to a grading submission and can't be deleted. Correct the asset with an Adjustment instead.",
    };
  }
  const attachments = await prisma.attachment.findMany({
    where: { transactionId: id },
    select: { path: true },
  });
  await prisma.transaction.delete({ where: { id } });

  // Best-effort file cleanup — Blob URLs via the Blob API, local files from
  // the uploads directory only.
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  for (const a of attachments) {
    try {
      if (a.path.startsWith("https://")) {
        const { del } = await import("@vercel/blob");
        await del(a.path);
      } else if (/^\/uploads\/[A-Za-z0-9._-]+$/.test(a.path)) {
        const target = path.join(uploadsDir, path.basename(a.path));
        if (target.startsWith(uploadsDir)) await unlink(target);
      }
    } catch {
      // ignore missing files / blob API hiccups
    }
  }

  revalidateAll();
  redirect("/transactions");
}

// ── Grading (v0.2) ───────────────────────────────────────────────────────────

const gradingSubmitSchema = z.object({
  assetId: z.string().min(1),
  company: z.string().min(1),
  serviceLevel: z.string().nullish(),
  date: z.string().nullish(),
  expectedReturnAt: z.string().nullish(),
  shippingCents: z.number().int().nonnegative(),
  insuranceCents: z.number().int().nonnegative(),
  feeCents: z.number().int().nonnegative(),
  notes: z.string().nullish(),
});

export async function recordGradingSubmitAction(input: unknown): Promise<ActionResult> {
  const parsed = gradingSubmitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  try {
    const txn = await recordGradingSubmit({
      assetId: parsed.data.assetId,
      company: parsed.data.company,
      serviceLevel: parsed.data.serviceLevel,
      date: toDate(parsed.data.date),
      expectedReturnAt: toDate(parsed.data.expectedReturnAt) ?? null,
      shippingCents: parsed.data.shippingCents,
      insuranceCents: parsed.data.insuranceCents,
      feeCents: parsed.data.feeCents,
      notes: parsed.data.notes,
    });
    revalidateAll();
    revalidatePath(`/inventory/${parsed.data.assetId}`);
    return { ok: true, id: txn.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to record submission" };
  }
}

const gradingReturnSchema = z.object({
  submissionId: z.string().min(1),
  grade: z.string().min(1),
  certNumber: z.string().nullish(),
  date: z.string().nullish(),
  newMarketValueCents: z.number().int().nonnegative().nullish(),
  notes: z.string().nullish(),
});

export async function recordGradingReturnAction(input: unknown): Promise<ActionResult> {
  const parsed = gradingReturnSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  try {
    const txn = await recordGradingReturn({
      submissionId: parsed.data.submissionId,
      grade: parsed.data.grade,
      certNumber: parsed.data.certNumber,
      date: toDate(parsed.data.date),
      newMarketValueCents: parsed.data.newMarketValueCents ?? null,
      notes: parsed.data.notes,
    });
    revalidateAll();
    return { ok: true, id: txn.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to record return" };
  }
}

// ── Bricks (v0.2) ────────────────────────────────────────────────────────────

// ── Catch-up backlog (reconcile) ────────────────────────────────────────────

const reconcileSoldSchema = z.object({
  quantity: z.number().int().positive(),
  proceedsCents: z.number().int().positive("Enter what it sold for — use the Prize flow for giveaways"),
  // Catch-up sales are post-hoc: the show select is authoritative. Empty means
  // EXPLICITLY no show ("none" skips the active Show Mode fallback).
  showId: z
    .string()
    .nullish()
    .transform((v) => (v?.trim() ? v : "none")),
  date: z.string().nullish(),
});

/** "Sold it" — post the missing sale; auto-resolution closes the task. */
export async function resolveReconcileSold(taskId: string, input: unknown): Promise<ActionResult> {
  const parsed = reconcileSoldSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  try {
    const task = await prisma.reconcileTask.findFirst({
      where: { id: taskId, status: "pending" },
      include: { asset: true },
    });
    if (!task) return { ok: false, error: "Task not found (already resolved?)" };
    if (parsed.data.quantity > task.asset.quantity) {
      return { ok: false, error: `Only ${task.asset.quantity} in stock.` };
    }
    // For qty-drop tasks the catch-up sale can't exceed the detected gap — a
    // stale form (or a buy since detection) shouldn't inflate the sale.
    if (task.kind === "qty-drop") {
      const gap = Math.max(
        0,
        Math.min(task.appQty, task.asset.quantity) - (task.collectrQtyAfter ?? 0),
      );
      if (gap === 0) {
        return { ok: false, error: "This gap is already closed — refresh the page." };
      }
      if (parsed.data.quantity > gap) {
        return {
          ok: false,
          error: `Collectr is only ${gap} short — record a larger sale from the Sell page.`,
        };
      }
    }
    const unitProceeds = Math.round(parsed.data.proceedsCents / parsed.data.quantity);
    await recordSale({
      date: toDate(parsed.data.date),
      notes: "Catch-up sale (recorded from Collectr reconcile)",
      showId: parsed.data.showId,
      proceedsCents: parsed.data.proceedsCents,
      given: [
        { assetId: task.assetId, quantity: parsed.data.quantity, unitValueCents: unitProceeds },
      ],
    });
    // If the sale didn't fully close the gap (partial), the task stays pending —
    // mark the sold portion in the note so the list stays readable.
    revalidateAll();
    revalidatePath("/reconcile");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to record sale" };
  }
}

/** "Still have it" — Collectr is behind, not the ledger. The add-to-Collectr
 *  task on the sync backlog stays. */
export async function resolveReconcileStillHave(taskId: string): Promise<ActionResult> {
  try {
    const updated = await prisma.reconcileTask.updateMany({
      where: { id: taskId, status: "pending" },
      data: { status: "dismissed", resolution: "still-have", resolvedAt: new Date() },
    });
    if (updated.count === 0) return { ok: false, error: "Task not found (already resolved?)" };
    revalidateAll();
    revalidatePath("/reconcile");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update task" };
  }
}

/** "Same as…" — this asset and an imported row are the same physical item
 *  under two names (e.g. "Destined Rivals Pack" vs "…Booster Pack"). Keeps the
 *  ledger row (papertrail + real basis), adopts the imported row's identity and
 *  Collectr state, and deletes the duplicate. */
export async function resolveReconcileMerge(
  taskId: string,
  targetAssetId: string,
): Promise<ActionResult> {
  try {
    await prisma.$transaction(async (tx) => {
      const task = await tx.reconcileTask.findFirst({
        where: { id: taskId, status: "pending" },
        include: { asset: true },
      });
      if (!task) throw new Error("Task not found (already resolved?)");
      const source = task.asset;
      const target = await tx.asset.findUnique({ where: { id: targetAssetId } });
      if (!target) throw new Error("Selected match no longer exists.");
      if (target.id === source.id) throw new Error("Pick the imported duplicate, not the card itself.");
      if (source.status === "Grading" || target.status === "Grading") {
        throw new Error("Can't merge while a grading submission is out.");
      }
      if (target.game !== source.game) {
        throw new Error("Those are from different games — not the same card.");
      }
      // The target must be a PURE imported duplicate. Merging a row with its
      // own ledger history would silently destroy its quantity and basis.
      const targetLines = await tx.transactionLine.count({ where: { assetId: target.id } });
      if (target.ledgerTouched || targetLines > 0) {
        throw new Error(
          `"${target.name}" has its own transaction history — it isn't an imported duplicate. ` +
            `If they're genuinely the same card, record the difference with an Adjustment instead.`,
        );
      }

      // Move any history the duplicate accumulated onto the surviving row.
      await tx.gradingSubmission.updateMany({
        where: { assetId: target.id },
        data: { assetId: source.id },
      });

      // Delete the duplicate first (frees its unique naturalKey)…
      await tx.asset.delete({ where: { id: target.id } });

      // …then the survivor adopts the imported identity + Collectr state while
      // keeping its own quantity, basis, papertrail, and aging clock.
      await tx.asset.update({
        where: { id: source.id },
        data: {
          name: target.name,
          game: target.game,
          assetType: target.assetType,
          set: target.set,
          cardNumber: target.cardNumber,
          rarity: target.rarity,
          variant: target.variant,
          grade: target.grade,
          condition: target.condition,
          portfolio: target.portfolio,
          collectrDateAdded: target.collectrDateAdded,
          marketValueCents: target.marketValueCents,
          priceOverrideCents: target.priceOverrideCents,
          marketPriceAsOf: target.marketPriceAsOf,
          naturalKey: target.naturalKey,
          // The duplicate row's Collectr link may itself be gone (e.g. packs
          // cleared from Collectr) — adopt its true state, not a blanket true.
          inCollectr: target.inCollectr,
          collectrCostCents: target.collectrCostCents,
          collectrQuantity: target.collectrQuantity,
          ledgerTouched: true,
        },
      });

      await tx.reconcileTask.update({
        where: { id: task.id },
        data: { status: "resolved", resolution: "merged", resolvedAt: new Date() },
      });

      // Whatever gap remains after the merge stays on the backlog: Collectr
      // count below ledger count → "sold some?"; not in Collectr at all →
      // still a vanished card to account for.
      const merged = await tx.asset.findUniqueOrThrow({ where: { id: source.id } });
      if (!merged.inCollectr) {
        await upsertReconcileTask(tx, merged, "vanished", null, 0);
      } else if (merged.collectrQuantity != null && merged.collectrQuantity < merged.quantity) {
        await upsertReconcileTask(tx, merged, "qty-drop", null, merged.collectrQuantity);
      }

      await reconcileAssetSync(tx, source.id);
    });
    revalidateAll();
    revalidatePath("/reconcile");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Merge failed" };
  }
}

/** Manual brick flag. The app suggests (90+ days held) but never auto-marks. */
export async function setBrickStatus(assetId: string, isBrick: boolean): Promise<ActionResult> {
  try {
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) return { ok: false, error: "Asset not found" };
    const owned =
      (asset.status === "InStock" || asset.status === "Grading") && asset.quantity > 0;
    if (isBrick && !owned) {
      return { ok: false, error: "Only in-stock inventory can be flagged as a brick." };
    }
    await prisma.asset.update({ where: { id: assetId }, data: { isBrick } });
    revalidateAll();
    revalidatePath(`/inventory/${assetId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update brick status" };
  }
}

// ── Shows + Show Mode (v0.2) ─────────────────────────────────────────────────

const showSchema = z.object({
  name: z.string().min(1, "Show name is required"),
  venue: z.string().nullish(),
  city: z.string().nullish(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().nullish(),
  status: z.enum(["Upcoming", "Active", "Completed", "Cancelled"]).optional(),
  tableFeeCents: z.number().int().nonnegative().default(0),
  hotelCents: z.number().int().nonnegative().default(0),
  travelCents: z.number().int().nonnegative().default(0),
  foodCents: z.number().int().nonnegative().default(0),
  otherCents: z.number().int().nonnegative().default(0),
  notes: z.string().nullish(),
});

export async function createShow(input: unknown): Promise<ActionResult> {
  const parsed = showSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  const d = parsed.data;
  const startDate = toDate(d.startDate);
  if (!startDate) return { ok: false, error: "Invalid start date" };
  const endDate = toDate(d.endDate) ?? null;
  if (endDate && endDate < startDate) {
    return { ok: false, error: "End date can't be before the start date." };
  }
  try {
    const show = await prisma.show.create({
      data: {
        name: d.name,
        venue: d.venue ?? null,
        city: d.city ?? null,
        startDate,
        endDate,
        status: d.status ?? "Upcoming",
        tableFeeCents: d.tableFeeCents,
        hotelCents: d.hotelCents,
        travelCents: d.travelCents,
        foodCents: d.foodCents,
        otherCents: d.otherCents,
        notes: d.notes ?? null,
      },
    });
    revalidatePath("/shows");
    return { ok: true, id: show.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create show" };
  }
}

export async function updateShow(id: string, input: unknown): Promise<ActionResult> {
  const parsed = showSchema.partial().safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  const d = parsed.data;

  const current = await prisma.show.findUnique({ where: { id } });
  if (!current) return { ok: false, error: "Show not found" };

  // Validate dates against the merged (incoming + stored) values.
  const startDate = d.startDate !== undefined ? toDate(d.startDate) : current.startDate;
  if (d.startDate !== undefined && !startDate) {
    return { ok: false, error: "Invalid start date" };
  }
  const endDate = d.endDate !== undefined ? (toDate(d.endDate) ?? null) : current.endDate;
  if (startDate && endDate && endDate < startDate) {
    return { ok: false, error: "End date can't be before the start date." };
  }

  // Status transitions in/out of Active belong to enter/end Show Mode only.
  if (d.status !== undefined && d.status !== current.status) {
    const state = await prisma.appState.findUnique({ where: { id: 1 } });
    if (state?.activeShowId === id) {
      return { ok: false, error: "Show Mode is running for this show — end it before changing status." };
    }
    if (d.status === "Active") {
      return { ok: false, error: 'Use "Enter Show Mode" to make a show active.' };
    }
  }

  try {
    await prisma.show.update({
      where: { id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.venue !== undefined ? { venue: d.venue ?? null } : {}),
        ...(d.city !== undefined ? { city: d.city ?? null } : {}),
        ...(d.startDate !== undefined ? { startDate } : {}),
        ...(d.endDate !== undefined ? { endDate } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...(d.tableFeeCents !== undefined ? { tableFeeCents: d.tableFeeCents } : {}),
        ...(d.hotelCents !== undefined ? { hotelCents: d.hotelCents } : {}),
        ...(d.travelCents !== undefined ? { travelCents: d.travelCents } : {}),
        ...(d.foodCents !== undefined ? { foodCents: d.foodCents } : {}),
        ...(d.otherCents !== undefined ? { otherCents: d.otherCents } : {}),
        ...(d.notes !== undefined ? { notes: d.notes ?? null } : {}),
      },
    });
    revalidatePath("/shows");
    revalidatePath(`/shows/${id}`);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update show" };
  }
}

export async function deleteShow(id: string): Promise<ActionResult> {
  try {
    const txnCount = await prisma.transaction.count({ where: { showId: id } });
    if (txnCount > 0) {
      return {
        ok: false,
        error: "This show has transactions attached. Cancel it instead of deleting.",
      };
    }
    const state = await prisma.appState.findUnique({ where: { id: 1 } });
    if (state?.activeShowId === id) {
      return { ok: false, error: "Show Mode is active for this show. End it first." };
    }
    await prisma.show.delete({ where: { id } });
    revalidatePath("/shows");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete show" };
  }
}

const enterShowModeSchema = z.object({
  showId: z.string().min(1),
  buyingCashCents: z.number().int().nonnegative(),
  personalCashCents: z.number().int().nonnegative(),
});

export async function enterShowModeAction(input: unknown): Promise<ActionResult> {
  const parsed = enterShowModeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  try {
    const id = await enterShowMode(parsed.data);
    revalidateAll();
    revalidatePath("/shows");
    revalidatePath(`/shows/${id}`);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to enter Show Mode" };
  }
}

export async function endShowModeAction(input: unknown): Promise<ActionResult> {
  const parsed = z
    .object({ endingCashCents: z.number().int().nonnegative().nullish() })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  try {
    const id = await endShowMode({ endingCashCents: parsed.data.endingCashCents ?? null });
    revalidateAll();
    revalidatePath("/shows");
    revalidatePath(`/shows/${id}`);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to end Show Mode" };
  }
}
