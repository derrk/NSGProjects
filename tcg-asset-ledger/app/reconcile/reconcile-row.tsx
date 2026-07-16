"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Tag, Hand, Merge, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toCents, formatUSD } from "@/lib/money";
import {
  resolveReconcileSold,
  resolveReconcileStillHave,
  resolveReconcileMerge,
} from "@/app/actions";

interface TaskView {
  id: string;
  kind: string;
  appQty: number;
  collectrQtyBefore: number | null;
  collectrQtyAfter: number | null;
  neverSeenInCollectr: boolean;
  asset: {
    id: string;
    name: string;
    set: string | null;
    cardNumber: string | null;
    grade: string | null;
    quantity: number;
    marketUnitCents: number;
    costBasisCents: number;
  };
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ReconcileRow({
  task,
  shows,
  mergeCandidates,
  suggestedMergeId,
}: {
  task: TaskView;
  shows: { id: string; name: string }[];
  mergeCandidates: { id: string; label: string }[];
  suggestedMergeId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"none" | "sold" | "merge">("none");

  const a = task.asset;
  // Gap from the task's own snapshots (clamped to live stock) — never inflated
  // by buys made since detection.
  const missingQty =
    task.kind === "qty-drop"
      ? Math.max(0, Math.min(task.appQty, a.quantity) - (task.collectrQtyAfter ?? 0))
      : a.quantity;

  const [qty, setQty] = useState(Math.max(1, missingQty));
  const [proceeds, setProceeds] = useState(
    ((a.marketUnitCents * Math.max(1, missingQty)) / 100).toFixed(2),
  );
  const [proceedsTouched, setProceedsTouched] = useState(false);
  const [saleDate, setSaleDate] = useState(todayLocal());
  const [showId, setShowId] = useState(""); // default: NO show — post-hoc is explicit
  const [mergeTarget, setMergeTarget] = useState(""); // deliberate pick, never preselected

  const proceedsCents = toCents(proceeds);
  const gapClosed = missingQty === 0;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Failed");
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/inventory/${a.id}`} className="font-medium hover:underline">
                {a.name}
              </Link>
              {a.cardNumber ? (
                <span className="text-xs text-muted-foreground">#{a.cardNumber}</span>
              ) : null}
              {a.grade && a.grade !== "Ungraded" ? <Badge variant="outline">{a.grade}</Badge> : null}
              <Badge variant={task.kind === "vanished" ? "destructive" : "warning"}>
                {task.kind === "vanished"
                  ? task.neverSeenInCollectr
                    ? "not in Collectr"
                    : "gone from Collectr"
                  : `Collectr shows ${task.collectrQtyAfter} of ${task.appQty}`}
              </Badge>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {a.set ? `${a.set} · ` : ""}
              app qty {a.quantity} · market {formatUSD(a.marketUnitCents)}/u · basis{" "}
              {formatUSD(a.costBasisCents)}/u
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant={mode === "sold" ? "default" : "outline"}
              disabled={gapClosed}
              onClick={() => setMode(mode === "sold" ? "none" : "sold")}
            >
              <Tag /> Sold it
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => resolveReconcileStillHave(task.id))}
            >
              <Hand /> Still have it
            </Button>
            <Button
              size="sm"
              variant={mode === "merge" ? "default" : "outline"}
              onClick={() => setMode(mode === "merge" ? "none" : "merge")}
            >
              <Merge /> Same as…
            </Button>
          </div>
        </div>

        {mode === "sold" ? (
          <div className="flex flex-wrap items-end gap-3 rounded-md bg-muted/50 p-3">
            <div className="w-20">
              <Label className="mb-1 block text-xs">Qty sold</Label>
              <Input
                type="number"
                min={1}
                max={task.kind === "qty-drop" ? missingQty : a.quantity}
                value={qty}
                onChange={(e) => {
                  const q = Number(e.target.value);
                  setQty(q);
                  // Don't clobber a price the user typed themselves.
                  if (!proceedsTouched) {
                    setProceeds(((a.marketUnitCents * (q || 0)) / 100).toFixed(2));
                  }
                }}
              />
            </div>
            <div className="w-28">
              <Label className="mb-1 block text-xs">Total sold for ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={proceeds}
                onChange={(e) => {
                  setProceeds(e.target.value);
                  setProceedsTouched(true);
                }}
              />
            </div>
            <div className="w-36">
              <Label className="mb-1 block text-xs">Date sold</Label>
              <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
            </div>
            <div className="min-w-40">
              <Label className="mb-1 block text-xs">Show (optional)</Label>
              <Select value={showId} onChange={(e) => setShowId(e.target.value)}>
                <option value="">No show</option>
                {shows.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </div>
            <Button
              size="sm"
              disabled={pending || proceedsCents <= 0 || qty < 1}
              onClick={() =>
                run(() =>
                  resolveReconcileSold(task.id, {
                    quantity: qty,
                    proceedsCents,
                    showId: showId || null,
                    date: saleDate || null,
                  }),
                )
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : null} Record sale
            </Button>
            <p className="w-full text-xs text-muted-foreground">
              Profit will be proceeds − basis ({formatUSD(a.costBasisCents * qty)}).
              {proceedsCents <= 0 ? " Enter what it sold for — giveaways go through Prize." : ""}
            </p>
          </div>
        ) : null}

        {mode === "merge" ? (
          <div className="flex flex-wrap items-end gap-3 rounded-md bg-muted/50 p-3">
            {mergeCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No plausible duplicates found — merge targets must be imported rows (same game, no
                transaction history of their own).
              </p>
            ) : (
              <>
                <div className="min-w-64 flex-1">
                  <Label className="mb-1 block text-xs">
                    This is the same item as (imported from Collectr)…
                  </Label>
                  <Select value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)}>
                    <option value="">Pick the imported duplicate…</option>
                    {mergeCandidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                        {c.id === suggestedMergeId ? " — suggested" : ""}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  size="sm"
                  disabled={pending || !mergeTarget}
                  onClick={() => run(() => resolveReconcileMerge(task.id, mergeTarget))}
                >
                  {pending ? <Loader2 className="animate-spin" /> : null} Merge
                </Button>
                <p className="w-full text-xs text-muted-foreground">
                  Keeps this card&apos;s papertrail and real cost basis; adopts the imported
                  row&apos;s name and Collectr link, then deletes the duplicate. Any remaining gap
                  comes right back here.
                </p>
              </>
            )}
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
