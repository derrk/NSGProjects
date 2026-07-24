"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { wipeInventory } from "./actions";

export function WipeInventoryButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await wipeInventory(password);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(true);
      setOpen(false);
      setPassword("");
      router.refresh();
    });
  }

  if (done) {
    return (
      <p className="text-sm text-success">Inventory wiped. The ledger is back to a blank slate.</p>
    );
  }

  if (!open) {
    return (
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Trash2 /> Wipe All Inventory
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
      <p className="flex items-start gap-2 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        This permanently deletes every asset, transaction, and grading record. There is no undo.
        Shows and calendar data are not affected.
      </p>
      <div className="max-w-xs">
        <Label htmlFor="wipe-password" className="mb-1 block text-xs">
          Enter your password to confirm
        </Label>
        <Input
          id="wipe-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button
          variant="destructive"
          disabled={pending || !password}
          onClick={confirm}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
          Yes, permanently wipe everything
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setPassword("");
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
