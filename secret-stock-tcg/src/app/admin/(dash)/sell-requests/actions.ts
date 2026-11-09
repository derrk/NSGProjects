"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { isAdminAuthed } from "@/lib/auth";
import { OFFER_STATUSES, type OfferStatus } from "@/lib/validators";

async function assertAdmin() {
  if (!(await isAdminAuthed())) throw new Error("Unauthorized");
}

function revalidate() {
  revalidatePath("/admin");
  revalidatePath("/admin/sell-requests");
}

export async function setOfferStatus(id: string, status: string) {
  await assertAdmin();
  if (!OFFER_STATUSES.includes(status as OfferStatus)) {
    throw new Error("Unknown status");
  }
  await prisma.collectionOffer.update({ where: { id }, data: { status } });
  revalidate();
}

export async function setInternalNote(id: string, note: string) {
  await assertAdmin();
  const trimmed = note.trim();
  await prisma.collectionOffer.update({
    where: { id },
    data: { internalNote: trimmed ? trimmed.slice(0, 5000) : null },
  });
  revalidate();
}

export async function setAppointment(id: string, when: string) {
  await assertAdmin();
  // An empty string clears the appointment; anything else must parse.
  let appointmentAt: Date | null = null;
  if (when.trim()) {
    const parsed = new Date(when);
    if (Number.isNaN(parsed.getTime())) throw new Error("Invalid date");
    appointmentAt = parsed;
  }
  await prisma.collectionOffer.update({
    where: { id },
    // Booking a time means they've been reached, so move the status along
    // rather than leaving a scheduled visit sitting in the "new" pile.
    data: {
      appointmentAt,
      ...(appointmentAt ? { status: "scheduled" } : {}),
    },
  });
  revalidate();
}

export async function deleteOffer(id: string) {
  await assertAdmin();
  await prisma.collectionOffer.delete({ where: { id } });
  revalidate();
}
