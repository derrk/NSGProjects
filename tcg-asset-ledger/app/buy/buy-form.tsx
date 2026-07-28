"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toCents, allocateByWeight, formatUSD } from "@/lib/money";
import { recordBuyAction } from "@/app/actions";
import { FlowMeta, defaultMeta, type MetaState } from "@/components/flows/flow-meta";
import { ReceivedLinesEditor } from "@/components/flows/received-lines-editor";
import { AttachmentUploader } from "@/components/flows/attachment-uploader";
import { receivedIsFilled, receivedIsPartial, receivedToPayload } from "@/components/flows/to-payload";
import {
  newReceivedDraft,
  type PickableAsset,
  type PickableCustomer,
  type ReceivedDraft,
} from "@/components/flows/types";

export function BuyForm({ assets, customers }: { assets: PickableAsset[]; customers: PickableCustomer[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<MetaState>(defaultMeta());
  const [cashPaid, setCashPaid] = useState("");
  const [received, setReceived] = useState<ReceivedDraft[]>([newReceivedDraft("first")]);
  const [photos, setPhotos] = useState<string[]>([]);

  const cashPaidCents = toCents(cashPaid);

  // Live allocation preview (mirrors the server engine).
  const preview = useMemo(() => {
    const pinned = received.map((r) =>
      r.unitBasisOverrideDollars.trim() !== "" && !r.existingAssetId
        ? toCents(r.unitBasisOverrideDollars) * (Number(r.quantity) || 0)
        : null,
    );
    const pinnedSum = pinned.reduce<number>((a, b) => a + (b ?? 0), 0);
    const remaining = Math.max(0, cashPaidCents - pinnedSum);
    const freeIdx = received.map((_, i) => i).filter((i) => pinned[i] == null);
    const weights = freeIdx.map(
      (i) => toCents(received[i].unitMarketValueDollars) * (Number(received[i].quantity) || 0),
    );
    const alloc = allocateByWeight(remaining, weights);
    const totals = received.map((_, i) => pinned[i] ?? 0);
    freeIdx.forEach((idx, k) => {
      totals[idx] = alloc[k];
    });
    return totals;
  }, [received, cashPaidCents]);

  function submit() {
    setError(null);
    const payload = {
      date: meta.date || undefined,
      counterparty: meta.counterparty || undefined,
      customerId: meta.customerId || undefined,
      notes: meta.notes || undefined,
      source: meta.source || undefined,
      attachmentPaths: photos,
      cashPaidCents,
      received: received.filter(receivedIsFilled).map(receivedToPayload),
    };
    if (payload.received.length === 0) {
      setError("Add at least one item (name a new card or match one in inventory).");
      return;
    }
    if (received.some((r) => r.existingAssetId === "")) {
      setError("Pick the inventory card for each 'Already in inventory' item, or switch it to New.");
      return;
    }
    if (received.some(receivedIsPartial)) {
      setError("Add a name to each item (or clear the empty rows).");
      return;
    }
    startTransition(async () => {
      const res = await recordBuyAction(payload);
      if (!res.ok) setError(res.error);
      else {
        router.push(res.id ? `/transactions/${res.id}` : "/inventory");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-5 p-6">
          <FlowMeta meta={meta} onChange={setMeta} counterpartyLabel="Bought from" customers={customers} />
          <div className="max-w-xs">
            <Label className="mb-1.5 block">Total cash paid ($)</Label>
            <Input
              type="number"
              step="0.01"
              value={cashPaid}
              onChange={(e) => setCashPaid(e.target.value)}
              placeholder="0.00"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Split across items by market value to set each cost basis. Override any line to pin it.
            </p>
          </div>
          <AttachmentUploader paths={photos} onChange={setPhotos} label="Photos (receipt, cards)" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <ReceivedLinesEditor lines={received} onChange={setReceived} title="Items bought" assets={assets} />

          {received.some(receivedIsFilled) ? (
            <div className="rounded-md bg-muted p-3 text-sm">
              <div className="mb-1 font-medium">Cost basis preview</div>
              <ul className="space-y-0.5">
                {received.map((r, i) =>
                  receivedIsFilled(r) ? (
                    <li key={r.key} className="flex justify-between tnum">
                      <span className="max-w-[60%] truncate text-muted-foreground">{r.name || "matched card"}</span>
                      <span>
                        {formatUSD(preview[i])} total
                        {Number(r.quantity) > 1
                          ? ` · ${formatUSD(Math.round(preview[i] / (Number(r.quantity) || 1)))}/u`
                          : ""}
                      </span>
                    </li>
                  ) : null,
                )}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button onClick={submit} disabled={pending}>Record buy</Button>
      </div>
    </div>
  );
}
