"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toCents, formatUSD } from "@/lib/money";
import { DEFAULT_ACCOUNTS } from "@/lib/accounting-math";
import { setupCapital } from "../actions";

const CASH_ACCOUNTS = DEFAULT_ACCOUNTS.filter((a) => a.isCash);

export function SetupWizard() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const [date, setDate] = useState(iso);
  const [cash, setCash] = useState<Record<string, string>>({});
  const [inventory, setInventory] = useState("");
  const [equipment, setEquipment] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [liabilities, setLiabilities] = useState("");
  const [ownerCapital, setOwnerCapital] = useState("");

  const totals = useMemo(() => {
    const cashTotal = CASH_ACCOUNTS.reduce((s, a) => s + toCents(cash[a.code] ?? ""), 0);
    const assets = cashTotal + toCents(inventory) + toCents(equipment) + toCents(dueFrom);
    const liab = toCents(liabilities);
    return { cashTotal, assets, liab, equity: assets - liab };
  }, [cash, inventory, equipment, dueFrom, liabilities]);

  function submit() {
    setError(null);
    const cashCents: Record<string, number> = {};
    for (const a of CASH_ACCOUNTS) {
      const c = toCents(cash[a.code] ?? "");
      if (c > 0) cashCents[a.code] = c;
    }
    start(async () => {
      const res = await setupCapital({
        effectiveDate: date,
        cash: cashCents,
        inventoryBasisCents: toCents(inventory),
        equipmentCents: toCents(equipment),
        dueFromOwnerCents: toCents(dueFrom),
        liabilitiesCents: toCents(liabilities),
        ownerContributionCents: toCents(ownerCapital),
      });
      if (!res.ok) setError(res.error);
      else router.push("/capital");
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Starting balances</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="max-w-xs">
            <Label className="mb-1 block text-xs">Effective date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cash by account</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {CASH_ACCOUNTS.map((a) => (
                <div key={a.code}>
                  <Label className="mb-1 block text-xs">{a.name} ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={cash[a.code] ?? ""}
                    onChange={(e) => setCash((c) => ({ ...c, [a.code]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">What you already own</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="mb-1 block text-xs">Inventory cost basis ($)</Label>
                <Input type="number" step="0.01" value={inventory} onChange={(e) => setInventory(e.target.value)} placeholder="What your current inventory cost you" />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Equipment / gear ($)</Label>
                <Input type="number" step="0.01" value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="Printer, cases, camera…" />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Owner owes business ($)</Label>
                <Input type="number" step="0.01" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Outstanding business bills ($)</Label>
                <Input type="number" step="0.01" value={liabilities} onChange={(e) => setLiabilities(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="max-w-xs">
            <Label className="mb-1 block text-xs">Of the equity below, starting owner capital ($, optional)</Label>
            <Input type="number" step="0.01" value={ownerCapital} onChange={(e) => setOwnerCapital(e.target.value)} placeholder="How much you personally put in" />
            <p className="mt-1 text-xs text-muted-foreground">The rest is booked to Opening Balance Equity.</p>
          </div>

          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Cash total" value={formatUSD(totals.cashTotal)} />
          <Row label="Inventory basis" value={formatUSD(toCents(inventory))} />
          <Row label="Equipment" value={formatUSD(toCents(equipment))} />
          <Row label="Due from owner" value={formatUSD(toCents(dueFrom))} />
          <div className="border-t border-border pt-2">
            <Row label="Total assets" value={formatUSD(totals.assets)} strong />
          </div>
          <Row label="− Liabilities" value={formatUSD(totals.liab)} />
          <div className="border-t border-border pt-2">
            <Row label="Net business equity" value={formatUSD(totals.equity)} strong tone={totals.equity >= 0 ? "text-success" : "text-destructive"} />
          </div>
          <Button className="mt-3 w-full" onClick={submit} disabled={pending || totals.assets <= 0}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Post opening balances
          </Button>
          <p className="text-center text-xs text-muted-foreground">You can adjust later with a reconciliation or reversal.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span className={`tnum ${strong ? "font-semibold" : ""} ${tone ?? ""}`}>{value}</span>
    </div>
  );
}
