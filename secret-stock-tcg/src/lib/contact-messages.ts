import { prisma } from "@/lib/db";
import type { MessageStatus } from "@/lib/validators";

// Reads for the Messages queue. Writes go through the admin action.

// Unanswered first, then most recent. Same reasoning as the offers queue:
// status is free text, so ordering by it in SQL would sort alphabetically
// ("archived" before "new") and put the wrong end of the queue on top.
const STATUS_RANK: Record<string, number> = {
  new: 0,
  replied: 1,
  archived: 2,
};

export async function getContactMessages() {
  const messages = await prisma.contactMessage.findMany({
    orderBy: { createdAt: "desc" },
  });
  return messages.sort(
    (a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9),
  );
}

/** How many messages still need a reply — the badge in the nav. */
export async function countNewMessages(): Promise<number> {
  return prisma.contactMessage.count({ where: { status: "new" } });
}

export const MESSAGE_STATUS_LABEL: Record<MessageStatus, string> = {
  new: "New",
  replied: "Replied",
  archived: "Archived",
};

export const MESSAGE_STATUS_CLASS: Record<MessageStatus, string> = {
  new: "bg-primary/15 text-primary ring-1 ring-primary/30",
  replied: "bg-success/15 text-success ring-1 ring-success/30",
  archived: "bg-muted text-muted-foreground ring-1 ring-border",
};
