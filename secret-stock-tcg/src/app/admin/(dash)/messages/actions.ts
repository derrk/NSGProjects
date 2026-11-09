"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { isAdminAuthed } from "@/lib/auth";
import { MESSAGE_STATUSES, type MessageStatus } from "@/lib/validators";

async function assertAdmin() {
  if (!(await isAdminAuthed())) throw new Error("Unauthorized");
}

function revalidate() {
  revalidatePath("/admin");
  revalidatePath("/admin/messages");
}

export async function setMessageStatus(id: string, status: string) {
  await assertAdmin();
  if (!MESSAGE_STATUSES.includes(status as MessageStatus)) {
    throw new Error("Unknown status");
  }
  await prisma.contactMessage.update({ where: { id }, data: { status } });
  revalidate();
}

export async function setMessageNote(id: string, note: string) {
  await assertAdmin();
  const trimmed = note.trim();
  await prisma.contactMessage.update({
    where: { id },
    data: { internalNote: trimmed ? trimmed.slice(0, 5000) : null },
  });
  revalidate();
}

export async function deleteMessage(id: string) {
  await assertAdmin();
  await prisma.contactMessage.delete({ where: { id } });
  revalidate();
}
