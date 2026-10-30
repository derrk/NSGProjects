"use client";

import { useMemo, useState } from "react";
import { Banknote } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toCents, formatUSD } from "@/lib/money";
import { analyzeCard, planLiquidation, DEFAULT_SHIP, type Channel } from "@/lib/sell-channel";

export interface PlannerCard {
  id: string;
  name: string;
  subtitle: string;
  basisCents: number;
  marketCents: number;
  quantity: number;
}

const d = (cents: number) => (cents / 100).toString();

export function SellPlannerClient({ cards }: { cards: PlannerCard[] }) {
  const [tcgFee, setTcgFee] = useState("12");
  const [whatnotFee, setWhatnotFee] = useState("8");
  const [shipThreshold, setShipThreshold] = useState(d(DEFAULT_SHIP.thresholdCents));
  const [shipOver, setShipOver] = useState(d(DEFAULT_SHIP.overCents));
  const [shipUnder, setShipUnder] = useState(d(DEFAULT_SHIP.underCents));
  const [target, setTarget] = useState("");
  const [sort, setSort] = useState("recommended");
  const [filter, setFilter] = useState("all");

  const cfg = useMemo(() => {
    const channels: Channel[] = [
      { key: "show", label: "Show", feePct: 0, ships: false, fast: false },
      { key: "tcgplayer", label: "TCGplayer", feePct: Number(tcgFee) || 0, ships: true, fast: true },
      { key: "whatnot", label: "Whatnot", feePct: Number(whatnotFee) || 0, ships: true, fast: true },
    ];
    const ship = { thresholdCents: toCents(shipThreshold), overCents: toCents(shipOver), underCents: toCents(shipUnder) };
    return { channels, ship };
  }, [tcgFee, whatnotFee, shipThreshold, shipOver, shipUnder]);

  const analyzed = useMemo(
    () => cards.map((c) => ({ card: c, a: analyzeCard(c.basisCents, c.marketCents, cfg) })),
    [cards, cfg],
  );

  const rows = useMemo(() => {
    let out = analyzed;
    if (filter === "sell") out = out.filter((x) => x.a.recommendation.action === "sell");
    if (filter === "hold") out = out.filter((x) => x.a.recommendation.action === "hold");
    const sorted = [...out].sort((x, y) => {
      switch (sort) {
        case "onlineNet":
          return (y.a.bestOnline?.netCents ?? 0) - (x.a.bestOnline?.netCents ?? 0);
        case "profit":
          return (y.a.bestOnline?.profitCents ?? 0) - (x.a.bestOnline?.profitCents ?? 0);
        case "market":
          return y.card.marketCents - x.card.marketCents;
        default: // recommended — sell first, then by online net
          if (x.a.recommendation.action !== y.a.recommendation.action)
            return x.a.recommendation.action === "sell" ? -1 : 1;
          return (y.a.bestOnline?.netCents ?? 0) - (x.a.bestOnline?.netCents ?? 0);
      }
    });
    return sorted;
  }, [analyzed, sort, filter]);

  const plan = useMemo(() => {
    const t = toCents(target);
    if (t <= 0) return null;
    return planLiquidation(cards, t, cfg);
  }, [cards, target, cfg]);

  const channelKeys = cfg.channels.map((c) => c.key);

  return (
    <div className="space-y-6">
      {/* Assumptions */}
      <Card>
        <CardHeader><CardTitle className="text-base">Assumptions</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Field label="TCGplayer fee (%)" value={tcgFee} onChange={setTcgFee} />
          <Field label="Whatnot fee (%)" value={whatnotFee} onChange={setWhatnotFee} />
          <Field label="Ship over ($ price)" value={shipThreshold} onChange={setShipThreshold} />
          <Field label="Shipping if over ($)" value={shipOver} onChange={setShipOver} />
          <Field label="Shipping if under ($)" value={shipUnder} onChange={setShipUnder} />
          <p className="sm:col-span-3 lg:col-span-5 text-xs text-muted-foreground">
            Shows keep 100% (in-person, no fees/shipping) but you wait for the next show. Online = cash in ~2 weeks.
            “Sell” is recommended only when online keeps most of the show profit; otherwise hold for a show.
          </p>
        </CardContent>
      </Card>

      {/* Raise cash */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Banknote className="size-4" /> Need to raise cash fast?</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Target to raise ($)" value={target} onChange={setTarget} placeholder="e.g. 500" />
            <p className="text-xs text-muted-foreground">
              Picks the cards to sell online that hit your target with the least profit given up.
            </p>
          </div>
          {plan ? (
            <div className="rounded-md bg-muted/50 p-3">
              {plan.picks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No cards worth selling online right now.</p>
              ) : (
                <>
                  <div className="mb-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                    <span><span className="font-semibold tnum">{formatUSD(plan.raisedCents)}</span> raised from {plan.picks.length} card{plan.picks.length === 1 ? "" : "s"}</span>
                    <span className="text-muted-foreground">Profit given up vs shows: <span className="tnum">{formatUSD(plan.sacrificedCents)}</span></span>
                    <Badge variant={plan.targetMet ? "success" : "warning"}>
                      {plan.targetMet ? "Target met" : `${formatUSD(Math.max(0, plan.targetCents - plan.raisedCents))} short`}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.picks.map((p) => (
                      <span key={p.id} className="rounded border border-border bg-card px-2 py-1 text-xs" title={`Net ${formatUSD(p.onlineNetCents)} on ${p.channelLabel}`}>
                        {p.name} <span className="text-muted-foreground">· {p.channelLabel} {formatUSD(p.onlineNetCents)}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-48">
          <option value="all">All cards ({analyzed.length})</option>
          <option value="sell">Recommended: sell online</option>
          <option value="hold">Recommended: hold for show</option>
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-52">
          <option value="recommended">Sort: recommended first</option>
          <option value="onlineNet">Sort: highest online net</option>
          <option value="profit">Sort: highest online profit</option>
          <option value="market">Sort: highest market value</option>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Card</TableHead>
                <TableHead className="text-right">Basis</TableHead>
                <TableHead className="text-right">Market</TableHead>
                {cfg.channels.map((c) => <TableHead key={c.key} className="text-right">{c.label} net</TableHead>)}
                <TableHead>Best move</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={4 + channelKeys.length} className="py-10 text-center text-muted-foreground">No cards match.</TableCell></TableRow>
              ) : rows.map(({ card, a }) => (
                <TableRow key={card.id}>
                  <TableCell className="max-w-[240px]">
                    <div className="truncate font-medium">{card.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {card.subtitle}{card.quantity > 1 ? ` · ${card.quantity} in stock (per-unit)` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tnum text-muted-foreground">{formatUSD(card.basisCents)}</TableCell>
                  <TableCell className="text-right tnum">{formatUSD(card.marketCents)}</TableCell>
                  {cfg.channels.map((ch) => {
                    const r = a.perChannel.find((p) => p.key === ch.key)!;
                    const best = a.recommendation.channelKey === ch.key;
                    return (
                      <TableCell key={ch.key} className={cn("text-right tnum", best && "font-semibold")}>
                        {formatUSD(r.netCents)}
                        <span className={cn("ml-1 text-xs", r.profitCents >= 0 ? "text-success" : "text-destructive")}>
                          ({r.profitCents >= 0 ? "+" : "−"}{formatUSD(Math.abs(r.profitCents))})
                        </span>
                      </TableCell>
                    );
                  })}
                  <TableCell className="max-w-[280px]">
                    <Badge variant={a.recommendation.action === "sell" ? "success" : "outline"}>
                      {a.recommendation.action === "sell"
                        ? `Sell · ${a.perChannel.find((p) => p.key === a.recommendation.channelKey)?.label ?? ""}`
                        : "Hold for show"}
                    </Badge>
                    <div className="mt-0.5 text-xs text-muted-foreground">{a.recommendation.reason}</div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <Label className="mb-1 block text-xs">{label}</Label>
      <Input type="number" step="0.01" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-36" />
    </div>
  );
}
