"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { createCustomer, updateCustomerAction } from "@/app/actions";
import { emptyCustomerForm, type CustomerFormValues } from "@/lib/customer-form-values";

export function CustomerForm({ initial }: { initial?: CustomerFormValues }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState<CustomerFormValues>(initial ?? emptyCustomerForm());
  const set = (patch: Partial<CustomerFormValues>) => setV((p) => ({ ...p, ...patch }));

  function submit() {
    setError(null);
    const payload = {
      name: v.name.trim(),
      email: v.email.trim() || null,
      phone: v.phone.trim() || null,
      notes: v.notes.trim() || null,
    };
    if (!payload.name) {
      setError("Name is required.");
      return;
    }
    startTransition(async () => {
      const res = v.id ? await updateCustomerAction(v.id, payload) : await createCustomer(payload);
      if (!res.ok) setError(res.error);
      else {
        router.push(res.id ? `/customers/${res.id}` : "/customers");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="mb-1.5 block">Name</Label>
            <Input value={v.name} placeholder="Jane Doe" onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">Email</Label>
            <Input
              type="email"
              value={v.email}
              placeholder="Optional"
              onChange={(e) => set({ email: e.target.value })}
            />
          </div>
          <div>
            <Label className="mb-1.5 block">Phone</Label>
            <Input value={v.phone} placeholder="Optional" onChange={(e) => set({ phone: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-1.5 block">Notes</Label>
            <Input value={v.notes} placeholder="Optional" onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button onClick={submit} disabled={pending}>
          {v.id ? "Save customer" : "Add customer"}
        </Button>
      </div>
    </div>
  );
}
