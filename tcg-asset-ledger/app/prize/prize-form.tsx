"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toCents, formatUSD } from "@/lib/money";
import { recordPrizeAction } from "@/app/actions";
import { FlowMeta, defaultMeta, type MetaState } from "@/components/flows/flow-meta";
import { GivenLinesEditor } from "@/components/flows/given-lines-editor";
import { AttachmentUploader } from "@/components/flows/attachment-uploader";
import type { GivenDraft, PickableAsset } from "@/components/flows/types";

export function PrizeForm({ assets }: { assets: PickableAsset[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<MetaState>(defaultMeta());
  const [given, setGiven] = useState<GivenDraft[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);

  const byId = new Map(assets.map((a) => [a.id, a]));
  const writeOff = useMemo(
    () =>
      given.reduce((s, g) => {
        const a = byId.get(g.assetId);
        return s + (a ? a.costBasisCents * (Number(g.quantity) || 0) : 0);
      }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [given],
  );

  function submit() {
    setError(null);
    const payload = {
      date: meta.date || undefined,
      notes: meta.notes || undefined,
      source: meta.source || undefined,
      attachmentPaths: photos,
      given: given
        .filter((g) => g.assetId)
        .map((g) => ({ assetId: g.assetId, quantity: Number(g.quantity) || 1 })),
    };
    if (payload.given.length === 0) {
      setError("Add at least one item to give away.");
      return;
    }
    startTransition(async () => {
      const res = await recordPrizeAction(payload);
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
          <FlowMeta meta={meta} onChange={setMeta} counterpartyLabel="Event / winner" />
          <AttachmentUploader paths={photos} onChange={setPhotos} label="Photos (optional)" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <GivenLinesEditor
            assets={assets}
            lines={given}
            onChange={setGiven}
            title="Items given as prizes"
            valueLabel="(value / unit)"
          />
          {given.some((g) => g.assetId) ? (
            <div className="rounded-md bg-muted p-3 text-sm">
              <div className="flex justify-between font-medium">
                <span>Cost basis written off</span>
                <span className="tnum">{formatUSD(writeOff)}</span>
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
        <Button onClick={submit} disabled={pending}>Record prize</Button>
      </div>
    </div>
  );
}
