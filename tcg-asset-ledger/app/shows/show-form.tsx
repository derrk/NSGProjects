"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { createShow, updateShow } from "@/app/actions";
import { emptyShowForm, type ShowFormValues } from "@/lib/show-form-values";

export function ShowForm({ initial }: { initial?: ShowFormValues }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState<ShowFormValues>(initial ?? emptyShowForm());
  const set = (patch: Partial<ShowFormValues>) => setV((p) => ({ ...p, ...patch }));

  function submit() {
    setError(null);
    const payload = {
      name: v.name.trim(),
      venue: v.venue.trim() || null,
      city: v.city.trim() || null,
      startDate: v.startDate,
      endDate: v.endDate || null,
      // An Active status is owned by Show Mode — don't send it back.
      ...(v.status !== "Active"
        ? { status: v.status as "Upcoming" | "Completed" | "Cancelled" }
        : {}),
      notes: v.notes.trim() || null,
    };
    startTransition(async () => {
      const res = v.id ? await updateShow(v.id, payload) : await createShow(payload);
      if (!res.ok) setError(res.error);
      else {
        router.push(res.id ? `/shows/${res.id}` : "/shows");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2">
            <Label className="mb-1.5 block">Show name</Label>
            <Input
              value={v.name}
              placeholder="Dallas Card Show"
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>
          <div>
            <Label className="mb-1.5 block">Status</Label>
            {v.status === "Active" ? (
              // A live Show Mode session owns this status — end the show to change it.
              <Select value="Active" disabled>
                <option value="Active">Active (Show Mode running)</option>
              </Select>
            ) : (
              <Select value={v.status} onChange={(e) => set({ status: e.target.value })}>
                {["Upcoming", "Completed", "Cancelled"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            )}
          </div>
          <div>
            <Label className="mb-1.5 block">Venue</Label>
            <Input value={v.venue} onChange={(e) => set({ venue: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">City</Label>
            <Input value={v.city} onChange={(e) => set({ city: e.target.value })} />
          </div>
          <div />
          <div>
            <Label className="mb-1.5 block">Start date</Label>
            <Input type="date" value={v.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">End date</Label>
            <Input type="date" value={v.endDate} onChange={(e) => set({ endDate: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <Label className="mb-1.5 block">Notes</Label>
          <Input value={v.notes} placeholder="Optional" onChange={(e) => set({ notes: e.target.value })} />
          <p className="mt-3 text-xs text-muted-foreground">
            Expenses (table fee, travel, food…) are added on the show&rsquo;s page once it exists — they
            post to your books as real journal entries.
          </p>
        </CardContent>
      </Card>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button onClick={submit} disabled={pending}>
          {v.id ? "Save show" : "Add show"}
        </Button>
      </div>
    </div>
  );
}
