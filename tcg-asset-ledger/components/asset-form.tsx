"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toCents } from "@/lib/money";
import {
  GAMES,
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  ASSET_STATUSES,
  STATUS_LABELS,
  CONDITIONS,
} from "@/lib/domain";
import { createAsset, updateAsset, type ActionResult } from "@/app/actions";
import { EMPTY_ASSET_FORM as EMPTY, type AssetFormValues } from "@/lib/asset-form-values";

export function AssetForm({ initial }: { initial?: AssetFormValues }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState<AssetFormValues>(initial ?? EMPTY);
  const isEdit = Boolean(initial?.id);

  function set<K extends keyof AssetFormValues>(key: K, value: AssetFormValues[K]) {
    setV((prev) => ({ ...prev, [key]: value }));
  }

  function submit() {
    setError(null);
    const payload = {
      name: v.name.trim(),
      game: v.game,
      assetType: v.assetType,
      set: v.set || null,
      cardNumber: v.cardNumber || null,
      rarity: v.rarity || null,
      variant: v.variant || null,
      grade: v.grade || null,
      condition: v.condition || null,
      location: v.location || null,
      source: v.source || null,
      notes: v.notes || null,
      status: v.status,
      quantity: Number(v.quantity) || 0,
      costBasisCents: toCents(v.costBasisDollars),
      marketValueCents: toCents(v.marketValueDollars),
    };
    startTransition(async () => {
      const res: ActionResult = isEdit
        ? await updateAsset(initial!.id!, payload)
        : await createAsset(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(res.id ? `/inventory/${res.id}` : "/inventory");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2">
            <Input value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Charizard ex" />
          </Field>

          <Field label="Game">
            <Select value={v.game} onChange={(e) => set("game", e.target.value)}>
              {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
            </Select>
          </Field>
          <Field label="Type">
            <Select value={v.assetType} onChange={(e) => set("assetType", e.target.value)}>
              {ASSET_TYPES.map((t) => <option key={t} value={t}>{ASSET_TYPE_LABELS[t]}</option>)}
            </Select>
          </Field>

          <Field label="Set">
            <Input value={v.set} onChange={(e) => set("set", e.target.value)} />
          </Field>
          <Field label="Card number">
            <Input value={v.cardNumber} onChange={(e) => set("cardNumber", e.target.value)} />
          </Field>

          <Field label="Rarity">
            <Input value={v.rarity} onChange={(e) => set("rarity", e.target.value)} placeholder="SR, Illustration Rare…" />
          </Field>
          <Field label="Variant / finish">
            <Input value={v.variant} onChange={(e) => set("variant", e.target.value)} placeholder="Foil, Holofoil…" />
          </Field>

          <Field label="Grade">
            <Input value={v.grade} onChange={(e) => set("grade", e.target.value)} placeholder="Ungraded, PSA 10.0…" />
          </Field>
          <Field label="Condition">
            <Select value={v.condition} onChange={(e) => set("condition", e.target.value)}>
              {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>

          <Field label="Quantity">
            <Input type="number" min={0} value={v.quantity} onChange={(e) => set("quantity", Number(e.target.value))} />
          </Field>
          <Field label="Status">
            <Select value={v.status} onChange={(e) => set("status", e.target.value)}>
              {ASSET_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </Select>
          </Field>

          <Field label="Cost basis / unit ($)">
            <Input type="number" step="0.01" value={v.costBasisDollars} onChange={(e) => set("costBasisDollars", e.target.value)} />
          </Field>
          <Field label="Market value / unit ($)">
            <Input type="number" step="0.01" value={v.marketValueDollars} onChange={(e) => set("marketValueDollars", e.target.value)} />
          </Field>

          <Field label="Location">
            <Input value={v.location} onChange={(e) => set("location", e.target.value)} placeholder="Binder A, Box 3…" />
          </Field>
          <Field label="Source">
            <Input value={v.source} onChange={(e) => set("source", e.target.value)} placeholder="Show pickup, vendor…" />
          </Field>

          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={v.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !v.name.trim()}>
            {isEdit ? "Save changes" : "Add asset"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}
