"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatUSD } from "@/lib/money";
import { AssetCombobox } from "./asset-combobox";
import { assetLabel, marketOf, type GivenDraft, type PickableAsset } from "./types";

export function GivenLinesEditor({
  assets,
  lines,
  onChange,
  title = "Items given up",
  valueLabel = "Value / unit ($)",
}: {
  assets: PickableAsset[];
  lines: GivenDraft[];
  onChange: (lines: GivenDraft[]) => void;
  title?: string;
  valueLabel?: string;
}) {
  const byId = new Map(assets.map((a) => [a.id, a]));

  function add() {
    onChange([
      ...lines,
      { key: crypto.randomUUID(), assetId: "", quantity: 1, unitValueDollars: "" },
    ]);
  }
  function update(key: string, patch: Partial<GivenDraft>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function remove(key: string) {
    onChange(lines.filter((l) => l.key !== key));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">{title}</Label>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus /> Add item
        </Button>
      </div>

      {lines.length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
          No items yet.
        </p>
      ) : (
        <div className="space-y-2">
          {lines.map((l) => {
            const a = byId.get(l.assetId);
            return (
              <div
                key={l.key}
                className="grid items-end gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_80px_120px_auto]"
              >
                <div>
                  <Label className="mb-1 block text-xs">Asset</Label>
                  <AssetCombobox
                    assets={assets}
                    value={l.assetId}
                    onSelect={(asset) =>
                      update(l.key, {
                        assetId: asset.id,
                        unitValueDollars: l.unitValueDollars || (marketOf(asset) / 100).toString(),
                      })
                    }
                  />
                  {a ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      In stock: {a.quantity} · basis {formatUSD(a.costBasisCents)}/u
                    </p>
                  ) : null}
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Qty</Label>
                  <Input
                    type="number"
                    min={1}
                    max={a?.quantity ?? undefined}
                    value={l.quantity}
                    onChange={(e) => update(l.key, { quantity: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">{valueLabel}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={l.unitValueDollars}
                    onChange={(e) => update(l.key, { unitValueDollars: e.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(l.key)}
                  aria-label="Remove"
                >
                  <X />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
