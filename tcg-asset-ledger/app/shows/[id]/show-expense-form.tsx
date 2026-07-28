"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toCents } from "@/lib/money";
import { recordBusinessExpense } from "@/app/capital/actions";

export interface CashAcct {
  code: string;
  name: string;
}
export interface ExpenseAcct {
  id: string;
  name: string;
}

/** Add a business expense tagged to this show. Posts a balanced journal entry
 *  (debit the chosen expense account, credit the chosen cash account) via the
 *  accounting layer — the single source of truth for cash + P&L. */
export function ShowExpenseForm({
  showId,
  cashAccounts,
  expenseAccounts,
  todayIso,
}: {
  showId: string;
  cashAccounts: CashAcct[];
  expenseAccounts: ExpenseAcct[];
  todayIso: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expenseId, setExpenseId] = useState(expenseAccounts[0]?.id ?? "");
  const [cashCode, setCashCode] = useState(cashAccounts[0]?.code ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayIso);

  function submit() {
    setError(null);
    const amountCents = toCents(amount);
    if (amountCents <= 0) {
      setError("Enter an amount.");
      return;
    }
    if (!expenseId || !cashCode) {
      setError("Pick a category and a cash account.");
      return;
    }
    startTransition(async () => {
      const res = await recordBusinessExpense({
        showId,
        expenseAccountId: expenseId,
        cashCode,
        amountCents,
        note: note.trim() || undefined,
        date,
      });
      if (!res.ok) {
        setError(res.error);
      } else {
        setAmount("");
        setNote("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-1">
          <Label className="mb-1.5 block text-xs">Amount ($)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            placeholder="0.00"
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="lg:col-span-1">
          <Label className="mb-1.5 block text-xs">Category</Label>
          <Select value={expenseId} onChange={(e) => setExpenseId(e.target.value)}>
            {expenseAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="lg:col-span-1">
          <Label className="mb-1.5 block text-xs">Paid from</Label>
          <Select value={cashCode} onChange={(e) => setCashCode(e.target.value)}>
            {cashAccounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="lg:col-span-1">
          <Label className="mb-1.5 block text-xs">Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="lg:col-span-1">
          <Label className="mb-1.5 block text-xs">Note</Label>
          <Input value={note} placeholder="Optional" onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={pending}>
          <Plus /> Add expense
        </Button>
      </div>
    </div>
  );
}
