"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  ChevronDown,
  ExternalLink,
  Mail,
  MessageSquare,
  Phone,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { OFFER_STATUSES } from "@/lib/validators";
import { STATUS_CLASS, STATUS_LABEL } from "@/lib/collection-offers";
import {
  deleteOffer,
  setAppointment,
  setInternalNote,
  setOfferStatus,
} from "@/app/admin/(dash)/sell-requests/actions";

export type OfferRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  preferredContact: string;
  categories: string[];
  description: string;
  itemCountEstimate: string | null;
  askingPrice: string | null;
  photosUrl: string | null;
  status: string;
  appointmentAt: string | null;
  internalNote: string | null;
  createdAt: string;
};

const CONTACT_ICON: Record<string, React.ElementType> = {
  email: Mail,
  phone: Phone,
  text: MessageSquare,
};

function when(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const stamp = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return stamp;
}

/** datetime-local wants "YYYY-MM-DDTHH:mm" in local time, not an ISO string. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function OfferCard({ row }: { row: OfferRow }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(row.status === "new");
  const [note, setNote] = React.useState(row.internalNote ?? "");
  const [appt, setAppt] = React.useState(toLocalInput(row.appointmentAt));
  const [pending, startTransition] = React.useTransition();
  const [saved, setSaved] = React.useState(false);

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  const ContactIcon = CONTACT_ICON[row.preferredContact] ?? Mail;
  const statusKey = row.status as keyof typeof STATUS_LABEL;

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
                  STATUS_CLASS[statusKey] ?? STATUS_CLASS.declined,
                )}
              >
                {STATUS_LABEL[statusKey] ?? row.status}
              </span>
              {row.appointmentAt && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <CalendarClock className="size-3" />
                  {new Date(row.appointmentAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <ContactIcon className="size-3" />
                prefers {row.preferredContact}
              </span>
              <span>{row.email}</span>
              {row.phone && <span>{row.phone}</span>}
              <span>{when(row.createdAt)}</span>
            </div>
            {row.categories.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {row.categories.map((c) => (
                  <Badge key={c} variant="secondary">
                    {c}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </button>

        <div className="flex items-center gap-2">
          {row.askingPrice && (
            <span className="text-sm font-medium tnum">{row.askingPrice}</span>
          )}
          <Select
            value={row.status}
            disabled={pending}
            onChange={(e) => run(() => setOfferStatus(row.id, e.target.value))}
            className="h-8 w-[130px]"
            aria-label="Status"
          >
            {OFFER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {open && (
        <div className="space-y-4 border-t border-border px-4 py-4 text-sm">
          {row.description ? (
            <p className="whitespace-pre-wrap text-muted-foreground">{row.description}</p>
          ) : (
            <p className="italic text-muted-foreground">No description given.</p>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            {row.itemCountEstimate && <span>Roughly: {row.itemCountEstimate}</span>}
            {row.photosUrl && (
              <a
                href={row.photosUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="size-3" />
                Photos
              </a>
            )}
            <a href={`mailto:${row.email}`} className="text-primary hover:underline">
              Email {row.name.split(" ")[0]}
            </a>
            {row.phone && (
              <a href={`tel:${row.phone}`} className="text-primary hover:underline">
                Call
              </a>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor={`appt-${row.id}`}
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                Appointment
              </label>
              <div className="flex gap-2">
                <Input
                  id={`appt-${row.id}`}
                  type="datetime-local"
                  value={appt}
                  onChange={(e) => setAppt(e.target.value)}
                  className="h-8"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => run(() => setAppointment(row.id, appt))}
                >
                  Set
                </Button>
              </div>
            </div>

            <div>
              <label
                htmlFor={`note-${row.id}`}
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                Private note (the seller never sees this)
              </label>
              <Textarea
                id={`note-${row.id}`}
                rows={2}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  setSaved(false);
                }}
                placeholder="Offered $300, wants to think about it…"
              />
              <div className="mt-1.5 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      await setInternalNote(row.id, note);
                      setSaved(true);
                    })
                  }
                >
                  Save note
                </Button>
                {saved && <span className="text-xs text-success">Saved</span>}
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t border-border pt-3">
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (!confirm(`Delete the request from ${row.name}? This can't be undone.`)) return;
                run(() => deleteOffer(row.id));
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

export function SellRequestsList({ rows }: { rows: OfferRow[] }) {
  const [filter, setFilter] = React.useState("open");
  const [query, setQuery] = React.useState("");

  const visible = rows.filter((r) => {
    if (filter === "open" && (r.status === "purchased" || r.status === "declined")) return false;
    if (filter !== "open" && filter !== "all" && r.status !== filter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return [r.name, r.email, r.phone ?? "", r.description, r.categories.join(" ")]
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
          placeholder="Search name, email, what they have…"
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
          {OFFER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
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
              ? "No sell requests yet. They'll land here the moment someone submits the form."
              : "Nothing matches that filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <OfferCard key={r.id} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}
