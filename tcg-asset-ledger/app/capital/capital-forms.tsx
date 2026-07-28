"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toCents, formatUSD } from "@/lib/money";
import {
  addCapital,
  recordOwnerDraw,
  recordDueFromOwner,
  recordOwnerRepayment,
  recordBusinessExpense,
  recordBusinessPaidPersonally,
  recordOwnerReimbursement,
  recordTransfer,
  reconcileCash,
  recordEquipmentPurchase,
  recordPrepay,
  applyPrepaid,
} from "./actions";

type Acct = { code: string; name: string };
type ExpenseAcct = { id: string; name: string };
type Result = { ok: true; id?: string; message?: string } | { ok: false; error: string };

interface ActionDef {
  key: string;
  label: string;
  needs: ("cash" | "expense" | "from" | "to" | "amount" | "actual" | "prepaid")[];
  warn?: string;
  run: (v: Vals) => Promise<Result>;
  impact: (cents: number, v: Vals, accts: Acct[]) => string;
}

interface Vals {
  amount: string;
  actual: string;
  cashCode: string;
  expenseId: string;
  fromCode: string;
  toCode: string;
  prepaidCode: string;
  note: string;
  date: string;
}

const ACTIONS: ActionDef[] = [
  {
    key: "contribution",
    label: "Add capital",
    needs: ["cash", "amount"],
    run: (v) => addCapital({ cashCode: v.cashCode, amountCents: toCents(v.amount), note: v.note, date: v.date }),
    impact: (c) => `Cash +${formatUSD(c)} · Owner contributions +${formatUSD(c)} · Net equity +${formatUSD(c)}`,
  },
  {
    key: "draw",
    label: "Personal withdrawal",
    needs: ["cash", "amount"],
    warn: "This is money leaving the business for personal use — it is NOT a business expense and won't reduce profit.",
    run: (v) => recordOwnerDraw({ cashCode: v.cashCode, amountCents: toCents(v.amount), note: v.note, date: v.date }),
    impact: (c) => `Cash −${formatUSD(c)} · Owner draws +${formatUSD(c)} · Net equity −${formatUSD(c)}`,
  },
  {
    key: "dueFrom",
    label: "Money owed back",
    needs: ["cash", "amount"],
    warn: "Business cash used for a personal bill you'll repay. Tracked as owed back — not a business expense.",
    run: (v) => recordDueFromOwner({ cashCode: v.cashCode, amountCents: toCents(v.amount), note: v.note, date: v.date }),
    impact: (c) => `Cash −${formatUSD(c)} · Owner owes business +${formatUSD(c)} · No profit change`,
  },
  {
    key: "repay",
    label: "Repay business",
    needs: ["cash", "amount"],
    run: (v) => recordOwnerRepayment({ cashCode: v.cashCode, amountCents: toCents(v.amount), note: v.note, date: v.date }),
    impact: (c) => `Cash +${formatUSD(c)} · Owner owes business −${formatUSD(c)}`,
  },
  {
    key: "expense",
    label: "Business expense",
    needs: ["cash", "expense", "amount"],
    run: (v) => recordBusinessExpense({ cashCode: v.cashCode, expenseAccountId: v.expenseId, amountCents: toCents(v.amount), note: v.note, date: v.date }),
    impact: (c) => `Cash −${formatUSD(c)} · Expenses +${formatUSD(c)} · Net profit −${formatUSD(c)}`,
  },
  {
    key: "paidPersonally",
    label: "Business purchase paid personally",
    needs: ["expense", "amount"],
    run: (v) => recordBusinessPaidPersonally({ expenseAccountId: v.expenseId, amountCents: toCents(v.amount), note: v.note, date: v.date }),
    impact: (c) => `Business owes you +${formatUSD(c)} · Expenses +${formatUSD(c)} · No cash change`,
  },
  {
    key: "reimburse",
    label: "Reimburse owner",
    needs: ["cash", "amount"],
    run: (v) => recordOwnerReimbursement({ cashCode: v.cashCode, amountCents: toCents(v.amount), note: v.note, date: v.date }),
    impact: (c) => `Cash −${formatUSD(c)} · Business owes you −${formatUSD(c)}`,
  },
  {
    key: "transfer",
    label: "Transfer money",
    needs: ["from", "to", "amount"],
    run: (v) => recordTransfer({ fromCode: v.fromCode, toCode: v.toCode, amountCents: toCents(v.amount), note: v.note, date: v.date }),
    impact: (c) => `Move ${formatUSD(c)} between accounts · No profit or equity change`,
  },
  {
    key: "equipment",
    label: "Buy equipment",
    needs: ["cash", "amount"],
    run: (v) => recordEquipmentPurchase({ cashCode: v.cashCode, amountCents: toCents(v.amount), note: v.note, date: v.date }),
    impact: (c) => `Cash −${formatUSD(c)} · Equipment +${formatUSD(c)} · No profit change (it's an asset)`,
  },
  {
    key: "prepay",
    label: "Prepay show/grading",
    needs: ["cash", "prepaid", "amount"],
    run: (v) => recordPrepay({ cashCode: v.cashCode, prepaidCode: v.prepaidCode, amountCents: toCents(v.amount), note: v.note, date: v.date }),
    impact: (c) => `Cash −${formatUSD(c)} · Prepaid +${formatUSD(c)} · Becomes an expense when you apply it`,
  },
  {
    key: "applyPrepaid",
    label: "Apply prepaid",
    needs: ["prepaid", "expense", "amount"],
    run: (v) => applyPrepaid({ prepaidCode: v.prepaidCode, expenseAccountId: v.expenseId, amountCents: toCents(v.amount), note: v.note, date: v.date }),
    impact: (c) => `Prepaid −${formatUSD(c)} · Expense +${formatUSD(c)} · Net profit −${formatUSD(c)}`,
  },
  {
    key: "reconcile",
    label: "Reconcile cash",
    needs: ["cash", "actual"],
    run: (v) => reconcileCash({ cashCode: v.cashCode, actualCents: toCents(v.actual), note: v.note, date: v.date }),
    impact: (_c, v) => `Adjusts the account to your counted total of ${formatUSD(toCents(v.actual))} (a reason is required).`,
  },
];

export function CapitalForms({
  cashAccounts,
  expenseAccounts,
  transferAccounts,
  prepaidAccounts,
}: {
  cashAccounts: Acct[];
  expenseAccounts: ExpenseAcct[];
  transferAccounts: Acct[];
  prepaidAccounts: Acct[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [activeKey, setActiveKey] = useState(ACTIONS[0].key);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [v, setV] = useState<Vals>({
    amount: "",
    actual: "",
    cashCode: cashAccounts[0]?.code ?? "",
    expenseId: expenseAccounts[0]?.id ?? "",
    fromCode: transferAccounts[0]?.code ?? "",
    toCode: transferAccounts[1]?.code ?? transferAccounts[0]?.code ?? "",
    prepaidCode: prepaidAccounts[0]?.code ?? "",
    note: "",
    date: "",
  });
  const set = (patch: Partial<Vals>) => setV((p) => ({ ...p, ...patch }));

  const action = ACTIONS.find((a) => a.key === activeKey)!;
  const cents = toCents(v.amount);
  const preview = useMemo(
    () => action.impact(cents, v, cashAccounts),
    [action, cents, v, cashAccounts],
  );

  function submit() {
    setError(null);
    setNotice(null);
    if (action.needs.includes("amount") && cents <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (action.key === "reconcile" && !v.note.trim()) {
      setError("Enter a reason for the reconciliation adjustment.");
      return;
    }
    start(async () => {
      const res = await action.run(v);
      if (!res.ok) setError(res.error);
      else {
        setNotice(res.message ?? `${action.label} recorded.`);
        set({ amount: "", actual: "", note: "" });
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div className="flex flex-wrap gap-2">
          {ACTIONS.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => { setActiveKey(a.key); setError(null); setNotice(null); }}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                a.key === activeKey
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {action.needs.includes("cash") ? (
            <div>
              <Label className="mb-1 block text-xs">Account</Label>
              <Select value={v.cashCode} onChange={(e) => set({ cashCode: e.target.value })}>
                {cashAccounts.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
              </Select>
            </div>
          ) : null}
          {action.needs.includes("from") ? (
            <div>
              <Label className="mb-1 block text-xs">From</Label>
              <Select value={v.fromCode} onChange={(e) => set({ fromCode: e.target.value })}>
                {transferAccounts.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
              </Select>
            </div>
          ) : null}
          {action.needs.includes("to") ? (
            <div>
              <Label className="mb-1 block text-xs">To</Label>
              <Select value={v.toCode} onChange={(e) => set({ toCode: e.target.value })}>
                {transferAccounts.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
              </Select>
            </div>
          ) : null}
          {action.needs.includes("prepaid") ? (
            <div>
              <Label className="mb-1 block text-xs">Prepaid bucket</Label>
              <Select value={v.prepaidCode} onChange={(e) => set({ prepaidCode: e.target.value })}>
                {prepaidAccounts.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
              </Select>
            </div>
          ) : null}
          {action.needs.includes("expense") ? (
            <div>
              <Label className="mb-1 block text-xs">Category</Label>
              <Select value={v.expenseId} onChange={(e) => set({ expenseId: e.target.value })}>
                {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </div>
          ) : null}
          {action.needs.includes("amount") ? (
            <div>
              <Label className="mb-1 block text-xs">Amount ($)</Label>
              <Input type="number" step="0.01" value={v.amount} onChange={(e) => set({ amount: e.target.value })} />
            </div>
          ) : null}
          {action.needs.includes("actual") ? (
            <div>
              <Label className="mb-1 block text-xs">Counted total ($)</Label>
              <Input type="number" step="0.01" value={v.actual} onChange={(e) => set({ actual: e.target.value })} />
            </div>
          ) : null}
          <div>
            <Label className="mb-1 block text-xs">Date</Label>
            <Input type="date" value={v.date} onChange={(e) => set({ date: e.target.value })} />
          </div>
          <div className={action.needs.includes("expense") ? "sm:col-span-2 lg:col-span-4" : "sm:col-span-2"}>
            <Label className="mb-1 block text-xs">{action.key === "reconcile" ? "Reason *" : "Note"}</Label>
            <Input value={v.note} onChange={(e) => set({ note: e.target.value })} placeholder={action.key === "reconcile" ? "Why the count differs…" : "Optional"} />
          </div>
        </div>

        {action.warn ? (
          <p className="flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {action.warn}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2">
          <span className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Impact: </span>
            {preview}
          </span>
          <Button size="sm" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {action.label}
          </Button>
        </div>

        {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{notice}</p> : null}
      </CardContent>
    </Card>
  );
}
