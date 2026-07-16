"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Box, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setBrickStatus } from "@/app/actions";

/** Manual brick flag + the 90-day suggestion. The app never auto-marks. */
export function BrickControls({
  assetId,
  isBrick,
  daysHeld,
  suggest,
}: {
  assetId: string;
  isBrick: boolean;
  daysHeld: number;
  suggest: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(next: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await setBrickStatus(assetId, next);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {suggest ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
          <span className="inline-flex items-center gap-2">
            <AlertTriangle className="size-4" />
            This asset has been in inventory for {daysHeld} days. Mark as Brick?
          </span>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => toggle(true)}>
            {pending ? <Loader2 className="animate-spin" /> : <Box />} Mark as Brick
          </Button>
        </div>
      ) : null}

      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">Brick status</span>
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          <button
            type="button"
            disabled={pending}
            onClick={() => toggle(false)}
            className={
              !isBrick
                ? "bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                : "bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
            }
          >
            Normal
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => toggle(true)}
            className={
              isBrick
                ? "bg-warning px-3 py-1.5 text-xs font-medium text-white"
                : "bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
            }
          >
            Brick
          </button>
        </div>
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>
    </div>
  );
}
