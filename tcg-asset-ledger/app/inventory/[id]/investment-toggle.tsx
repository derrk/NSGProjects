"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { setInvestmentStatus } from "@/app/actions";

/**
 * Toggle an owned card between show-available inventory and an investment hold.
 * Marking it parks the capital in the portfolio (out of the sell/show numbers);
 * the cash + cost basis were already recorded when the card was acquired.
 */
export function InvestmentControls({
  assetId,
  isInvestment,
}: {
  assetId: string;
  isInvestment: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(next: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await setInvestmentStatus(assetId, next);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <TrendingUp className="size-4" /> Holding type
      </span>
      <div className="inline-flex overflow-hidden rounded-md border border-border">
        <button
          type="button"
          disabled={pending}
          onClick={() => toggle(false)}
          className={
            !isInvestment
              ? "bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
              : "bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
          }
        >
          Sell inventory
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => toggle(true)}
          className={
            isInvestment
              ? "bg-sky-600 px-3 py-1.5 text-xs font-medium text-white"
              : "bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
          }
        >
          Investment
        </button>
      </div>
      {isInvestment ? (
        <span className="text-xs text-muted-foreground">
          Tracked in the{" "}
          <a href="/investments" className="underline hover:text-foreground">
            portfolio
          </a>
          , out of show/sell totals.
        </span>
      ) : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
