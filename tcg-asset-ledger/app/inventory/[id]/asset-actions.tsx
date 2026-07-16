"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toCents, toDollars } from "@/lib/money";
import { recordAdjustmentAction, deleteAsset } from "@/app/actions";

export function AssetActions({
  assetId,
  quantity,
  marketValueCents,
  hasHistory,
}: {
  assetId: string;
  quantity: number;
  marketValueCents: number;
  hasHistory: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [qtyDelta, setQtyDelta] = useState("0");
  const [newMarket, setNewMarket] = useState(String(toDollars(marketValueCents)));
  const [note, setNote] = useState("");

  function submitAdjust() {
    setError(null);
    const delta = parseInt(qtyDelta || "0", 10) || 0;
    const newMarketCents = toCents(newMarket);
    startTransition(async () => {
      const res = await recordAdjustmentAction({
        assetId,
        quantityDelta: delta !== 0 ? delta : undefined,
        newMarketValueCents: newMarketCents !== marketValueCents ? newMarketCents : undefined,
        notes: note || undefined,
      });
      if (!res.ok) setError(res.error);
      else {
        setQtyDelta("0");
        setNote("");
        router.refresh();
      }
    });
  }

  function onDelete() {
    if (!confirm("Delete this asset permanently? This cannot be undone.")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteAsset(assetId);
      if (!res.ok) setError(res.error);
      else router.push("/inventory");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SlidersHorizontal className="size-4" /> Adjust &amp; manage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="qtyDelta">Quantity change</Label>
            <Input
              id="qtyDelta"
              type="number"
              value={qtyDelta}
              onChange={(e) => setQtyDelta(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Current: {quantity}. Use −1 to remove one.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newMarket">Market value / unit ($)</Label>
            <Input
              id="newMarket"
              type="number"
              step="0.01"
              value={newMarket}
              onChange={(e) => setNewMarket(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="note">Reason / note</Label>
            <Input
              id="note"
              placeholder="e.g. price refresh, found a miscount"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <Button onClick={submitAdjust} disabled={pending} variant="secondary">
            Record adjustment
          </Button>
          <Button
            onClick={onDelete}
            disabled={pending || hasHistory}
            variant="destructive"
            title={hasHistory ? "Assets with history can't be deleted" : undefined}
          >
            <Trash2 /> Delete asset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
