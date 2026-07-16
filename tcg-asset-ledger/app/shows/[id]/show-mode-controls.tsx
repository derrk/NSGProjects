"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tent, Flag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toCents } from "@/lib/money";
import { enterShowModeAction, endShowModeAction } from "@/app/actions";

export function EnterShowMode({ showId, disabled }: { showId: string; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [buyingCash, setBuyingCash] = useState("");
  const [personalCash, setPersonalCash] = useState("");

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} disabled={disabled}>
        <Tent /> Enter Show Mode
      </Button>
    );
  }

  return (
    <Card className="w-full">
      <CardContent className="space-y-4 p-5">
        <div className="text-sm font-semibold">Enter Show Mode</div>
        <p className="text-sm text-muted-foreground">
          Every sale, trade, and buy you record until you end the show gets tagged to it
          automatically. Inventory is snapshotted on entry.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="mb-1.5 block">Buying cash ($)</Label>
            <Input
              type="number"
              step="0.01"
              value={buyingCash}
              placeholder="0.00"
              onChange={(e) => setBuyingCash(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">Cash you brought to buy with.</p>
          </div>
          <div>
            <Label className="mb-1.5 block">Personal cash ($)</Label>
            <Input
              type="number"
              step="0.01"
              value={personalCash}
              placeholder="0.00"
              onChange={(e) => setPersonalCash(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">Walking-around money.</p>
          </div>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await enterShowModeAction({
                  showId,
                  buyingCashCents: toCents(buyingCash),
                  personalCashCents: toCents(personalCash),
                });
                if (!res.ok) setError(res.error);
                else {
                  setOpen(false);
                  router.refresh();
                }
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Tent />} Start
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function EndShowMode() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [endingCash, setEndingCash] = useState("");

  if (!open) {
    return (
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Flag /> End Show
      </Button>
    );
  }

  return (
    <Card className="w-full">
      <CardContent className="space-y-4 p-5">
        <div className="text-sm font-semibold">End Show</div>
        <div className="max-w-xs">
          <Label className="mb-1.5 block">Ending cash ($)</Label>
          <Input
            type="number"
            step="0.01"
            value={endingCash}
            placeholder="Count the box…"
            onChange={(e) => setEndingCash(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Total cash on hand now (buying + personal). Optional but makes the summary honest.
          </p>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await endShowModeAction({
                  endingCashCents: endingCash.trim() === "" ? null : toCents(endingCash),
                });
                if (!res.ok) setError(res.error);
                else {
                  setOpen(false);
                  router.refresh();
                }
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Flag />} End show
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
