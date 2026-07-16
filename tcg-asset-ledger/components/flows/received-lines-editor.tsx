"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatUSD } from "@/lib/money";
import { GAMES, ASSET_TYPES, ASSET_TYPE_LABELS } from "@/lib/domain";
import { AssetCombobox } from "./asset-combobox";
import { newReceivedDraft, marketOf, type PickableAsset, type ReceivedDraft } from "./types";

export function ReceivedLinesEditor({
  lines,
  onChange,
  title = "Items received",
  showBasisOverride = true,
  assets,
}: {
  lines: ReceivedDraft[];
  onChange: (lines: ReceivedDraft[]) => void;
  title?: string;
  showBasisOverride?: boolean;
  /** When provided, each line can match an existing inventory asset instead of
   *  creating a new one (fixes duplication when logging after the fact). */
  assets?: PickableAsset[];
}) {
  const canMatch = Array.isArray(assets) && assets.length > 0;

  function add() {
    onChange([...lines, newReceivedDraft(crypto.randomUUID())]);
  }
  function update(key: string, patch: Partial<ReceivedDraft>) {
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
        <div className="space-y-3">
          {lines.map((l) => {
            // "existing" mode is on whenever the field is defined — even as an
            // empty string (mode selected, asset not yet picked).
            const isExisting = l.existingAssetId !== undefined;
            return (
              <div key={l.key} className="rounded-md border border-border p-3">
                {canMatch ? (
                  <div className="mb-3 flex items-center justify-between">
                    <div className="inline-flex overflow-hidden rounded-md border border-border">
                      <ModeButton
                        active={!isExisting}
                        onClick={() => update(l.key, { existingAssetId: undefined })}
                      >
                        New card
                      </ModeButton>
                      <ModeButton
                        active={isExisting}
                        onClick={() =>
                          // Switch to match mode; user then picks the asset.
                          update(l.key, { existingAssetId: l.existingAssetId ?? "" })
                        }
                      >
                        Already in inventory
                      </ModeButton>
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
                ) : null}

                {isExisting ? (
                  <ExistingRow l={l} assets={assets!} update={update} />
                ) : (
                  <NewRow
                    l={l}
                    update={update}
                    showBasisOverride={showBasisOverride}
                    showRemove={!canMatch}
                    remove={remove}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function ExistingRow({
  l,
  assets,
  update,
}: {
  l: ReceivedDraft;
  assets: PickableAsset[];
  update: (key: string, patch: Partial<ReceivedDraft>) => void;
}) {
  const picked = assets.find((a) => a.id === l.existingAssetId);
  return (
    <div className="grid items-end gap-2 sm:grid-cols-[1fr_90px_130px]">
      <div>
        <Label className="mb-1 block text-xs">Match card in inventory</Label>
        <AssetCombobox
          assets={assets}
          value={l.existingAssetId}
          onSelect={(a) =>
            update(l.key, {
              existingAssetId: a.id,
              name: a.name,
              // Default to repricing the whole lot (the common case); capped below.
              quantity: a.quantity,
              unitMarketValueDollars:
                l.unitMarketValueDollars || (marketOf(a) / 100).toString(),
            })
          }
          placeholder="Search the card you took in…"
        />
        {picked ? (
          <p className="mt-1 text-xs text-muted-foreground">
            In stock: {picked.quantity} · basis {formatUSD(picked.costBasisCents)}/u. Basis will be
            set from this trade; quantity unchanged.
          </p>
        ) : (
          <p className="mt-1 text-xs text-warning">Pick the card this transaction brought in.</p>
        )}
      </div>
      <div>
        <Label className="mb-1 block text-xs">Qty in</Label>
        <Input
          type="number"
          min={1}
          max={picked?.quantity ?? undefined}
          value={l.quantity}
          onChange={(e) => update(l.key, { quantity: Number(e.target.value) })}
        />
      </div>
      <div>
        <Label className="mb-1 block text-xs">Market / unit ($)</Label>
        <Input
          type="number"
          step="0.01"
          value={l.unitMarketValueDollars}
          onChange={(e) => update(l.key, { unitMarketValueDollars: e.target.value })}
        />
      </div>
    </div>
  );
}

function NewRow({
  l,
  update,
  showBasisOverride,
  showRemove,
  remove,
}: {
  l: ReceivedDraft;
  update: (key: string, patch: Partial<ReceivedDraft>) => void;
  showBasisOverride: boolean;
  showRemove: boolean;
  remove: (key: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <div className="lg:col-span-2">
        <Label className="mb-1 block text-xs">Name</Label>
        <Input
          value={l.name}
          placeholder="Card / product name"
          onChange={(e) => update(l.key, { name: e.target.value })}
        />
      </div>
      <div>
        <Label className="mb-1 block text-xs">Game</Label>
        <Select value={l.game} onChange={(e) => update(l.key, { game: e.target.value })}>
          {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
        </Select>
      </div>
      <div>
        <Label className="mb-1 block text-xs">Type</Label>
        <Select value={l.assetType} onChange={(e) => update(l.key, { assetType: e.target.value })}>
          {ASSET_TYPES.map((t) => (
            <option key={t} value={t}>{ASSET_TYPE_LABELS[t]}</option>
          ))}
        </Select>
      </div>

      <div>
        <Label className="mb-1 block text-xs">Set</Label>
        <Input value={l.set} onChange={(e) => update(l.key, { set: e.target.value })} />
      </div>
      <div>
        <Label className="mb-1 block text-xs">Card #</Label>
        <Input value={l.cardNumber} onChange={(e) => update(l.key, { cardNumber: e.target.value })} />
      </div>
      <div>
        <Label className="mb-1 block text-xs">Grade</Label>
        <Input value={l.grade} onChange={(e) => update(l.key, { grade: e.target.value })} />
      </div>
      <div>
        <Label className="mb-1 block text-xs">Variant</Label>
        <Input value={l.variant} onChange={(e) => update(l.key, { variant: e.target.value })} />
      </div>

      <div>
        <Label className="mb-1 block text-xs">Qty</Label>
        <Input
          type="number"
          min={1}
          value={l.quantity}
          onChange={(e) => update(l.key, { quantity: Number(e.target.value) })}
        />
      </div>
      <div>
        <Label className="mb-1 block text-xs">Market / unit ($)</Label>
        <Input
          type="number"
          step="0.01"
          value={l.unitMarketValueDollars}
          onChange={(e) => update(l.key, { unitMarketValueDollars: e.target.value })}
        />
      </div>
      {showBasisOverride ? (
        <div>
          <Label className="mb-1 block text-xs">Cost override ($)</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="auto"
            value={l.unitBasisOverrideDollars}
            onChange={(e) => update(l.key, { unitBasisOverrideDollars: e.target.value })}
          />
        </div>
      ) : null}
      {showRemove ? (
        <div className="flex items-end justify-end">
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
      ) : null}
    </div>
  );
}
