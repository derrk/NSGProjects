"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toCents, formatUSD } from "@/lib/money";
import { AssetCombobox } from "@/components/flows/asset-combobox";
import type { PickableAsset } from "@/components/flows/types";
import { recordWheelSessionAction } from "@/app/actions";

const TIERS = [
  { spins: 1, priceCents: 10_00, label: "1 spin · $10" },
  { spins: 3, priceCents: 25_00, label: "3 spins · $25" },
  { spins: 5, priceCents: 40_00, label: "5 spins · $40" },
] as const;

interface SpinDraft {
  key: string;
  slotId: string;
  assetId?: string;
  assetName?: string;
  quantity: number;
}

function newSpin(): SpinDraft {
  return { key: crypto.randomUUID(), slotId: "", quantity: 1 };
}

export function WheelSessionForm({
  slots,
  assets,
}: {
  slots: { id: string; label: string; estCostCents: number }[];
  assets: PickableAsset[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [priceDollars, setPriceDollars] = useState("10");
  const [spins, setSpins] = useState<SpinDraft[]>([newSpin()]);

  function applyTier(t: (typeof TIERS)[number]) {
    setPriceDollars((t.priceCents / 100).toString());
    setSpins((prev) => {
      const next = prev.slice(0, t.spins);
      while (next.length < t.spins) next.push(newSpin());
      return next;
    });
  }

  function update(key: string, patch: Partial<SpinDraft>) {
    setSpins((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function submit() {
    setError(null);
    setDone(null);
    if (spins.some((s) => !s.slotId)) {
      setError("Pick the slot each spin landed on.");
      return;
    }
    startTransition(async () => {
      const res = await recordWheelSessionAction({
        priceCents: toCents(priceDollars),
        spins: spins.map((s) => ({
          slotId: s.slotId,
          assetId: s.assetId || undefined,
          quantity: s.quantity || 1,
        })),
      });
      if (!res.ok) setError(res.error);
      else {
        setDone(`Recorded ${spins.length} spin(s) — ${formatUSD(toCents(priceDollars))} in.`);
        setSpins([newSpin()]);
        setPriceDollars("10");
        router.refresh();
      }
    });
  }

  if (slots.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Add your wheel slots first (right panel) — then spins are two taps each.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Record spins</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="flex flex-wrap items-end gap-2">
          {TIERS.map((t) => (
            <Button key={t.spins} type="button" variant="outline" size="sm" onClick={() => applyTier(t)}>
              {t.label}
            </Button>
          ))}
          <div className="ml-auto w-28">
            <Label className="mb-1 block text-xs">Paid ($)</Label>
            <Input
              type="number"
              step="0.01"
              value={priceDollars}
              onChange={(e) => setPriceDollars(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          {spins.map((s, i) => (
            <div key={s.key} className="rounded-md border border-border p-2.5">
              <div className="flex items-center gap-2">
                <span className="w-6 text-center text-xs font-semibold text-muted-foreground">
                  #{i + 1}
                </span>
                <Select
                  value={s.slotId}
                  onChange={(e) => update(s.key, { slotId: e.target.value })}
                  className="flex-1"
                >
                  <option value="">Landed on…</option>
                  {slots.map((sl) => (
                    <option key={sl.id} value={sl.id}>
                      {sl.label}
                      {sl.estCostCents > 0 ? ` (~${formatUSD(sl.estCostCents)})` : ""}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title={s.assetId ? "Prize from inventory attached" : "Attach inventory prize"}
                  className={cn(s.assetId && "text-primary")}
                  onClick={() =>
                    s.assetId
                      ? update(s.key, { assetId: undefined, assetName: undefined })
                      : update(s.key, { assetId: "" })
                  }
                >
                  <Package />
                </Button>
                {spins.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setSpins((prev) => prev.filter((x) => x.key !== s.key))}
                    aria-label="Remove spin"
                  >
                    <X />
                  </Button>
                ) : null}
              </div>
              {s.assetId !== undefined ? (
                <div className="mt-2 flex items-center gap-2 pl-8">
                  <div className="flex-1">
                    <AssetCombobox
                      assets={assets}
                      value={s.assetId}
                      onSelect={(a) => update(s.key, { assetId: a.id, assetName: a.name })}
                      placeholder="Search the inventory prize given…"
                    />
                  </div>
                  <div className="w-16">
                    <Input
                      type="number"
                      min={1}
                      value={s.quantity}
                      onChange={(e) => update(s.key, { quantity: Number(e.target.value) })}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" size="sm" onClick={() => setSpins((p) => [...p, newSpin()])}>
            <Plus /> Add spin
          </Button>
          <Button onClick={submit} disabled={pending}>
            Record session
          </Button>
        </div>

        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}
        {done ? (
          <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{done}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
