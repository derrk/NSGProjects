"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markSyncTaskDone, markAllSyncTasksDone } from "@/app/actions";

export function MarkDoneButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await markSyncTaskDone(taskId);
            if (!res.ok) setError(res.error);
            else router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Check />} Done
      </Button>
    </div>
  );
}

export function MarkAllDoneButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await markAllSyncTasksDone();
            if (!res.ok) setError(res.error);
            else {
              setError(null);
              router.refresh();
            }
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <CheckCheck />} Mark all done
      </Button>
    </div>
  );
}
