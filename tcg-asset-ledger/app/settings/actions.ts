"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Permanently deletes every asset, transaction, and related record — a full
 *  reset back to a blank ledger. Shows and the active Show Mode session are
 *  left untouched (this wipes inventory, not event/calendar data).
 *
 *  Re-checks the login password even though the caller is already
 *  authenticated — a deliberate step-up confirmation for an action this
 *  destructive and irreversible. */
export async function wipeInventory(password: string): Promise<ActionResult> {
  const required = process.env.ADMIN_PASSWORD;
  if (required && password !== required) {
    return { ok: false, error: "Wrong password." };
  }

  await prisma.$transaction([
    prisma.transactionLine.deleteMany(),
    prisma.attachment.deleteMany(),
    prisma.syncTask.deleteMany(),
    prisma.reconcileTask.deleteMany(),
    prisma.gradingSubmission.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.asset.deleteMany(),
    prisma.importBatch.deleteMany(),
  ]);

  revalidatePath("/", "layout");
  revalidatePath("/");
  revalidatePath("/inventory");
  revalidatePath("/transactions");
  revalidatePath("/reports");
  revalidatePath("/sync");
  revalidatePath("/reconcile");

  return { ok: true };
}
