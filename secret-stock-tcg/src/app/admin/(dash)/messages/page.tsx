import { getContactMessages } from "@/lib/contact-messages";
import { MessagesList, type MessageRow } from "@/components/admin/messages-list";

export const metadata = { title: "Messages" };

export default async function MessagesPage() {
  const messages = await getContactMessages();

  const rows: MessageRow[] = messages.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    phone: m.phone,
    interestedItem: m.interestedItem,
    message: m.message,
    status: m.status,
    internalNote: m.internalNote,
    createdAt: m.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Messages</h1>
        <div className="purple-rule mt-2" />
        <p className="mt-2 text-sm text-muted-foreground">
          Questions from the contact form. Unanswered first.
        </p>
      </div>

      <MessagesList rows={rows} />
    </div>
  );
}
