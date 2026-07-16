"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteTransaction } from "@/app/actions";

export function DeleteTransactionButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (
            !confirm(
              "Delete this transaction record? This removes the ledger entry but does NOT restore asset quantities — use an Adjustment to fix stock.",
            )
          )
            return;
          setError(null);
          startTransition(async () => {
            const res = await deleteTransaction(id);
            // On success the action redirects and never resolves here.
            if (res && !res.ok) setError(res.error);
          });
        }}
      >
        <Trash2 /> Delete
      </Button>
    </div>
  );
}
