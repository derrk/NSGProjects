"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { recordSaleTx } from "@/lib/ledger";

type Result = { ok: true; id?: string; message?: string } | { ok: false; error: string };

function toLocalDate(s: string | null | undefined): Date | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? undefined : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

function revalidate(id?: string) {
  revalidatePath("/lots");
  if (id) revalidatePath(`/lots/${id}`);
  revalidatePath("/");
}

const createSchema = z.object({
  name: z.string().min(1, "Give the lot a name."),
  source: z.string().default("Whatnot"),
});

export async function createLot(input: unknown): Promise<Result> {
  const p = createSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid" };
  try {
    const lot = await prisma.saleLot.create({ data: { name: p.data.name.trim(), source: p.data.source } });
    revalidate(lot.id);
    return { ok: true, id: lot.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't create the lot." };
  }
}

const addItemSchema = z.object({
  lotId: z.string().min(1),
  assetId: z.string().min(1),
  quantity: z.number().int().positive().default(1),
});

export async function addLotItem(input: unknown): Promise<Result> {
  const p = addItemSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid" };
  try {
    const lot = await prisma.saleLot.findUnique({ where: { id: p.data.lotId }, select: { status: true } });
    if (!lot) return { ok: false, error: "Lot not found." };
    if (lot.status !== "Open") return { ok: false, error: "This lot is already settled." };
    const asset = await prisma.asset.findUnique({ where: { id: p.data.assetId }, select: { quantity: true, status: true } });
    if (!asset) return { ok: false, error: "Card not found." };
    // Merge if the asset is already in the lot.
    const existing = await prisma.saleLotItem.findFirst({ where: { saleLotId: p.data.lotId, assetId: p.data.assetId } });
    if (existing) {
      await prisma.saleLotItem.update({ where: { id: existing.id }, data: { quantity: existing.quantity + p.data.quantity } });
    } else {
      await prisma.saleLotItem.create({ data: { saleLotId: p.data.lotId, assetId: p.data.assetId, quantity: p.data.quantity } });
    }
    revalidate(p.data.lotId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't add the card." };
  }
}

export async function removeLotItem(itemId: string): Promise<Result> {
  try {
    const item = await prisma.saleLotItem.findUnique({ where: { id: itemId }, select: { saleLotId: true, lot: { select: { status: true } } } });
    if (!item) return { ok: true };
    if (item.lot.status !== "Open") return { ok: false, error: "This lot is already settled." };
    await prisma.saleLotItem.delete({ where: { id: itemId } });
    revalidate(item.saleLotId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't remove the card." };
  }
}

const settleSchema = z.object({
  lotId: z.string().min(1),
  grossCents: z.number().int().nonnegative(),
  netCents: z.number().int().nonnegative(),
  date: z.string().optional(),
  buyer: z.string().optional(),
  notes: z.string().optional(),
});

export async function settleLot(input: unknown): Promise<Result> {
  const p = settleSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid" };
  try {
    // The claim, the SALE, and the finalize all run in ONE transaction so a
    // sale can never be posted for a lot that isn't marked Sold, and two
    // concurrent settles can't both post (the atomic claim lets only one win).
    const txnId = await prisma.$transaction(async (tx) => {
      const lot = await tx.saleLot.findUnique({
        where: { id: p.data.lotId },
        include: { items: { include: { asset: { select: { marketValueCents: true, priceOverrideCents: true, costBasisCents: true } } } } },
      });
      if (!lot) throw new Error("Lot not found.");
      if (lot.status !== "Open") throw new Error("This lot is already settled.");
      if (lot.items.length === 0) throw new Error("Add some cards before settling.");

      // Atomic single-settle guard: only the request that flips Open→Sold proceeds.
      const claimed = await tx.saleLot.updateMany({ where: { id: lot.id, status: "Open" }, data: { status: "Sold" } });
      if (claimed.count === 0) throw new Error("This lot is already settled.");

      // Snapshot the combined basis now (= the COGS the SALE will post) so the
      // lot's profit is frozen even if a card is re-acquired later.
      const totalBasisCents = lot.items.reduce((s, it) => s + it.asset.costBasisCents * it.quantity, 0);
      const given = lot.items.map((it) => ({
        assetId: it.assetId,
        quantity: it.quantity,
        unitValueCents: it.asset.priceOverrideCents ?? it.asset.marketValueCents,
      }));

      // One SALE for the whole lot; proceeds = the net payout you actually received.
      // If a card isn't in stock anymore this throws and the whole tx (incl. the
      // claim) rolls back — the lot goes back to Open, no orphaned sale.
      const txn = await recordSaleTx(tx, {
        proceedsCents: p.data.netCents,
        given,
        source: lot.source,
        date: toLocalDate(p.data.date),
        counterparty: p.data.buyer || null,
        notes: `Lot: ${lot.name}${p.data.grossCents !== p.data.netCents ? ` — gross ${(p.data.grossCents / 100).toFixed(2)}, net ${(p.data.netCents / 100).toFixed(2)}` : ""}${p.data.notes ? ` · ${p.data.notes}` : ""}`,
      });

      await tx.saleLot.update({
        where: { id: lot.id },
        data: {
          grossCents: p.data.grossCents,
          netCents: p.data.netCents,
          totalBasisCents,
          soldAt: toLocalDate(p.data.date) ?? new Date(),
          saleTransactionId: txn.id,
        },
      });
      return txn.id;
    });
    revalidate(p.data.lotId);
    return { ok: true, id: txnId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't settle the lot." };
  }
}

export async function cancelLot(id: string): Promise<Result> {
  try {
    const lot = await prisma.saleLot.findUnique({ where: { id }, select: { status: true } });
    if (!lot) return { ok: true };
    if (lot.status === "Sold") return { ok: false, error: "A settled lot can't be cancelled — reverse the sale instead." };
    await prisma.saleLot.update({ where: { id }, data: { status: "Cancelled" } });
    revalidate(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't cancel." };
  }
}

export async function deleteLot(id: string): Promise<Result> {
  try {
    const lot = await prisma.saleLot.findUnique({ where: { id }, select: { status: true } });
    if (!lot) return { ok: true };
    if (lot.status === "Sold") return { ok: false, error: "A settled lot can't be deleted (it posted a sale)." };
    await prisma.saleLot.delete({ where: { id } });
    revalidatePath("/lots");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't delete." };
  }
}
