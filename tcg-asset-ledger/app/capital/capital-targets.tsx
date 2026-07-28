"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toCents } from "@/lib/money";
import { setCapitalTargets } from "./actions";

export function CapitalTargets({ minReserve, buyingPowerTarget }: { minReserve: string; buyingPowerTarget: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reserve, setReserve] = useState(minReserve);
  const [target, setTarget] = useState(buyingPowerTarget);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <Label className="mb-1 block text-xs">Min cash reserve ($)</Label>
        <Input type="number" step="0.01" value={reserve} onChange={(e) => setReserve(e.target.value)} className="w-40" placeholder="Keep at least…" />
      </div>
      <div>
        <Label className="mb-1 block text-xs">Buying-power target ($)</Label>
        <Input type="number" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} className="w-40" placeholder="Alert if below…" />
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const res = await setCapitalTargets({
              minCashReserveCents: reserve.trim() === "" ? null : toCents(reserve),
              buyingPowerTargetCents: target.trim() === "" ? null : toCents(target),
            });
            setMsg(res.ok ? "Saved." : res.error);
            if (res.ok) router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : null}
        Save targets
      </Button>
      {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
    </div>
  );
}
