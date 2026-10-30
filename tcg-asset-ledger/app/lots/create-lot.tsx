"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { TRANSACTION_SOURCES } from "@/lib/domain";
import { createLot } from "./actions";

export function CreateLotForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [source, setSource] = useState("Whatnot");
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 py-4">
        <div className="min-w-[220px] flex-1">
          <Label className="mb-1 block text-xs">New lot name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Whatnot stream 7/25" />
        </div>
        <div>
          <Label className="mb-1 block text-xs">Channel</Label>
          <Select value={source} onChange={(e) => setSource(e.target.value)} className="w-40">
            {TRANSACTION_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        <Button
          disabled={pending}
          onClick={() => {
            setError(null);
            if (!name.trim()) { setError("Name the lot."); return; }
            start(async () => {
              const res = await createLot({ name, source });
              if (!res.ok) setError(res.error);
              else if (res.id) router.push(`/lots/${res.id}`);
            });
          }}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} Start a lot
        </Button>
        {error ? <span className="text-sm text-destructive">{error}</span> : null}
      </CardContent>
    </Card>
  );
}
