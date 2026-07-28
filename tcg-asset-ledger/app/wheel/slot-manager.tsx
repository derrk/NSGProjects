"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toCents, formatUSD } from "@/lib/money";
import { createWheelSlot, updateWheelSlot } from "@/app/actions";

export function SlotManager({
  slots,
}: {
  slots: { id: string; label: string; estCostCents: number; active: boolean }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [estCost, setEstCost] = useState("");

  function add() {
    setError(null);
    if (!label.trim()) {
      setError("Give the slot a name.");
      return;
    }
    startTransition(async () => {
      const res = await createWheelSlot({
        label: label.trim(),
        estCostCents: estCost.trim() === "" ? 0 : toCents(estCost),
      });
      if (!res.ok) setError(res.error);
      else {
        setLabel("");
        setEstCost("");
        router.refresh();
      }
    });
  }

  function toggle(id: string, active: boolean) {
    startTransition(async () => {
      const res = await updateWheelSlot(id, { active });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Wheel slots</CardTitle>
        <p className="text-sm text-muted-foreground">
          One per spot on the wheel. Est. cost covers no-cost prizes (EX bundles) — inventory
          prizes use their real basis automatically.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label className="mb-1 block text-xs">Slot name</Label>
            <Input
              value={label}
              placeholder="EX Bundle / Slab / Pack…"
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="w-24">
            <Label className="mb-1 block text-xs">Est. cost ($)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0"
              value={estCost}
              onChange={(e) => setEstCost(e.target.value)}
            />
          </div>
          <Button type="button" onClick={add} disabled={pending}>
            <Plus /> Add
          </Button>
        </div>

        {slots.length > 0 ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {slots.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className={s.active ? "" : "text-muted-foreground line-through"}>
                  {s.label}
                  <span className="ml-2 text-xs text-muted-foreground tnum">
                    {s.estCostCents > 0 ? `~${formatUSD(s.estCostCents)}` : "no est. cost"}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => toggle(s.id, !s.active)}
                >
                  {s.active ? "Retire" : "Reactivate"}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
