"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Check, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toCents, formatUSD } from "@/lib/money";
import { COMMITMENT_CATEGORIES, COMMITMENT_CATEGORY_LABELS } from "@/lib/commitments";
import { addCommitment, setCommitmentStatus, deleteCommitment } from "../actions";

export interface CommitmentView {
  id: string;
  name: string;
  category: string;
  totalCents: number;
  depositPaidCents: number;
  dueDate: string | null;
  status: string;
  notes: string | null;
}

const remaining = (c: CommitmentView) => Math.max(0, c.totalCents - c.depositPaidCents);

function dueMeta(dueISO: string | null): { label: string; tone: string } {
  if (!dueISO) return { label: "—", tone: "text-muted-foreground" };
  const due = new Date(dueISO);
  const days = Math.floor((due.getTime() - Date.now()) / 86400000);
  const label = due.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (days < 0) return { label: `${label} · overdue`, tone: "text-destructive" };
  if (days <= 14) return { label: `${label} · ${days}d`, tone: "text-warning" };
  return { label, tone: "text-muted-foreground" };
}

export function CommitmentsClient({ commitments }: { commitments: CommitmentView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("PreOrder");
  const [total, setTotal] = useState("");
  const [deposit, setDeposit] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const open = commitments.filter((c) => c.status === "Open");
  const closed = commitments.filter((c) => c.status !== "Open");
  const totalRemaining = useMemo(() => open.reduce((s, c) => s + remaining(c), 0), [open]);

  function add() {
    setError(null);
    if (!name.trim()) { setError("Give it a name."); return; }
    if (toCents(total) <= 0) { setError("Enter the total cost."); return; }
    start(async () => {
      const res = await addCommitment({
        name,
        category,
        totalCents: toCents(total),
        depositPaidCents: deposit.trim() === "" ? 0 : toCents(deposit),
        dueDate: dueDate || undefined,
        notes: notes || undefined,
      });
      if (!res.ok) setError(res.error);
      else {
        setName(""); setTotal(""); setDeposit(""); setDueDate(""); setNotes("");
        router.refresh();
      }
    });
  }

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Failed");
      else router.refresh();
    });
  }

  const rows = showClosed ? [...open, ...closed] : open;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Add a commitment</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Label className="mb-1 block text-xs">What is it?</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Prismatic Evolutions ETB ×6 — GameStop" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Type</Label>
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {COMMITMENT_CATEGORIES.map((c) => <option key={c} value={c}>{COMMITMENT_CATEGORY_LABELS[c]}</option>)}
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs">Total cost ($)</Label>
              <Input type="number" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Deposit already paid ($)</Label>
              <Input type="number" step="0.01" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0 for pay-on-ship" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Due / release date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="lg:col-span-2">
              <Label className="mb-1 block text-xs">Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              Remaining balance reserved from buying power: <span className="font-medium text-foreground">{formatUSD(Math.max(0, toCents(total) - (deposit.trim() === "" ? 0 : toCents(deposit))))}</span>
            </span>
            <Button size="sm" onClick={add} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Plus />} Add commitment
            </Button>
          </div>
          {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">
            Commitments <span className="text-sm font-normal text-muted-foreground">· {formatUSD(totalRemaining)} still owed</span>
          </CardTitle>
          {closed.length > 0 ? (
            <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setShowClosed((s) => !s)}>
              {showClosed ? "Hide" : "Show"} fulfilled/cancelled ({closed.length})
            </button>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Commitment</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Deposit</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No commitments — add a pre-order above.</TableCell></TableRow>
              ) : rows.map((c) => {
                const due = dueMeta(c.dueDate);
                const closedRow = c.status !== "Open";
                return (
                  <TableRow key={c.id} className={closedRow ? "opacity-50" : undefined}>
                    <TableCell>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        <Badge variant="outline" className="mr-1">{COMMITMENT_CATEGORY_LABELS[c.category] ?? c.category}</Badge>
                        {closedRow ? c.status : c.notes}
                      </div>
                    </TableCell>
                    <TableCell className={cn("whitespace-nowrap text-xs", due.tone)}>{due.label}</TableCell>
                    <TableCell className="text-right tnum">{formatUSD(c.totalCents)}</TableCell>
                    <TableCell className="text-right tnum text-muted-foreground">{formatUSD(c.depositPaidCents)}</TableCell>
                    <TableCell className="text-right tnum font-semibold">{formatUSD(remaining(c))}</TableCell>
                    <TableCell className="text-right">
                      {c.status === "Open" ? (
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" title="Mark fulfilled (received & paid)" className="text-success hover:opacity-80" disabled={pending}
                            onClick={() => act(() => setCommitmentStatus(c.id, "Fulfilled"))}><Check className="size-4" /></button>
                          <button type="button" title="Cancel this commitment" className="text-muted-foreground hover:text-destructive" disabled={pending}
                            onClick={() => act(() => setCommitmentStatus(c.id, "Cancelled"))}><X className="size-4" /></button>
                        </div>
                      ) : (
                        <button type="button" title="Delete" className="text-muted-foreground hover:text-destructive" disabled={pending}
                          onClick={() => { if (confirm(`Delete "${c.name}"?`)) act(() => deleteCommitment(c.id)); }}><Trash2 className="size-4" /></button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
