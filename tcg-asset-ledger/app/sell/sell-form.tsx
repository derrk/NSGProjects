"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toCents, formatUSD } from "@/lib/money";
import { ProfitText } from "@/components/money-text";
import { recordSaleAction } from "@/app/actions";
import { FlowMeta, defaultMeta, type MetaState } from "@/components/flows/flow-meta";
import { GivenLinesEditor } from "@/components/flows/given-lines-editor";
import { AttachmentUploader } from "@/components/flows/attachment-uploader";
import type { GivenDraft, PickableAsset, PickableCustomer } from "@/components/flows/types";

export function SellForm({ assets, customers }: { assets: PickableAsset[]; customers: PickableCustomer[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<MetaState>(defaultMeta());
  const [proceeds, setProceeds] = useState("");
  const [given, setGiven] = useState<GivenDraft[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);

  const byId = new Map(assets.map((a) => [a.id, a]));
  const proceedsCents = toCents(proceeds);

  const basisCents = useMemo(
    () =>
      given.reduce((sum, g) => {
        const a = byId.get(g.assetId);
        return sum + (a ? a.costBasisCents * (Number(g.quantity) || 0) : 0);
      }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [given],
  );

  // Suggest proceeds from the entered per-unit values if the user hasn't typed a total.
  const suggested = given.reduce(
    (s, g) => s + toCents(g.unitValueDollars) * (Number(g.quantity) || 0),
    0,
  );

  function submit() {
    setError(null);
    const payload = {
      date: meta.date || undefined,
      counterparty: meta.counterparty || undefined,
      customerId: meta.customerId || undefined,
      notes: meta.notes || undefined,
      source: meta.source || undefined,
      attachmentPaths: photos,
      proceedsCents: proceedsCents || suggested,
      given: given
        .filter((g) => g.assetId)
        .map((g) => ({
          assetId: g.assetId,
          quantity: Number(g.quantity) || 1,
          unitValueCents: toCents(g.unitValueDollars),
        })),
    };
    if (payload.given.length === 0) {
      setError("Add at least one item to sell.");
      return;
    }
    startTransition(async () => {
      const res = await recordSaleAction(payload);
      if (!res.ok) setError(res.error);
      else {
        router.push(res.id ? `/transactions/${res.id}` : "/inventory");
        router.refresh();
      }
    });
  }

  const effProceeds = proceedsCents || suggested;
  const profit = effProceeds - basisCents;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-5 p-6">
          <FlowMeta meta={meta} onChange={setMeta} counterpartyLabel="Sold to" customers={customers} />
          <AttachmentUploader paths={photos} onChange={setPhotos} label="Photos (optional)" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <GivenLinesEditor
            assets={assets}
            lines={given}
            onChange={setGiven}
            title="Items sold"
            valueLabel="Sale price / unit ($)"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="max-w-xs">
              <Label className="mb-1.5 block">Total proceeds ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={proceeds}
                onChange={(e) => setProceeds(e.target.value)}
                placeholder={suggested ? (suggested / 100).toFixed(2) : "0.00"}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Leave blank to use the sum of line prices.
              </p>
            </div>
          </div>

          {given.some((g) => g.assetId) ? (
            <div className="rounded-md bg-muted p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Proceeds</span>
                <span className="tnum">{formatUSD(effProceeds)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cost basis</span>
                <span className="tnum">{formatUSD(basisCents)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-border pt-1 font-medium">
                <span>Realized profit</span>
                <ProfitText cents={profit} />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button onClick={submit} disabled={pending}>Record sale</Button>
      </div>
    </div>
  );
}
