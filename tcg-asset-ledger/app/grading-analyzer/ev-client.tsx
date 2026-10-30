"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Plus, Loader2, Trash2, Upload, Settings2, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toCents } from "@/lib/money";
import { evaluateCard, type EvConfig, type CardInputs, type Verdict } from "@/lib/grading-ev";
import { type GradeCardView } from "@/lib/grading-ev-db";
import { addGradeCard, addSnapshot, deleteGradeCard, saveGradingConfigAction, importGradeCards, searchCandidates } from "./ev-actions";
import { type GradedQuote } from "@/lib/price-sources";

interface SourceStatus { configured: boolean; name: string | null; candidates: string[] }

const GAMES = ["Pokemon", "One Piece", "Sports", "Other"] as const;
const usd = (n: number | null | undefined) => (n == null ? "—" : `$${n.toFixed(2)}`);
const pct = (r: number | null | undefined) => (r == null ? "—" : `${(r * 100).toFixed(0)}%`);
const num = (c: number | null | undefined) => (c == null ? "" : (c / 100).toString());

const verdictBadge: Record<Verdict, "success" | "warning" | "muted"> = { BUY: "success", WATCH: "warning", PASS: "muted" };
const WARNING_LABELS: Record<string, string> = {
  upcharge_risk: "declared value over tier cap",
  insurance_surcharge: "DV insurance surcharge",
  fee_dominated: "fee-dominated (cheap slab)",
  estimated_psa8: "PSA 8 estimated",
};

interface FormState {
  name: string; game: string; set: string; cardNumber: string; language: string;
  raw: string; psa10: string; psa9: string; psa8: string; gem: string; sales30d: string; targetRoi: string;
}
const emptyForm = (): FormState => ({ name: "", game: "One Piece", set: "", cardNumber: "", language: "EN", raw: "", psa10: "", psa9: "", psa8: "", gem: "", sales30d: "", targetRoi: "" });

export function EvClient({ cards, config, source }: { cards: GradeCardView[]; config: EvConfig; source: SourceStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Candidate search (graded-price API)
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<GradedQuote[]>([]);

  function runSearch() {
    setError(null); setResults([]);
    if (!searchQ.trim()) return;
    setSearching(true);
    (async () => {
      const res = await searchCandidates(searchQ);
      setSearching(false);
      if (!res.ok) setError(res.error);
      else setResults(res.quotes);
    })();
  }

  function useQuote(qt: GradedQuote) {
    const g = /pok[eé]mon/i.test(qt.console ?? "") ? "Pokemon" : /one piece/i.test(qt.console ?? "") ? "One Piece" : f.game;
    setEditingId(null);
    setF({
      ...emptyForm(),
      name: qt.productName, game: g, set: qt.console ?? "", language: "EN",
      raw: qt.rawCents != null ? (qt.rawCents / 100).toString() : "",
      psa10: qt.psa10Cents != null ? (qt.psa10Cents / 100).toString() : "",
      psa9: qt.psa9Cents != null ? (qt.psa9Cents / 100).toString() : "",
      gem: "",
    });
    setNotice(`Prices filled from ${qt.sourceName}. Add the real gem rate, then save.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Filters
  const [game, setGame] = useState("all");
  const [verdict, setVerdict] = useState("all");
  const [minRoi, setMinRoi] = useState("");
  const [q, setQ] = useState("");

  // Add / quick-check form
  const [f, setF] = useState<FormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const set = (patch: Partial<FormState>) => setF((p) => ({ ...p, ...patch }));

  // Config panel
  const [cfgOpen, setCfgOpen] = useState(false);

  const gemPctEff = f.gem.trim() !== "" ? Number(f.gem) || 0 : (config.defaultGemByGame[f.game] ?? 0) * 100;
  const liveInputs: CardInputs | null = useMemo(() => {
    const raw = toCents(f.raw), p10 = toCents(f.psa10);
    if (raw <= 0 || p10 <= 0 || gemPctEff <= 0) return null;
    return {
      rawPrice: raw / 100,
      psa10Price: p10 / 100,
      psa9Price: f.psa9.trim() === "" ? null : toCents(f.psa9) / 100,
      psa8Price: f.psa8.trim() === "" ? null : toCents(f.psa8) / 100,
      gemRate: gemPctEff / 100,
      sales30d: f.sales30d.trim() === "" ? null : Number(f.sales30d),
      dataAgeDays: 0,
    };
  }, [f, gemPctEff]);

  const liveResult = useMemo(() => {
    if (!liveInputs) return null;
    const cfg = f.targetRoi.trim() !== "" ? { ...config, targetRoiFloor: (Number(f.targetRoi) || 0) / 100 } : config;
    return evaluateCard(liveInputs, cfg);
  }, [liveInputs, config, f.targetRoi]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = cards.filter((c) => {
      if (game !== "all" && c.game !== game) return false;
      if (verdict !== "all" && c.result?.verdict !== verdict) return false;
      if (minRoi.trim() !== "" && (c.result?.roi ?? -Infinity) < Number(minRoi) / 100) return false;
      if (needle && ![c.name, c.set ?? "", c.cardNumber ?? "", c.language].some((s) => s.toLowerCase().includes(needle))) return false;
      return true;
    });
    const rank = (v?: Verdict) => (v === "BUY" ? 0 : v === "WATCH" ? 1 : v === "PASS" ? 2 : 3);
    return out.sort((a, b) => {
      const ra = rank(a.result?.verdict), rb = rank(b.result?.verdict);
      if (ra !== rb) return ra - rb;
      return (b.result?.roi ?? -Infinity) - (a.result?.roi ?? -Infinity);
    });
  }, [cards, game, verdict, minRoi, q]);

  const counts = useMemo(() => {
    const c = { BUY: 0, WATCH: 0, PASS: 0 };
    for (const card of cards) if (card.result) c[card.result.verdict]++;
    return c;
  }, [cards]);

  function payloadFromForm() {
    return {
      name: f.name, game: f.game, set: f.set || null, cardNumber: f.cardNumber || null, language: f.language,
      rawCents: toCents(f.raw), psa10Cents: toCents(f.psa10),
      psa9Cents: f.psa9.trim() === "" ? null : toCents(f.psa9),
      psa8Cents: f.psa8.trim() === "" ? null : toCents(f.psa8),
      sales30d: f.sales30d.trim() === "" ? null : Number(f.sales30d),
      gemPct: f.gem.trim() === "" ? null : Number(f.gem),
      targetRoiPct: f.targetRoi.trim() === "" ? null : Math.round(Number(f.targetRoi)),
      source: "manual",
    };
  }

  function save() {
    setError(null); setNotice(null);
    if (!f.name.trim()) { setError("Card name is required."); return; }
    if (toCents(f.psa10) <= 0) { setError("PSA 10 price drives the whole calc — enter it."); return; }
    start(async () => {
      const res = editingId
        ? await addSnapshot({ cardId: editingId, rawCents: toCents(f.raw), psa10Cents: toCents(f.psa10), psa9Cents: f.psa9.trim() === "" ? null : toCents(f.psa9), psa8Cents: f.psa8.trim() === "" ? null : toCents(f.psa8), sales30d: f.sales30d.trim() === "" ? null : Number(f.sales30d), gemPct: f.gem.trim() === "" ? null : Number(f.gem), source: "manual" })
        : await addGradeCard(payloadFromForm());
      if (!res.ok) setError(res.error);
      else { setNotice(editingId ? "New price recorded." : "Added to plays."); setF(emptyForm()); setEditingId(null); router.refresh(); }
    });
  }

  function reprice(c: GradeCardView) {
    setEditingId(c.id);
    setF({
      name: c.name, game: c.game, set: c.set ?? "", cardNumber: c.cardNumber ?? "", language: c.language,
      raw: num(c.rawCents), psa10: num(c.psa10Cents), psa9: num(c.psa9Cents), psa8: num(c.psa8Cents),
      gem: c.gemRate != null ? String(Math.round(c.gemRate * 100)) : "", sales30d: c.sales30d != null ? String(c.sales30d) : "", targetRoi: c.targetRoiPct != null ? String(c.targetRoiPct) : "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => { const r = await fn(); if (!r.ok) setError(r.error ?? "Failed"); else router.refresh(); });
  }

  function importCsv(file: File) {
    setError(null); setNotice(null);
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (result) => {
        const fields = result.meta.fields ?? [];
        if (!fields.includes("card_name") && !fields.includes("name")) { setError('CSV needs a "card_name" column.'); return; }
        const rows = (result.data as Record<string, string>[]).map((r) => ({
          name: (r.card_name ?? r.name ?? "").trim(),
          game: r.game || "One Piece",
          set: r.set_code || r.set || null,
          cardNumber: r.card_number || null,
          language: (r.language || "EN").toUpperCase().startsWith("J") ? "JP" : "EN",
          rawCents: toCents(r.raw_price ?? "0"),
          psa10Cents: toCents(r.psa10_price ?? "0"),
          psa9Cents: r.psa9_price?.trim() ? toCents(r.psa9_price) : null,
          psa8Cents: r.psa8_price?.trim() ? toCents(r.psa8_price) : null,
          sales30d: r.sales_30d?.trim() ? Math.round(Number(r.sales_30d)) : null,
          pop10: r.pop10?.trim() ? Math.round(Number(r.pop10)) : null,
          popTotal: r.pop_total?.trim() ? Math.round(Number(r.pop_total)) : null,
          date: r.date || null,
          source: "csv",
        })).filter((r) => r.name && r.psa10Cents > 0);
        start(async () => {
          const res = await importGradeCards(rows);
          if (!res.ok) setError(res.error); else { setNotice(`Imported — ${res.id}`); router.refresh(); }
        });
      },
    });
  }

  return (
    <div className="space-y-6">
      {/* Summary + toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="success">BUY {counts.BUY}</Badge>
        <Badge variant="warning">WATCH {counts.WATCH}</Badge>
        <Badge variant="muted">PASS {counts.PASS}</Badge>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCfgOpen((o) => !o)}><Settings2 className="size-4" /> Config</Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="size-4" /> CSV</Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) importCsv(file); e.target.value = ""; }} />
        </div>
      </div>

      {cfgOpen ? <ConfigPanel config={config} onSaved={(m) => { setNotice(m); router.refresh(); }} /> : null}

      {/* Find candidates from a graded-price source */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Search className="size-4" /> Find candidates{source.configured ? ` · ${source.name}` : ""}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {source.configured ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Input className="max-w-md flex-1" value={searchQ} placeholder="Search a card or set (e.g. Surging Sparks, Charizard ex)…" onChange={(e) => setSearchQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }} />
                <Button variant="outline" onClick={runSearch} disabled={searching}>{searching ? <Loader2 className="animate-spin" /> : <Search className="size-4" />} Search</Button>
              </div>
              {results.length > 0 ? (
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader><TableRow><TableHead>Card</TableHead><TableHead className="text-right">Raw</TableHead><TableHead className="text-right">PSA 10</TableHead><TableHead className="text-right">PSA 9</TableHead><TableHead /></TableRow></TableHeader>
                    <TableBody>
                      {results.map((qt, i) => (
                        <TableRow key={qt.matchedId ?? i}>
                          <TableCell><div className="font-medium">{qt.productName}</div><div className="text-xs text-muted-foreground">{qt.console}</div></TableCell>
                          <TableCell className="text-right tnum">{usd(qt.rawCents != null ? qt.rawCents / 100 : null)}</TableCell>
                          <TableCell className="text-right tnum">{usd(qt.psa10Cents != null ? qt.psa10Cents / 100 : null)}</TableCell>
                          <TableCell className="text-right tnum">{usd(qt.psa9Cents != null ? qt.psa9Cents / 100 : null)}</TableCell>
                          <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => useQuote(qt)}>Use</Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">Prices fill the form above — add the real gem rate (pop) and save. Verify the PSA 10/9 mapping matches your source on first use.</p>
            </>
          ) : (
            <div className="rounded-md bg-muted/50 p-4 text-sm">
              <p className="font-medium">No price source connected — you&apos;re on manual entry + CSV.</p>
              <p className="mt-1 text-muted-foreground">
                To auto-pull graded prices, add a <code className="rounded bg-card px-1">PRICECHARTING_API_TOKEN</code> environment variable in Vercel
                (Project → Settings → Environment Variables) with a PriceCharting API token, then redeploy. Candidate search will light up here.
                Adapters available: {source.candidates.join(", ")}.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick check / add */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">{editingId ? "Update price" : "Quick check / add a card"}</CardTitle>
          {editingId ? <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setF(emptyForm()); }}><X className="size-4" /> New card</Button> : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="sm:col-span-2"><Label className="mb-1 block text-xs">Card name *</Label><Input value={f.name} disabled={!!editingId} onChange={(e) => set({ name: e.target.value })} placeholder="OP05-119 Nami" /></div>
            <div><Label className="mb-1 block text-xs">Game</Label><Select value={f.game} disabled={!!editingId} onChange={(e) => set({ game: e.target.value })}>{GAMES.map((g) => <option key={g} value={g}>{g}</option>)}</Select></div>
            <div><Label className="mb-1 block text-xs">Language</Label><Select value={f.language} disabled={!!editingId} onChange={(e) => set({ language: e.target.value })}><option value="EN">EN</option><option value="JP">JP</option></Select></div>
            <div><Label className="mb-1 block text-xs">Set</Label><Input value={f.set} disabled={!!editingId} onChange={(e) => set({ set: e.target.value })} /></div>
            <div><Label className="mb-1 block text-xs">Card #</Label><Input value={f.cardNumber} disabled={!!editingId} onChange={(e) => set({ cardNumber: e.target.value })} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div><Label className="mb-1 block text-xs">Raw ($)</Label><Input type="number" step="0.01" value={f.raw} onChange={(e) => set({ raw: e.target.value })} /></div>
            <div><Label className="mb-1 block text-xs">PSA 10 ($) *</Label><Input type="number" step="0.01" value={f.psa10} onChange={(e) => set({ psa10: e.target.value })} /></div>
            <div><Label className="mb-1 block text-xs">PSA 9 ($)</Label><Input type="number" step="0.01" value={f.psa9} onChange={(e) => set({ psa9: e.target.value })} /></div>
            <div><Label className="mb-1 block text-xs">PSA 8 ($)</Label><Input type="number" step="0.01" value={f.psa8} onChange={(e) => set({ psa8: e.target.value })} placeholder="est. if blank" /></div>
            <div><Label className="mb-1 block text-xs">Gem rate (%)</Label><Input type="number" step="1" value={f.gem} onChange={(e) => set({ gem: e.target.value })} placeholder={config.defaultGemByGame[f.game] != null ? `${Math.round(config.defaultGemByGame[f.game] * 100)}% (${f.game} default)` : "PSA 10 %"} /></div>
            <div><Label className="mb-1 block text-xs">Sales / 30d</Label><Input type="number" value={f.sales30d} onChange={(e) => set({ sales30d: e.target.value })} /></div>
          </div>

          {/* Live verdict */}
          {liveResult ? (
            <div className={cn("rounded-md border p-4", liveResult.verdict === "BUY" ? "border-success/40 bg-success/10" : liveResult.verdict === "WATCH" ? "border-warning/40 bg-warning/10" : "border-border bg-muted/50")}>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                <Badge variant={verdictBadge[liveResult.verdict]}>{liveResult.verdict}</Badge>
                <span className="text-sm tnum">ROI <b>{pct(liveResult.roi)}</b></span>
                <span className="text-sm tnum">Max buy <b>{usd(liveResult.maxBuyAtFloor)}</b></span>
                <span className="text-sm tnum text-muted-foreground">Break-even gem {pct(liveResult.breakevenGem)} · your gem {pct(liveInputs!.gemRate)}{f.gem.trim() === "" ? " (default)" : ""} · margin {(liveResult.gemMargin * 100).toFixed(0)}pts</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{liveResult.reason}{liveResult.warnings.length ? ` · ⚠ ${liveResult.warnings.map((w) => WARNING_LABELS[w] ?? w).join(", ")}` : ""}</p>
            </div>
          ) : <p className="text-xs text-muted-foreground">Enter raw, PSA 10, and a gem rate to see the verdict.</p>}

          <div className="flex items-center gap-2">
            <div className="w-40"><Label className="mb-1 block text-xs">Target ROI override (%)</Label><Input type="number" value={f.targetRoi} onChange={(e) => set({ targetRoi: e.target.value })} placeholder={`${Math.round(config.targetRoiFloor * 100)}`} /></div>
            <Button className="ml-auto" onClick={save} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Plus />}{editingId ? "Save new price" : "Add to plays"}</Button>
          </div>

          {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          {notice ? <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{notice}</p> : null}
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          {[["all", "All games"], ["Pokemon", "Pokémon"], ["One Piece", "One Piece"]].map(([v, l]) => (
            <button key={v} onClick={() => setGame(v)} className={cn("px-3 py-1.5 text-xs font-medium", game === v ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent")}>{l}</button>
          ))}
        </div>
        <Select value={verdict} onChange={(e) => setVerdict(e.target.value)} className="w-36"><option value="all">All verdicts</option><option value="BUY">BUY</option><option value="WATCH">WATCH</option><option value="PASS">PASS</option></Select>
        <Input className="w-28" type="number" placeholder="Min ROI %" value={minRoi} onChange={(e) => setMinRoi(e.target.value)} />
        <Input className="max-w-xs flex-1" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {/* Dashboard */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Card</TableHead>
                <TableHead className="text-right">Raw</TableHead>
                <TableHead className="text-right">All-in</TableHead>
                <TableHead className="text-right">Net 10</TableHead>
                <TableHead className="text-right">Gem</TableHead>
                <TableHead className="text-right">B/E</TableHead>
                <TableHead className="text-right">ROI</TableHead>
                <TableHead className="text-right">Max buy</TableHead>
                <TableHead className="text-right">30d</TableHead>
                <TableHead>Verdict</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="py-10 text-center text-muted-foreground">No cards match — add one above or import a CSV.</TableCell></TableRow>
              ) : rows.map((c) => {
                const r = c.result;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-[220px]">
                      <button className="text-left font-medium hover:underline" title="Update its price" onClick={() => reprice(c)}>{c.name}</button>
                      <div className="text-xs text-muted-foreground">{[c.game, c.language, c.set, c.cardNumber ? `#${c.cardNumber}` : null].filter(Boolean).join(" · ")}{c.dataAgeDays != null && c.dataAgeDays > config.staleDays ? ` · ${c.dataAgeDays}d old` : ""}</div>
                    </TableCell>
                    <TableCell className="text-right tnum">{usd(c.rawCents != null ? c.rawCents / 100 : null)}</TableCell>
                    <TableCell className="text-right tnum text-muted-foreground">{usd(r?.allIn)}</TableCell>
                    <TableCell className="text-right tnum">{usd(r?.net10)}</TableCell>
                    <TableCell className="text-right tnum">{pct(c.gemRate)}{c.gemIsDefault ? <span className="ml-0.5 text-[10px] text-muted-foreground">def</span> : null}</TableCell>
                    <TableCell className="text-right tnum text-muted-foreground">{pct(r?.breakevenGem)}</TableCell>
                    <TableCell className={cn("text-right tnum font-medium", r && r.roi >= 0 ? "text-success" : r ? "text-destructive" : "")}>{r ? pct(r.roi) : "—"}</TableCell>
                    <TableCell className="text-right tnum">{usd(r?.maxBuyAtFloor)}</TableCell>
                    <TableCell className={cn("text-right tnum", (c.sales30d ?? 0) < config.liquidityFloorSales30d ? "text-warning" : "")}>{c.sales30d ?? "—"}</TableCell>
                    <TableCell>
                      {r ? <Badge variant={verdictBadge[r.verdict]} title={r.reason}>{r.verdict}</Badge> : <Badge variant="outline">needs gem</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <button className="text-muted-foreground hover:text-destructive" title="Delete" disabled={pending} onClick={() => { if (confirm(`Delete "${c.name}"?`)) act(() => deleteGradeCard(c.id)); }}><Trash2 className="size-4" /></button>
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

function ConfigPanel({ config, onSaved }: { config: EvConfig; onSaved: (m: string) => void }) {
  const [pending, start] = useTransition();
  const [d, setD] = useState({
    gradingFee: String(config.gradingFee), shippingOut: String(config.shippingOut), shippingInPerCard: String(config.shippingInPerCard),
    marketplaceFeeRate: String(config.marketplaceFeeRate), targetRoiFloor: String(config.targetRoiFloor), gemMarginFloor: String(config.gemMarginFloor),
    downsideRecoveryFloor: String(config.downsideRecoveryFloor), liquidityFloorSales30d: String(config.liquidityFloorSales30d), staleDays: String(config.staleDays),
    opGem: String(Math.round((config.defaultGemByGame["One Piece"] ?? 0.75) * 100)), pokeGem: String(Math.round((config.defaultGemByGame["Pokemon"] ?? 0.4) * 100)),
  });
  const upd = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement>) => setD((p) => ({ ...p, [k]: e.target.value }));
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Config (fees & thresholds)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <F label="Grading fee ($)" value={d.gradingFee} onChange={upd("gradingFee")} />
          <F label="Ship out ($)" value={d.shippingOut} onChange={upd("shippingOut")} />
          <F label="Ship in / card ($)" value={d.shippingInPerCard} onChange={upd("shippingInPerCard")} />
          <F label="Marketplace fee (0-1)" value={d.marketplaceFeeRate} onChange={upd("marketplaceFeeRate")} />
          <F label="Target ROI floor (0-1)" value={d.targetRoiFloor} onChange={upd("targetRoiFloor")} />
          <F label="Gem margin floor (0-1)" value={d.gemMarginFloor} onChange={upd("gemMarginFloor")} />
          <F label="Downside recovery (0-1)" value={d.downsideRecoveryFloor} onChange={upd("downsideRecoveryFloor")} />
          <F label="Liquidity floor (sales/30d)" value={d.liquidityFloorSales30d} onChange={upd("liquidityFloorSales30d")} />
          <F label="Stale days" value={d.staleDays} onChange={upd("staleDays")} />
          <F label="One Piece default gem (%)" value={d.opGem} onChange={upd("opGem")} />
          <F label="Pokémon default gem (%)" value={d.pokeGem} onChange={upd("pokeGem")} />
        </div>
        <Button size="sm" disabled={pending} onClick={() => start(async () => {
          const res = await saveGradingConfigAction({
            gradingFee: Number(d.gradingFee), shippingOut: Number(d.shippingOut), shippingInPerCard: Number(d.shippingInPerCard),
            marketplaceFeeRate: Number(d.marketplaceFeeRate), targetRoiFloor: Number(d.targetRoiFloor), gemMarginFloor: Number(d.gemMarginFloor),
            downsideRecoveryFloor: Number(d.downsideRecoveryFloor), liquidityFloorSales30d: Math.round(Number(d.liquidityFloorSales30d)), staleDays: Math.round(Number(d.staleDays)),
            defaultGemByGame: { "One Piece": (Number(d.opGem) || 0) / 100, Pokemon: (Number(d.pokeGem) || 0) / 100 },
          });
          if (res.ok) onSaved("Config saved.");
        })}>{pending ? <Loader2 className="animate-spin" /> : null} Save config</Button>
      </CardContent>
    </Card>
  );
}

function F({ label, value, onChange }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return <div><Label className="mb-1 block text-xs">{label}</Label><Input type="number" step="0.01" value={value} onChange={onChange} /></div>;
}
