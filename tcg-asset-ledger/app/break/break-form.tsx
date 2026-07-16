"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toCents, formatUSD, allocateByWeight } from "@/lib/money";
import { recordBreakAction } from "@/app/actions";
import { FlowMeta, defaultMeta, type MetaState } from "@/components/flows/flow-meta";
import { AssetCombobox } from "@/components/flows/asset-combobox";
import { ReceivedLinesEditor } from "@/components/flows/received-lines-editor";
import { AttachmentUploader } from "@/components/flows/attachment-uploader";
import { newReceivedDraft, type PickableAsset, type ReceivedDraft } from "@/components/flows/types";

export function BreakForm({ assets }: { assets: PickableAsset[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<MetaState>(defaultMeta());
  const [sealedId, setSealedId] = useState("");
  const [qty, setQty] = useState(1);
  const [received, setReceived] = useState<ReceivedDraft[]>([newReceivedDraft("first")]);
  const [photos, setPhotos] = useState<string[]>([]);

  const byId = new Map(assets.map((a) => [a.id, a]));
  const sealed = byId.get(sealedId);
  const parentBasis = sealed ? sealed.costBasisCents * (Number(qty) || 0) : 0;

  const perReceived = useMemo(() => {
    const weights = received.map(
      (r) => toCents(r.unitMarketValueDollars) * (Number(r.quantity) || 0),
    );
    return allocateByWeight(parentBasis, weights);
  }, [received, parentBasis]);

  function submit() {
    setError(null);
    if (!sealedId) {
      setError("Pick the sealed product you're breaking.");
      return;
    }
    const payload = {
      date: meta.date || undefined,
      notes: meta.notes || undefined,
      source: meta.source || undefined,
      attachmentPaths: photos,
      sealedAssetId: sealedId,
      quantity: Number(qty) || 1,
      received: received
        .filter((r) => r.name.trim())
        .map((r) => ({
          name: r.name.trim(),
          game: r.game,
          assetType: r.assetType,
          set: r.set || null,
          cardNumber: r.cardNumber || null,
          variant: r.variant || null,
          grade: r.grade || null,
          condition: r.condition || null,
          quantity: Number(r.quantity) || 1,
          unitMarketValueCents: toCents(r.unitMarketValueDollars),
        })),
    };
    if (payload.received.length === 0) {
      setError("Add the cards/packs that came out.");
      return;
    }
    startTransition(async () => {
      const res = await recordBreakAction(payload);
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
          <FlowMeta meta={meta} onChange={setMeta} counterpartyLabel="Note" />
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <div>
              <Label className="mb-1.5 block">Sealed product to break</Label>
              <AssetCombobox
                assets={assets}
                value={sealedId}
                onSelect={(a) => setSealedId(a.id)}
                placeholder="Search sealed product…"
              />
              {sealed ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Basis {formatUSD(sealed.costBasisCents)}/u · {sealed.quantity} in stock
                </p>
              ) : null}
            </div>
            <div>
              <Label className="mb-1.5 block">Qty to break</Label>
              <Input
                type="number"
                min={1}
                max={sealed?.quantity ?? undefined}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
              />
            </div>
          </div>
          <AttachmentUploader paths={photos} onChange={setPhotos} label="Photos (optional)" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <ReceivedLinesEditor
            lines={received}
            onChange={setReceived}
            title="Cards / packs pulled"
            showBasisOverride={false}
          />
          {sealed && received.some((r) => r.name.trim()) ? (
            <div className="rounded-md bg-muted p-3 text-sm">
              <div className="mb-1 flex items-center gap-2 font-medium">
                {formatUSD(parentBasis)} parent basis <ArrowRight className="size-4" /> allocated by market value
              </div>
              <ul className="space-y-0.5">
                {received.map((r, i) =>
                  r.name.trim() ? (
                    <li key={r.key} className="flex justify-between tnum">
                      <span className="text-muted-foreground">{r.name}</span>
                      <span>basis {formatUSD(perReceived[i])}</span>
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
        <Button onClick={submit} disabled={pending}>Record break</Button>
      </div>
    </div>
  );
}
