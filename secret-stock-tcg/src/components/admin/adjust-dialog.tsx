"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { recordAdjustment } from "@/app/admin/(dash)/inventory/actions";

const REASONS = [
  { value: "RESTOCK", label: "Restock (received)" },
  { value: "IN_STORE_SALE", label: "In-store sale" },
  { value: "CARD_SHOW_SALE", label: "Card show sale" },
  { value: "RETURN", label: "Customer return" },
  { value: "DAMAGE", label: "Damaged" },
  { value: "LOSS", label: "Lost / shrinkage" },
  { value: "TRADE", label: "Trade" },
  { value: "COLLECTION_PURCHASE", label: "Collection purchase" },
  { value: "MANUAL_ADJUSTMENT", label: "Correction / other" },
];

const CHANNELS = [
  { value: "", label: "—" },
  { value: "IN_STORE", label: "In store" },
  { value: "CARD_SHOW", label: "Card show" },
  { value: "ONLINE", label: "Online" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "WHATNOT", label: "Whatnot" },
  { value: "OTHER", label: "Other" },
];

const SALE_REASONS = new Set(["IN_STORE_SALE", "CARD_SHOW_SALE"]);
type Mode = "add" | "remove" | "set";

export function AdjustDialog({
  row,
  onClose,
}: {
  row: { id: string; name: string; quantity: number };
  onClose: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>("remove");
  const [quantity, setQuantity] = React.useState(1);
  const [reason, setReason] = React.useState("IN_STORE_SALE");
  const [channel, setChannel] = React.useState("IN_STORE");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function onModeChange(m: Mode) {
    setMode(m);
    // Sensible default reason per mode.
    setReason(m === "add" ? "RESTOCK" : m === "set" ? "MANUAL_ADJUSTMENT" : "IN_STORE_SALE");
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await recordAdjustment(row.id, {
        mode,
        quantity,
        reason,
        channel: SALE_REASONS.has(reason) ? channel : undefined,
        note,
      });
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Adjust stock</h2>
            <p className="truncate text-xs text-muted-foreground">
              {row.name} · {row.quantity} on hand
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid grid-cols-3 gap-2">
            {(["add", "remove", "set"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onModeChange(m)}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm font-medium capitalize transition-colors",
                  mode === m ? "border-primary bg-primary/15 text-primary" : "border-input hover:bg-accent",
                )}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adj-qty">{mode === "set" ? "Set quantity to" : "Quantity"}</Label>
            <Input
              id="adj-qty"
              type="number"
              min={0}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adj-reason">Reason</Label>
            <Select id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>

          {SALE_REASONS.has(reason) && (
            <div className="space-y-1.5">
              <Label htmlFor="adj-channel">Sales channel</Label>
              <Select id="adj-channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
                {CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="adj-note">Note (optional)</Label>
            <Input
              id="adj-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Sold at Dallas Card Show"
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-4">
          <Button variant="ghost" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending} type="button">
            {pending ? "Saving…" : "Apply"}
          </Button>
        </div>
      </div>
    </div>
  );
}
