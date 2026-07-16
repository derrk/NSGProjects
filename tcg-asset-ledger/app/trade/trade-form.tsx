"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { toCents, formatUSD, allocateByWeight } from "@/lib/money";
import { acquisitionCostCents } from "@/lib/costbasis";
import { ProfitText } from "@/components/money-text";
import { recordTradeAction } from "@/app/actions";
import { FlowMeta, defaultMeta, type MetaState } from "@/components/flows/flow-meta";
import { GivenLinesEditor } from "@/components/flows/given-lines-editor";
import { ReceivedLinesEditor } from "@/components/flows/received-lines-editor";
import { AttachmentUploader } from "@/components/flows/attachment-uploader";
import { receivedIsFilled, receivedIsPartial, receivedToPayload } from "@/components/flows/to-payload";
import type { GivenDraft, PickableAsset, ReceivedDraft } from "@/components/flows/types";

type CashDir = "paid" | "received" | "none";

export function TradeForm({ assets }: { assets: PickableAsset[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<MetaState>(defaultMeta());
  const [given, setGiven] = useState<GivenDraft[]>([]);
  const [received, setReceived] = useState<ReceivedDraft[]>([]);
  const [cashDir, setCashDir] = useState<CashDir>("none");
  const [cashAmount, setCashAmount] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  const byId = new Map(assets.map((a) => [a.id, a]));

  const cashDeltaCents =
    cashDir === "paid" ? -toCents(cashAmount) : cashDir === "received" ? toCents(cashAmount) : 0;

  const givenBasisCents = useMemo(
    () =>
      given.reduce((sum, g) => {
        const a = byId.get(g.assetId);
        return sum + (a ? a.costBasisCents * (Number(g.quantity) || 0) : 0);
      }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [given],
  );

  // Market value in / out for the trade analysis.
  const valueOutCents = given.reduce(
    (s, g) => s + toCents(g.unitValueDollars) * (Number(g.quantity) || 0),
    0,
  );
  const valueInCents = received.reduce(
    (s, r) => s + toCents(r.unitMarketValueDollars) * (Number(r.quantity) || 0),
    0,
  );
  const marketDeltaCents = valueInCents - valueOutCents;
  const netWithCashCents = marketDeltaCents + cashDeltaCents;

  const pool = acquisitionCostCents({ givenBasisCents, cashDeltaCents });

  const perReceived = useMemo(() => {
    const pinned = received.map((r) =>
      r.unitBasisOverrideDollars.trim() !== "" && !r.existingAssetId
        ? toCents(r.unitBasisOverrideDollars) * (Number(r.quantity) || 0)
        : null,
    );
    const pinnedSum = pinned.reduce<number>((a, b) => a + (b ?? 0), 0);
    const remaining = Math.max(0, pool - pinnedSum);
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
  }, [received, pool]);

  function submit() {
    setError(null);
    const payload = {
      date: meta.date || undefined,
      counterparty: meta.counterparty || undefined,
      notes: meta.notes || undefined,
      source: meta.source || undefined,
      attachmentPaths: photos,
      cashDeltaCents,
      given: given
        .filter((g) => g.assetId)
        .map((g) => ({
          assetId: g.assetId,
          quantity: Number(g.quantity) || 1,
          unitValueCents: toCents(g.unitValueDollars),
        })),
      received: received.filter(receivedIsFilled).map(receivedToPayload),
    };
    if (payload.given.length === 0 && payload.received.length === 0) {
      setError("Add items to at least one side of the trade.");
      return;
    }
    if (received.some((r) => r.existingAssetId === "")) {
      setError("Pick the inventory card for each 'Already in inventory' item, or switch it to New.");
      return;
    }
    if (received.some(receivedIsPartial)) {
      setError("Add a name to each received card (or clear the empty rows).");
      return;
    }
    startTransition(async () => {
      const res = await recordTradeAction(payload);
      if (!res.ok) setError(res.error);
      else {
        router.push(res.id ? `/transactions/${res.id}` : "/inventory");
        router.refresh();
      }
    });
  }

  const showAnalysis = given.length > 0 || received.some(receivedIsFilled);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-5 p-6">
          <FlowMeta meta={meta} onChange={setMeta} counterpartyLabel="Traded with" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block">Cash on top</Label>
              <Select value={cashDir} onChange={(e) => setCashDir(e.target.value as CashDir)}>
                <option value="none">No cash</option>
                <option value="paid">I paid cash</option>
                <option value="received">I received cash</option>
              </Select>
            </div>
            {cashDir !== "none" ? (
              <div>
                <Label className="mb-1.5 block">Cash amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                />
              </div>
            ) : null}
          </div>
          <AttachmentUploader paths={photos} onChange={setPhotos} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <GivenLinesEditor
              assets={assets}
              lines={given}
              onChange={setGiven}
              title="You give"
              valueLabel="Trade value / unit ($)"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <ReceivedLinesEditor lines={received} onChange={setReceived} title="You get" assets={assets} />
          </CardContent>
        </Card>
      </div>

      {showAnalysis ? (
        <Card>
          <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
            {/* Trade analysis */}
            <div className="space-y-1.5 text-sm">
              <div className="font-semibold">Trade analysis</div>
              <Row label="Market value you get" value={formatUSD(valueInCents)} />
              <Row label="Market value you give" value={formatUSD(valueOutCents)} />
              {cashDeltaCents !== 0 ? (
                <Row
                  label={cashDeltaCents < 0 ? "Cash you pay" : "Cash you receive"}
                  value={formatUSD(Math.abs(cashDeltaCents))}
                />
              ) : null}
              <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
                <span className="font-medium">Inventory value change</span>
                <ProfitText cents={marketDeltaCents} />
              </div>
              {cashDeltaCents !== 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Net after cash</span>
                  <ProfitText cents={netWithCashCents} />
                </div>
              ) : null}
            </div>

            {/* Cost basis carry */}
            <div className="space-y-1.5 text-sm sm:border-l sm:border-border sm:pl-6">
              <div className="font-semibold">Cost basis carry</div>
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <span className="tnum">{formatUSD(givenBasisCents)} basis given</span>
                {cashDeltaCents !== 0 ? (
                  <span className="tnum">
                    {cashDeltaCents < 0 ? "+ " : "− "}
                    {formatUSD(Math.abs(cashDeltaCents))} cash
                  </span>
                ) : null}
                <ArrowRight className="size-4" />
                <span className="tnum font-medium text-foreground">{formatUSD(pool)}</span>
              </div>
              {received.some(receivedIsFilled) ? (
                <ul className="mt-1 space-y-0.5">
                  {received.map((r, i) =>
                    receivedIsFilled(r) ? (
                      <li key={r.key} className="flex justify-between tnum">
                        <span className="max-w-[60%] truncate text-muted-foreground">
                          {r.name || "matched card"}
                        </span>
                        <span>
                          basis {formatUSD(perReceived[i])}
                          {Number(r.quantity) > 1
                            ? ` · ${formatUSD(Math.round(perReceived[i] / (Number(r.quantity) || 1)))}/u`
                            : ""}
                        </span>
                      </li>
                    ) : null,
                  )}
                </ul>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button onClick={submit} disabled={pending}>Record trade</Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}
