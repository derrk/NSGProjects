"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2, Loader2 } from "lucide-react";
import { reverseCapitalEntry } from "./actions";

export function ReverseButton({ entryId, label }: { entryId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      title="Reverse this entry (posts an offsetting correction; nothing is deleted)"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Reverse "${label}"? This posts an offsetting entry — the original stays in the audit trail.`)) return;
        start(async () => {
          const res = await reverseCapitalEntry(entryId);
          if (!res.ok) alert(res.error);
          else router.refresh();
        });
      }}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}
      Reverse
    </button>
  );
}
