"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toCents, formatUSD } from "@/lib/money";
import { AssetCombobox } from "@/components/flows/asset-combobox";
import type { PickableAsset } from "@/components/flows/types";
import { addLotItem, removeLotItem, settleLot, cancelLot, deleteLot } from "../actions";

export interface LotItemView {
  id: string;
  assetId: string;
  name: string;
  subtitle: string;
  basisCents: number;
  marketCents: number;
  quantity: number;
}
export interface LotView {
  id: string;
  name: string;
  source: string;
  status: string;
  grossCents: number | null;
  netCents: number | null;
  saleTransactionId: string | null;
  items: LotItemView[];
  totalBasisCents: number;
  totalMarketCents: number;
  unitCount: number;
}

export function LotDetail({ lot, assets }: { lot: LotView; assets: PickableAsset[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pickerKey, setPickerKey] = useState(0);

  const [gross, setGross] = useState("");
  const [net, setNet] = useState("");
  const [date, setDate] = useState("");
  const [buyer, setBuyer] = useState("");
  const [notes, setNotes] = useState("");

  const open = lot.status === "Open";
  const run = (fn: () => Promise<{ ok: boolean; error?: string; id?: string }>, after?: (id?: string) => void) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Failed");
      else { after?.(res.id); router.refresh(); }
    });
  };

  const grossC = toCents(gross);
  const netC = toCents(net);
  const feesC = Math.max(0, grossC - netC);
  const profitC = netC - lot.totalBasisCents;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/lots" className="text-sm text-muted-foreground hover:underline">← All lots</Link>
        <Badge variant={lot.status === "Sold" ? "success" : lot.status === "Cancelled" ? "muted" : "outline"}>{lot.status}</Badge>
        <span className="text-sm text-muted-foreground">{lot.source}</span>
      </div>

      {/* Add cards */}
      {open ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Add cards to the lot</CardTitle></CardHeader>
          <CardContent>
            <AssetCombobox
              key={pickerKey}
              assets={assets}
              value=""
              onSelect={(a) => run(() => addLotItem({ lotId: lot.id, assetId: a.id, quantity: 1 }), () => setPickerKey((k) => k + 1))}
              placeholder="Search inventory to add…"
            />
          </CardContent>
        </Card>
      ) : null}

      {/* Items */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">{lot.unitCount} card{lot.unitCount === 1 ? "" : "s"} in this lot</CardTitle>
          <span className="text-sm text-muted-foreground">
            Cost basis <span className="font-medium text-foreground tnum">{formatUSD(lot.totalBasisCents)}</span> · Market <span className="tnum">{formatUSD(lot.totalMarketCents)}</span>
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Card</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Basis</TableHead>
                <TableHead className="text-right">Market</TableHead>
                {open ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lot.items.length === 0 ? (
                <TableRow><TableCell colSpan={open ? 5 : 4} className="py-8 text-center text-muted-foreground">No cards yet — add some above.</TableCell></TableRow>
              ) : lot.items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>
                    <div className="font-medium">{it.name}</div>
                    <div className="text-xs text-muted-foreground">{it.subtitle}</div>
                  </TableCell>
                  <TableCell className="text-right tnum">{it.quantity}</TableCell>
                  <TableCell className="text-right tnum text-muted-foreground">{formatUSD(it.basisCents * it.quantity)}</TableCell>
                  <TableCell className="text-right tnum">{formatUSD(it.marketCents * it.quantity)}</TableCell>
                  {open ? (
                    <TableCell className="text-right">
                      <button type="button" title="Remove" className="text-muted-foreground hover:text-destructive" disabled={pending}
                        onClick={() => run(() => removeLotItem(it.id))}><X className="size-4" /></button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Settle (open) or result (sold) */}
      {open ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Settle the lot</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div><Label className="mb-1 block text-xs">Total sales ($, gross)</Label><Input type="number" step="0.01" value={gross} onChange={(e) => setGross(e.target.value)} /></div>
              <div><Label className="mb-1 block text-xs">Payout after fees ($, net)</Label><Input type="number" step="0.01" value={net} onChange={(e) => setNet(e.target.value)} /></div>
              <div><Label className="mb-1 block text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div><Label className="mb-1 block text-xs">Buyer (optional)</Label><Input value={buyer} onChange={(e) => setBuyer(e.target.value)} /></div>
              <div className="sm:col-span-2 lg:col-span-4"><Label className="mb-1 block text-xs">Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>
            </div>

            <div className="grid gap-3 rounded-md bg-muted/50 p-4 sm:grid-cols-4">
              <Fig label="Fees" value={formatUSD(feesC)} />
              <Fig label="Cost basis" value={formatUSD(lot.totalBasisCents)} />
              <Fig label="Net payout" value={formatUSD(netC)} />
              <Fig label="Profit" value={`${profitC >= 0 ? "+" : "−"}${formatUSD(Math.abs(profitC))}`} tone={profitC >= 0 ? "text-success" : "text-destructive"} />
            </div>

            <div className="flex flex-wrap justify-between gap-2">
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => { if (confirm("Cancel this lot? Cards stay in inventory.")) run(() => cancelLot(lot.id), () => router.push("/lots")); }}>Cancel lot</Button>
                {lot.items.length === 0 ? (
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => deleteLot(lot.id), () => router.push("/lots"))}><Trash2 className="size-4" /> Delete</Button>
                ) : null}
              </div>
              <Button
                disabled={pending || lot.items.length === 0 || netC <= 0}
                onClick={() => run(
                  () => settleLot({ lotId: lot.id, grossCents: grossC || netC, netCents: netC, date: date || undefined, buyer: buyer || undefined, notes: notes || undefined }),
                  (id) => { if (id) router.push(`/transactions/${id}`); },
                )}
              >
                {pending ? <Loader2 className="animate-spin" /> : null} Record lot sale
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : lot.status === "Sold" ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Sold</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 rounded-md bg-muted/50 p-4 sm:grid-cols-5">
              <Fig label="Gross" value={formatUSD(lot.grossCents ?? 0)} />
              <Fig label="Fees" value={formatUSD(Math.max(0, (lot.grossCents ?? 0) - (lot.netCents ?? 0)))} />
              <Fig label="Net payout" value={formatUSD(lot.netCents ?? 0)} />
              <Fig label="Cost basis" value={formatUSD(lot.totalBasisCents)} />
              <Fig label="Profit" value={`${(lot.netCents ?? 0) - lot.totalBasisCents >= 0 ? "+" : "−"}${formatUSD(Math.abs((lot.netCents ?? 0) - lot.totalBasisCents))}`} tone={(lot.netCents ?? 0) - lot.totalBasisCents >= 0 ? "text-success" : "text-destructive"} />
            </div>
            {lot.saleTransactionId ? (
              <Link href={`/transactions/${lot.saleTransactionId}`} className="text-sm text-primary hover:underline">View the sale in the ledger →</Link>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function Fig({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-xl font-bold tnum", tone)}>{value}</div>
    </div>
  );
}
