"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Mail, Phone, Tag, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MESSAGE_STATUSES } from "@/lib/validators";
import { MESSAGE_STATUS_CLASS, MESSAGE_STATUS_LABEL } from "@/lib/contact-messages";
import {
  deleteMessage,
  setMessageNote,
  setMessageStatus,
} from "@/app/admin/(dash)/messages/actions";

export type MessageRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  interestedItem: string | null;
  message: string;
  status: string;
  internalNote: string | null;
  createdAt: string;
};

function when(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function MessageCard({ row }: { row: MessageRow }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(row.status === "new");
  const [note, setNote] = React.useState(row.internalNote ?? "");
  const [saved, setSaved] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  const statusKey = row.status as keyof typeof MESSAGE_STATUS_LABEL;

  // Replying is the whole job here, so the mailto is pre-filled and marking it
  // replied happens on the same click — one action, not two.
  const replyHref = `mailto:${row.email}?subject=${encodeURIComponent(
    row.interestedItem ? `Re: ${row.interestedItem}` : "Re: your message to Secret Stock TX",
  )}`;

  return (
    <div
      id={row.id}
      className={cn(
        "rounded-lg border border-border bg-card transition-opacity",
        pending && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-start gap-3 p-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{row.name}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  MESSAGE_STATUS_CLASS[statusKey] ?? MESSAGE_STATUS_CLASS.archived,
                )}
              >
                {MESSAGE_STATUS_LABEL[statusKey] ?? row.status}
              </span>
              {row.interestedItem && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Tag className="size-3" />
                  {row.interestedItem}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Mail className="size-3" />
                {row.email}
              </span>
              {row.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="size-3" />
                  {row.phone}
                </span>
              )}
              <span>{when(row.createdAt)}</span>
            </div>
            {!open && (
              <p className="mt-1.5 truncate text-sm text-muted-foreground">{row.message}</p>
            )}
          </div>
        </button>

        <Select
          value={row.status}
          disabled={pending}
          onChange={(e) => run(() => setMessageStatus(row.id, e.target.value))}
          className="h-8 w-[130px]"
          aria-label="Status"
        >
          {MESSAGE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {MESSAGE_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>

      {open && (
        <div className="space-y-4 border-t border-border px-4 py-4 text-sm">
          <p className="whitespace-pre-wrap text-muted-foreground">{row.message}</p>

          <div className="flex flex-wrap items-center gap-2">
            <a href={replyHref} onClick={() => run(() => setMessageStatus(row.id, "replied"))}>
              <Button size="sm" disabled={pending}>
                <Mail /> Reply
              </Button>
            </a>
            {row.phone && (
              <a href={`tel:${row.phone}`}>
                <Button size="sm" variant="secondary">
                  <Phone /> Call
                </Button>
              </a>
            )}
          </div>

          <div>
            <label
              htmlFor={`note-${row.id}`}
              className="mb-1.5 block text-xs font-medium text-muted-foreground"
            >
              Private note (the sender never sees this)
            </label>
            <Textarea
              id={`note-${row.id}`}
              rows={2}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setSaved(false);
              }}
              placeholder="Quoted $80 shipped, waiting to hear back…"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    await setMessageNote(row.id, note);
                    setSaved(true);
                  })
                }
              >
                Save note
              </Button>
              {saved && <span className="text-xs text-success">Saved</span>}
            </div>
          </div>

          <div className="flex justify-end border-t border-border pt-3">
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (!confirm(`Delete the message from ${row.name}? This can't be undone.`)) return;
                run(() => deleteMessage(row.id));
              }}
            >
              <Trash2 /> Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function MessagesList({ rows }: { rows: MessageRow[] }) {
  const [filter, setFilter] = React.useState("open");
  const [query, setQuery] = React.useState("");

  const visible = rows.filter((r) => {
    if (filter === "open" && r.status === "archived") return false;
    if (filter !== "open" && filter !== "all" && r.status !== filter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return [r.name, r.email, r.phone ?? "", r.interestedItem ?? "", r.message]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, item, message…"
          className="h-9 max-w-xs"
        />
        <Select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-9 w-[150px]"
          aria-label="Filter by status"
        >
          <option value="open">Open</option>
          <option value="all">All</option>
          {MESSAGE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {MESSAGE_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">
          {visible.length} of {rows.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-muted-foreground">
            {rows.length === 0
              ? "No messages yet. They'll land here the moment someone uses the contact form."
              : "Nothing matches that filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <MessageCard key={r.id} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}
