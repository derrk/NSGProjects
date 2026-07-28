"use client";

import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Papa from "papaparse";
import { Plus, Trash2, Download, Upload, Loader2, X, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toCents, formatUSD } from "@/lib/money";
import { AssetCombobox } from "@/components/flows/asset-combobox";
import { marketOf, type PickableAsset } from "@/components/flows/types";
import {
  computePlay,
  buyVsGrade,
  GRADING_COST_DEFAULTS,
  PLAY_STATUSES,
  PLAY_STATUS_LABELS,
  PLAY_PRIORITIES,
  PLAY_PRIORITY_LABELS,
  type PlayStatus,
  type PlayPriority,
  type BuyVsGradeVerdict,
} from "@/lib/grading-play";
import {
  createGradingPlay,
  updateGradingPlay,
  deleteGradingPlay,
  importGradingPlays,
  importCollectrGradingPlays,
} from "@/app/actions";

export interface PlayView {
  id: string;
  assetId: string | null;
  name: string;
  set: string | null;
  cardNumber: string | null;
  variant: string | null;
  notes: string | null;
  rawValueCents: number;
  purchasePriceCents: number | null;
  psa10Cents: number;
  psa9Cents: number | null;
  psa8Cents: number | null;
  bgs10Cents: number | null;
  bgsBlackLabelCents: number | null;
  gemRatePct: number;
  feeCents: number;
  shippingCents: number;
  insuranceCents: number;
  preGradingFeeCents: number;
  game: string | null;
  status: string;
  priority: string;
  psa10Pop: number | null;
  returnedGrade: string | null;
  certNumber: string | null;
  finalSalePriceCents: number | null;
  returnedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const toneClass = { red: "text-destructive", yellow: "text-warning", green: "text-success" } as const;
const toneBadge = {
  red: "destructive",
  yellow: "warning",
  green: "success",
} as const;
const priorityBadge: Record<string, "outline" | "muted" | "warning" | "destructive"> = {
  Low: "muted",
  Medium: "outline",
  High: "warning",
  MustBuy: "destructive",
};
const bvgBadge: Record<BuyVsGradeVerdict, "success" | "outline" | "muted"> = {
  "Grade it": "success",
  "Buy the slab": "outline",
  "Either way": "muted",
  Skip: "muted",
};

const dollars = (cents: number | null | undefined) =>
  cents == null ? "" : (cents / 100).toString();

// ── The create / edit form ────────────────────────────────────────────────────

interface FormState {
  mode: "inventory" | "wanted";
  assetId: string;
  name: string;
  set: string;
  cardNumber: string;
  variant: string;
  notes: string;
  raw: string;
  purchase: string;
  psa10: string;
  psa9: string;
  psa8: string;
  bgs10: string;
  bgsBlack: string;
  gem: string;
  fee: string;
  shipping: string;
  insurance: string;
  preGradingFee: string;
  priority: PlayPriority;
  psa10Pop: string;
}

function emptyForm(): FormState {
  return {
    mode: "inventory",
    assetId: "",
    name: "",
    set: "",
    cardNumber: "",
    variant: "",
    notes: "",
    raw: "",
    purchase: "",
    psa10: "",
    psa9: "",
    psa8: "",
    bgs10: "",
    bgsBlack: "",
    gem: "50",
    fee: dollars(GRADING_COST_DEFAULTS.feeCents),
    shipping: dollars(GRADING_COST_DEFAULTS.shippingCents),
    insurance: dollars(GRADING_COST_DEFAULTS.insuranceCents),
    preGradingFee: dollars(GRADING_COST_DEFAULTS.preGradingFeeCents),
    priority: "Medium",
    psa10Pop: "",
  };
}

function playToForm(p: PlayView): FormState {
  return {
    mode: p.assetId ? "inventory" : "wanted",
    assetId: p.assetId ?? "",
    name: p.name,
    set: p.set ?? "",
    cardNumber: p.cardNumber ?? "",
    variant: p.variant ?? "",
    notes: p.notes ?? "",
    raw: dollars(p.rawValueCents),
    purchase: dollars(p.purchasePriceCents),
    psa10: dollars(p.psa10Cents),
    psa9: dollars(p.psa9Cents),
    psa8: dollars(p.psa8Cents),
    bgs10: dollars(p.bgs10Cents),
    bgsBlack: dollars(p.bgsBlackLabelCents),
    gem: String(p.gemRatePct),
    fee: dollars(p.feeCents),
    shipping: dollars(p.shippingCents),
    insurance: dollars(p.insuranceCents),
    preGradingFee: dollars(p.preGradingFeeCents),
    priority: (p.priority as PlayPriority) ?? "Medium",
    psa10Pop: p.psa10Pop == null ? "" : String(p.psa10Pop),
  };
}

export function AnalyzerClient({
  plays,
  assets,
}: {
  plays: PlayView[];
  assets: PickableAsset[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(plays.length === 0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [f, setF] = useState<FormState>(emptyForm());
  const fileRef = useRef<HTMLInputElement>(null);
  const collectrRef = useRef<HTMLInputElement>(null);

  // Filters / sort / quick search
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [fOrigin, setFOrigin] = useState("");
  const [fMinRoi, setFMinRoi] = useState("");
  const [fMinProfit, setFMinProfit] = useState("");
  const [fMinGem, setFMinGem] = useState("");
  const [sort, setSort] = useState("roi");

  // Row-level "Returned" panel — grade intentionally starts EMPTY so an
  // unedited confirm can't brand every return a PSA 10.
  const [returningId, setReturningId] = useState<string | null>(null);
  const [retGrade, setRetGrade] = useState("");
  const [retCert, setRetCert] = useState("");
  const [retSale, setRetSale] = useState("");

  const set = (patch: Partial<FormState>) => setF((prev) => ({ ...prev, ...patch }));

  const liveMath = computePlay({
    rawValueCents: toCents(f.raw),
    purchasePriceCents: f.purchase.trim() === "" ? null : toCents(f.purchase),
    psa10Cents: toCents(f.psa10),
    gemRatePct: Number(f.gem) || 0,
    feeCents: toCents(f.fee),
    shippingCents: toCents(f.shipping),
    insuranceCents: toCents(f.insurance),
    preGradingFeeCents: toCents(f.preGradingFee),
  });

  const liveBvg = buyVsGrade({
    rawValueCents: toCents(f.raw),
    psa10Cents: toCents(f.psa10),
    gemRatePct: Number(f.gem) || 0,
    gradingCostCents: liveMath.gradingCostCents,
    psa10Pop: f.psa10Pop.trim() === "" ? null : Math.max(0, Math.round(Number(f.psa10Pop) || 0)),
  });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const enriched = plays.map((p) => {
      const m = computePlay(p);
      const bvg = buyVsGrade({
        rawValueCents: p.rawValueCents,
        psa10Cents: p.psa10Cents,
        gemRatePct: p.gemRatePct,
        gradingCostCents: m.gradingCostCents,
        psa10Pop: p.psa10Pop,
      });
      return { p, m, bvg };
    });
    let out = enriched.filter(({ p, m }) => {
      if (
        needle &&
        ![p.name, p.set ?? "", p.cardNumber ?? "", p.notes ?? ""].some((s) =>
          s.toLowerCase().includes(needle),
        )
      )
        return false;
      if (fStatus && p.status !== fStatus) return false;
      if (fPriority && p.priority !== fPriority) return false;
      if (fOrigin === "inventory" && !p.assetId) return false;
      if (fOrigin === "wanted" && p.assetId) return false;
      if (fMinRoi.trim() !== "" && (m.roiPct ?? -Infinity) < Number(fMinRoi)) return false;
      if (fMinProfit.trim() !== "" && m.estimatedProfitCents < toCents(fMinProfit)) return false;
      if (fMinGem.trim() !== "" && p.gemRatePct < Number(fMinGem)) return false;
      return true;
    });
    out = out.sort((a, b) => {
      switch (sort) {
        case "profit":
          return b.m.estimatedProfitCents - a.m.estimatedProfitCents;
        case "psa10":
          return b.p.psa10Cents - a.p.psa10Cents;
        case "gem":
          return b.p.gemRatePct - a.p.gemRatePct;
        case "newest":
          return b.p.createdAt.localeCompare(a.p.createdAt);
        case "alpha":
          return a.p.name.localeCompare(b.p.name);
        default:
          return (b.m.roiPct ?? -Infinity) - (a.m.roiPct ?? -Infinity);
      }
    });
    return out;
  }, [plays, q, fStatus, fPriority, fOrigin, fMinRoi, fMinProfit, fMinGem, sort]);

  // Summary across ALL plays (not filtered) — the "grading cheat sheet" header.
  const summary = useMemo(() => {
    const open = plays.filter((p) => !["Returned", "Sold"].includes(p.status));
    const maths = open.map((p) => computePlay(p));
    const rois = maths.map((m) => m.roiPct).filter((r): r is number => r !== null);
    return {
      tracked: open.length,
      highPriority: open.filter((p) => p.priority === "High" || p.priority === "MustBuy").length,
      avgRoi: rois.length ? rois.reduce((a, b) => a + b, 0) / rois.length : null,
      avgGem: open.length
        ? open.reduce((a, p) => a + p.gemRatePct, 0) / open.length
        : null,
      totalProfit: maths.reduce((a, m) => a + m.estimatedProfitCents, 0),
      totalEv: maths.reduce((a, m) => a + m.expectedValueCents, 0),
    };
  }, [plays]);

  // Cost to buy + grade — totals the CURRENTLY FILTERED rows (matches the table),
  // so narrowing by priority/status/ROI/etc. narrows these figures too.
  const filtersActive =
    q.trim() !== "" ||
    fStatus !== "" ||
    fPriority !== "" ||
    fOrigin !== "" ||
    fMinRoi.trim() !== "" ||
    fMinProfit.trim() !== "" ||
    fMinGem.trim() !== "";
  const costTotals = useMemo(
    () => ({
      count: rows.length,
      rawCost: rows.reduce((a, { m }) => a + m.acquisitionCents, 0),
      gradingFees: rows.reduce((a, { m }) => a + m.gradingCostCents, 0),
      investment: rows.reduce((a, { m }) => a + m.totalInvestmentCents, 0),
    }),
    [rows],
  );

  // Count plays per status / priority so the filter dropdowns can offer only the
  // values that actually exist (with a count) — no dead options that match nothing.
  const statusCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of plays) m.set(p.status, (m.get(p.status) ?? 0) + 1);
    return m;
  }, [plays]);
  const priorityCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of plays) m.set(p.priority, (m.get(p.priority) ?? 0) + 1);
    return m;
  }, [plays]);

  function payloadFromForm() {
    return {
      assetId: f.mode === "inventory" ? f.assetId || null : null,
      name: f.name.trim(),
      set: f.set || null,
      cardNumber: f.cardNumber || null,
      variant: f.variant || null,
      notes: f.notes || null,
      rawValueCents: toCents(f.raw),
      purchasePriceCents: f.purchase.trim() === "" ? null : toCents(f.purchase),
      psa10Cents: toCents(f.psa10),
      psa9Cents: f.psa9.trim() === "" ? null : toCents(f.psa9),
      psa8Cents: f.psa8.trim() === "" ? null : toCents(f.psa8),
      bgs10Cents: f.bgs10.trim() === "" ? null : toCents(f.bgs10),
      bgsBlackLabelCents: f.bgsBlack.trim() === "" ? null : toCents(f.bgsBlack),
      gemRatePct: Math.round(Number(f.gem) || 0),
      feeCents: toCents(f.fee),
      shippingCents: toCents(f.shipping),
      insuranceCents: toCents(f.insurance),
      preGradingFeeCents: toCents(f.preGradingFee),
      priority: f.priority,
      psa10Pop: f.psa10Pop.trim() === "" ? null : Math.max(0, Math.round(Number(f.psa10Pop) || 0)),
    };
  }

  function save() {
    setError(null);
    setNotice(null);
    if (f.mode === "inventory" && !f.assetId) {
      setError("Pick the inventory card (or switch to New / Wanted).");
      return;
    }
    if (f.mode === "wanted" && !f.name.trim()) {
      setError("Card name is required.");
      return;
    }
    if (toCents(f.psa10) <= 0) {
      setError("PSA 10 price is required — it drives the whole calculation.");
      return;
    }
    startTransition(async () => {
      const res = editingId
        ? await updateGradingPlay(editingId, payloadFromForm())
        : await createGradingPlay(payloadFromForm());
      if (!res.ok) setError(res.error);
      else {
        setF(emptyForm());
        setEditingId(null);
        setFormOpen(false);
        router.refresh();
      }
    });
  }

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Failed");
      else router.refresh();
    });
  }

  function changeStatus(p: PlayView, status: string) {
    if (status === "Returned" && p.assetId) {
      setReturningId(p.id);
      setRetGrade("");
      setRetCert("");
      setRetSale("");
      return;
    }
    act(() => updateGradingPlay(p.id, { status: status as PlayStatus }));
  }

  function exportCsv() {
    const csv = Papa.unparse(
      plays.map((p) => ({
        name: p.name,
        set: p.set ?? "",
        cardNumber: p.cardNumber ?? "",
        variant: p.variant ?? "",
        game: p.game ?? "",
        notes: p.notes ?? "",
        rawValue: dollars(p.rawValueCents),
        purchasePrice: dollars(p.purchasePriceCents),
        psa10: dollars(p.psa10Cents),
        psa9: dollars(p.psa9Cents),
        psa8: dollars(p.psa8Cents),
        bgs10: dollars(p.bgs10Cents),
        bgsBlackLabel: dollars(p.bgsBlackLabelCents),
        gemRatePct: p.gemRatePct,
        fee: dollars(p.feeCents),
        shipping: dollars(p.shippingCents),
        insurance: dollars(p.insuranceCents),
        preGradingFee: dollars(p.preGradingFeeCents),
        status: p.status,
        priority: p.priority,
        psa10Pop: p.psa10Pop ?? "",
        returnedGrade: p.returnedGrade ?? "",
        certNumber: p.certNumber ?? "",
        finalSalePrice: dollars(p.finalSalePriceCents),
        returnedAt: p.returnedAt ? p.returnedAt.slice(0, 10) : "",
      })),
      // Neutralize =/+/-/@ so pasted vendor notes can't execute in Excel.
      { escapeFormulae: true },
    );
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "grading-plays.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importCsv(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        // Reject files that clearly aren't our export — silent zeros from
        // mismatched headers would flood the list with junk plays.
        const fields = result.meta.fields ?? [];
        if (!fields.includes("name") || !fields.includes("psa10")) {
          setError(
            'That CSV doesn\'t look like a grading-plays export (missing "name"/"psa10" columns).',
          );
          return;
        }
        // 0 is a legitimate gem rate — only true blanks/junk get the default.
        const gem = (v: string | undefined) => {
          const n = Number(v?.trim());
          return Number.isFinite(n) && v?.trim() !== "" ? Math.min(100, Math.max(0, Math.round(n))) : 50;
        };
        const rows = (result.data as Record<string, string>[]).map((r) => ({
          name: r.name ?? "",
          set: r.set || null,
          cardNumber: r.cardNumber || null,
          variant: r.variant || null,
          game: r.game || null,
          notes: r.notes || null,
          rawValueCents: toCents(r.rawValue ?? "0"),
          purchasePriceCents: r.purchasePrice?.trim() ? toCents(r.purchasePrice) : null,
          psa10Cents: toCents(r.psa10 ?? "0"),
          psa9Cents: r.psa9?.trim() ? toCents(r.psa9) : null,
          psa8Cents: r.psa8?.trim() ? toCents(r.psa8) : null,
          bgs10Cents: r.bgs10?.trim() ? toCents(r.bgs10) : null,
          bgsBlackLabelCents: r.bgsBlackLabel?.trim() ? toCents(r.bgsBlackLabel) : null,
          gemRatePct: gem(r.gemRatePct),
          feeCents: r.fee?.trim() ? toCents(r.fee) : GRADING_COST_DEFAULTS.feeCents,
          shippingCents: r.shipping?.trim() ? toCents(r.shipping) : GRADING_COST_DEFAULTS.shippingCents,
          insuranceCents: r.insurance?.trim() ? toCents(r.insurance) : GRADING_COST_DEFAULTS.insuranceCents,
          // Accept the new "preGradingFee" column; fall back to older exports' "supplies".
          preGradingFeeCents: (r.preGradingFee ?? r.supplies ?? "").trim()
            ? toCents((r.preGradingFee ?? r.supplies) as string)
            : GRADING_COST_DEFAULTS.preGradingFeeCents,
          status: (PLAY_STATUSES as readonly string[]).includes(r.status) ? (r.status as PlayStatus) : undefined,
          priority: (PLAY_PRIORITIES as readonly string[]).includes(r.priority) ? (r.priority as PlayPriority) : undefined,
          psa10Pop: r.psa10Pop?.trim() ? Math.max(0, Math.round(Number(r.psa10Pop) || 0)) : null,
          returnedGrade: r.returnedGrade || null,
          certNumber: r.certNumber || null,
          finalSalePriceCents: r.finalSalePrice?.trim() ? toCents(r.finalSalePrice) : null,
          returnedAt: r.returnedAt || null,
        }));
        act(() => importGradingPlays(rows.filter((r) => r.name.trim() !== "")));
      },
    });
  }

  // Import a Collectr portfolio export as theoretical grading candidates. Each
  // card's raw + PSA 10 + BGS 10 rows are grouped into one wanted play; nothing
  // touches real inventory. Server-side parsing (same path as the ledger import).
  function importCollectr(file: File) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const text = await file.text();
      const res = await importCollectrGradingPlays(text);
      if (!res.ok) setError(res.error ?? "Collectr import failed");
      else {
        setNotice(`Collectr portfolio imported — ${res.id ?? "done"}.`);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Cost to buy + grade — totals the filtered rows shown below */}
      <Card>
        <CardContent className="grid gap-4 py-4 sm:grid-cols-3">
          <Big label="Total raw card cost" value={formatUSD(costTotals.rawCost)} />
          <Big label="Total grading fees" value={formatUSD(costTotals.gradingFees)} />
          <Big
            label={`Combined total · buy + grade ${costTotals.count}${filtersActive ? " (filtered)" : ""}`}
            value={formatUSD(costTotals.investment)}
            className="text-primary"
          />
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Tracked" value={String(summary.tracked)} />
        <Stat label="High priority" value={String(summary.highPriority)} />
        <Stat
          label="Avg ROI"
          value={summary.avgRoi === null ? "—" : `${summary.avgRoi.toFixed(0)}%`}
        />
        <Stat
          label="Avg gem rate"
          value={summary.avgGem === null ? "—" : `${summary.avgGem.toFixed(0)}%`}
        />
        <Stat label="Projected profit" value={formatUSD(summary.totalProfit)} tone={summary.totalProfit >= 0 ? "green" : "red"} />
        <Stat label="Total EV" value={formatUSD(summary.totalEv)} />
      </div>

      {/* Quick search + toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Quick search — card, set, number, notes…"
          className="h-11 max-w-md flex-1 text-base"
          autoFocus
        />
        <Button
          variant={formOpen ? "default" : "outline"}
          onClick={() => {
            setFormOpen(!formOpen);
            setEditingId(null);
            if (!formOpen) setF(emptyForm());
          }}
        >
          <Plus /> New play
        </Button>
        <Button variant="outline" onClick={exportCsv} title="Export all plays to CSV">
          <Download /> Export
        </Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()} title="Re-import a grading-plays CSV you exported here">
          <Upload /> Import
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importCsv(file);
            e.target.value = "";
          }}
        />
        <Button
          variant="outline"
          onClick={() => collectrRef.current?.click()}
          title="Import a Collectr portfolio as theoretical grading candidates — raw + PSA 10 + BGS 10 rows are grouped into one wanted play. Separate from your inventory."
        >
          <Boxes /> Collectr portfolio
        </Button>
        <input
          ref={collectrRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importCollectr(file);
            e.target.value = "";
          }}
        />
      </div>

      {/* New / edit play form */}
      {formOpen ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editingId ? "Edit grading play" : "New grading play"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="inline-flex overflow-hidden rounded-md border border-border">
              {(["inventory", "wanted"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set({ mode: m })}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium transition-colors",
                    f.mode === m
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:bg-accent",
                  )}
                >
                  {m === "inventory" ? "Inventory card" : "New / wanted card"}
                </button>
              ))}
            </div>

            {f.mode === "inventory" ? (
              <div>
                <Label className="mb-1 block text-xs">Search your inventory</Label>
                <AssetCombobox
                  assets={assets}
                  value={f.assetId}
                  onSelect={(a) =>
                    // Clear identity carried over from a previous card — the
                    // server re-snapshots set/number/variant from the asset.
                    set({
                      assetId: a.id,
                      name: a.name,
                      set: "",
                      cardNumber: "",
                      variant: "",
                      raw: dollars(marketOf(a)),
                      purchase: dollars(a.costBasisCents),
                    })
                  }
                  placeholder="Card name, set, or number…"
                />
                {f.assetId ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {f.name} — raw {formatUSD(toCents(f.raw))} · paid {formatUSD(toCents(f.purchase))} ·{" "}
                    {(() => {
                      const linked = assets.find((a) => a.id === f.assetId);
                      return linked ? `${linked.quantity} owned` : "not in stock (at PSA / sold)";
                    })()}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="lg:col-span-2">
                  <Label className="mb-1 block text-xs">Card name</Label>
                  <Input value={f.name} onChange={(e) => set({ name: e.target.value })} />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Set</Label>
                  <Input value={f.set} onChange={(e) => set({ set: e.target.value })} />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Card #</Label>
                  <Input value={f.cardNumber} onChange={(e) => set({ cardNumber: e.target.value })} />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Variant</Label>
                  <Input
                    value={f.variant}
                    placeholder="Alt Art / SIR / Full Art…"
                    onChange={(e) => set({ variant: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Raw market ($)</Label>
                  <Input type="number" step="0.01" value={f.raw} onChange={(e) => set({ raw: e.target.value })} />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Purchase / ask ($, optional)</Label>
                  <Input type="number" step="0.01" value={f.purchase} onChange={(e) => set({ purchase: e.target.value })} />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Priority</Label>
                  <Select value={f.priority} onChange={(e) => set({ priority: e.target.value as PlayPriority })}>
                    {PLAY_PRIORITIES.map((p) => (
                      <option key={p} value={p}>{PLAY_PRIORITY_LABELS[p]}</option>
                    ))}
                  </Select>
                </div>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <div>
                <Label className="mb-1 block text-xs">PSA 10 ($) *</Label>
                <Input type="number" step="0.01" value={f.psa10} onChange={(e) => set({ psa10: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1 block text-xs">PSA 9 ($)</Label>
                <Input type="number" step="0.01" value={f.psa9} onChange={(e) => set({ psa9: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1 block text-xs">PSA 8 ($)</Label>
                <Input type="number" step="0.01" value={f.psa8} onChange={(e) => set({ psa8: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1 block text-xs">BGS 10 ($)</Label>
                <Input type="number" step="0.01" value={f.bgs10} onChange={(e) => set({ bgs10: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1 block text-xs">BGS Black Label ($)</Label>
                <Input type="number" step="0.01" value={f.bgsBlack} onChange={(e) => set({ bgsBlack: e.target.value })} />
              </div>
              {f.mode === "inventory" ? (
                <>
                  <div>
                    <Label className="mb-1 block text-xs">Raw market ($)</Label>
                    <Input type="number" step="0.01" value={f.raw} onChange={(e) => set({ raw: e.target.value })} />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">Purchase ($)</Label>
                    <Input type="number" step="0.01" value={f.purchase} onChange={(e) => set({ purchase: e.target.value })} />
                  </div>
                </>
              ) : null}
              <div>
                <Label className="mb-1 block text-xs">Gem rate (%)</Label>
                <Input type="number" min={0} max={100} value={f.gem} onChange={(e) => set({ gem: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1 block text-xs">PSA 10 pop</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={f.psa10Pop}
                  placeholder="from pop report"
                  onChange={(e) => set({ psa10Pop: e.target.value })}
                  title="PSA 10 population count from the pop report — classified into a scarcity tier for the long-term signal"
                />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <div>
                <Label className="mb-1 block text-xs">PSA fee ($)</Label>
                <Input type="number" step="0.01" value={f.fee} onChange={(e) => set({ fee: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Shipping ($)</Label>
                <Input type="number" step="0.01" value={f.shipping} onChange={(e) => set({ shipping: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Insurance ($)</Label>
                <Input type="number" step="0.01" value={f.insurance} onChange={(e) => set({ insurance: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Pre-grading fee ($)</Label>
                <Input type="number" step="0.01" value={f.preGradingFee} onChange={(e) => set({ preGradingFee: e.target.value })} />
              </div>
            </div>

            <div>
              <Label className="mb-1 block text-xs">Vendor notes</Label>
              <Input
                value={f.notes}
                placeholder="Saw at Dallas show · vendor asking $42 · looks clean"
                onChange={(e) => set({ notes: e.target.value })}
              />
            </div>

            {/* Live math — the cheat sheet */}
            <div className="grid gap-3 rounded-md bg-muted/50 p-4 sm:grid-cols-5">
              <Big label="Grading cost" value={formatUSD(liveMath.gradingCostCents)} />
              <Big label="Total investment" value={formatUSD(liveMath.totalInvestmentCents)} />
              <Big label="Expected value" value={formatUSD(liveMath.expectedValueCents)} />
              <Big
                label="Est. profit"
                value={formatUSD(liveMath.estimatedProfitCents)}
                className={toneClass[liveMath.tone]}
              />
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">ROI</div>
                <div className={cn("text-2xl font-bold tnum", toneClass[liveMath.tone])}>
                  {liveMath.roiPct === null ? "—" : `${liveMath.roiPct.toFixed(0)}%`}
                </div>
                <Badge variant={toneBadge[liveMath.tone]} className="mt-1">
                  {liveMath.recommendation}
                </Badge>
              </div>
            </div>

            {/* Buy-and-grade vs buy-the-slab */}
            <div className="rounded-md border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Buy vs grade</span>
                <Badge variant={bvgBadge[liveBvg.verdict]}>{liveBvg.verdict}</Badge>
                {liveBvg.longTermHold ? <Badge variant="secondary">Long-term hold</Badge> : null}
                <span className="ml-auto text-xs text-muted-foreground tnum">
                  Make a 10: {formatUSD(liveBvg.gradeCostCents)} · Buy the slab: {formatUSD(liveBvg.slabCents)}
                  {liveBvg.edgeCents !== 0
                    ? ` · Edge ${liveBvg.edgeCents > 0 ? "+" : "−"}${formatUSD(Math.abs(liveBvg.edgeCents))}`
                    : ""}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{liveBvg.reason}</p>
              {liveBvg.popTier ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Pop {liveBvg.popTier.label}</span>{" "}
                  ({liveBvg.popTier.range}) — {liveBvg.popTier.outlook}
                </p>
              ) : null}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setFormOpen(false); setEditingId(null); }}>
                Cancel
              </Button>
              <Button onClick={save} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                {editingId ? "Save changes" : "Add to watch list"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Filters + sort */}
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="w-48">
          <option value="">All statuses ({plays.length})</option>
          {PLAY_STATUSES.filter((s) => statusCounts.has(s) || fStatus === s).map((s) => (
            <option key={s} value={s}>{PLAY_STATUS_LABELS[s]} ({statusCounts.get(s) ?? 0})</option>
          ))}
        </Select>
        <Select value={fPriority} onChange={(e) => setFPriority(e.target.value)} className="w-44">
          <option value="">All priorities ({plays.length})</option>
          {PLAY_PRIORITIES.filter((p) => priorityCounts.has(p) || fPriority === p).map((p) => (
            <option key={p} value={p}>{PLAY_PRIORITY_LABELS[p]} ({priorityCounts.get(p) ?? 0})</option>
          ))}
        </Select>
        <Select value={fOrigin} onChange={(e) => setFOrigin(e.target.value)} className="w-40">
          <option value="">Inventory + wanted</option>
          <option value="inventory">Inventory only</option>
          <option value="wanted">Wanted only</option>
        </Select>
        <Input className="w-28" type="number" placeholder="Min ROI %" value={fMinRoi} onChange={(e) => setFMinRoi(e.target.value)} />
        <Input className="w-28" type="number" placeholder="Min profit $" value={fMinProfit} onChange={(e) => setFMinProfit(e.target.value)} />
        <Input className="w-28" type="number" placeholder="Min gem %" value={fMinGem} onChange={(e) => setFMinGem(e.target.value)} />
        <div className="ml-auto">
          <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-44">
            <option value="roi">Highest ROI</option>
            <option value="profit">Highest profit</option>
            <option value="psa10">Highest PSA 10</option>
            <option value="gem">Highest gem rate</option>
            <option value="newest">Recently added</option>
            <option value="alpha">Alphabetical</option>
          </Select>
        </div>
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}
      {notice ? (
        <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{notice}</p>
      ) : null}

      {/* Watch list */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Card</TableHead>
                <TableHead className="text-right">Raw</TableHead>
                <TableHead className="text-right">PSA 10</TableHead>
                <TableHead className="text-right">Gem</TableHead>
                <TableHead className="text-right">EV</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">ROI</TableHead>
                <TableHead>Verdict</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                    {plays.length === 0
                      ? "No grading plays yet — hit New play and run your first card."
                      : "Nothing matches these filters."}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(({ p, m, bvg }) => (
                  <Fragment key={p.id}>
                    <TableRow>
                      <TableCell className="max-w-[240px]">
                        <button
                          type="button"
                          className="text-left font-medium hover:underline"
                          title="Edit this play"
                          onClick={() => {
                            setEditingId(p.id);
                            setF(playToForm(p));
                            setFormOpen(true);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          {p.name}
                        </button>
                        <div className="text-xs text-muted-foreground">
                          {[p.set, p.cardNumber ? `#${p.cardNumber}` : null, p.variant]
                            .filter(Boolean)
                            .join(" · ")}
                          {p.assetId ? (
                            <Link href={`/inventory/${p.assetId}`} className="ml-1 underline">
                              inventory
                            </Link>
                          ) : null}
                        </div>
                        {p.notes ? (
                          <div className="mt-0.5 max-w-[240px] truncate text-xs text-muted-foreground" title={p.notes}>
                            {p.notes}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tnum">{formatUSD(p.rawValueCents)}</TableCell>
                      <TableCell className="text-right tnum font-medium">{formatUSD(p.psa10Cents)}</TableCell>
                      <TableCell className="text-right tnum">{p.gemRatePct}%</TableCell>
                      <TableCell className="text-right tnum">{formatUSD(m.expectedValueCents)}</TableCell>
                      <TableCell className={cn("text-right tnum font-medium", toneClass[m.tone])}>
                        {formatUSD(m.estimatedProfitCents)}
                      </TableCell>
                      <TableCell className={cn("text-right tnum font-bold", toneClass[m.tone])}>
                        {m.roiPct === null ? "—" : `${m.roiPct.toFixed(0)}%`}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant={toneBadge[m.tone]}>{m.recommendation}</Badge>
                          <span title={bvg.reason}>
                            <Badge variant={bvgBadge[bvg.verdict]}>{bvg.verdict}</Badge>
                          </span>
                          {bvg.popTier ? (
                            <span
                              className="text-[10px] uppercase tracking-wide text-muted-foreground"
                              title={bvg.popTier.outlook}
                            >
                              {bvg.popTier.label} pop{bvg.longTermHold ? " · hold" : ""}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={p.status}
                          onChange={(e) => changeStatus(p, e.target.value)}
                          className="h-8 w-36 text-xs"
                        >
                          {PLAY_STATUSES.map((s) => (
                            <option key={s} value={s}>{PLAY_STATUS_LABELS[s]}</option>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={p.priority}
                          onChange={(e) =>
                            act(() => updateGradingPlay(p.id, { priority: e.target.value as PlayPriority }))
                          }
                          className={cn("h-8 w-28 text-xs")}
                        >
                          {PLAY_PRIORITIES.map((pr) => (
                            <option key={pr} value={pr}>{PLAY_PRIORITY_LABELS[pr]}</option>
                          ))}
                        </Select>
                        <Badge variant={priorityBadge[p.priority] ?? "outline"} className="mt-1">
                          {PLAY_PRIORITY_LABELS[p.priority as PlayPriority] ?? p.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Remove from watch list"
                          onClick={() => {
                            if (confirm(`Remove "${p.name}" from the grading watch list?`)) {
                              act(() => deleteGradingPlay(p.id));
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    {returningId === p.id ? (
                      <TableRow key={`${p.id}-return`}>
                        <TableCell colSpan={11}>
                          <div className="flex flex-wrap items-end gap-3 rounded-md bg-muted/50 p-3">
                            <div className="w-32">
                              <Label className="mb-1 block text-xs">Grade *</Label>
                              <Input
                                value={retGrade}
                                placeholder="PSA 10 / 9 / 8…"
                                onChange={(e) => setRetGrade(e.target.value)}
                              />
                            </div>
                            <div className="w-40">
                              <Label className="mb-1 block text-xs">Cert #</Label>
                              <Input value={retCert} onChange={(e) => setRetCert(e.target.value)} />
                            </div>
                            <div className="w-36">
                              <Label className="mb-1 block text-xs">Final sale ($, opt.)</Label>
                              <Input type="number" step="0.01" value={retSale} onChange={(e) => setRetSale(e.target.value)} />
                            </div>
                            <Button
                              size="sm"
                              disabled={pending || retGrade.trim() === ""}
                              onClick={() =>
                                act(async () => {
                                  const res = await updateGradingPlay(p.id, {
                                    status: "Returned",
                                    returnedGrade: retGrade.trim(),
                                    certNumber: retCert || null,
                                    finalSalePriceCents: retSale.trim() === "" ? null : toCents(retSale),
                                    returnedAt: new Date().toISOString().slice(0, 10),
                                  });
                                  if (res.ok) setReturningId(null);
                                  return res;
                                })
                              }
                            >
                              Record return
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setReturningId(null)}>
                              <X className="size-4" />
                            </Button>
                            <p className="w-full text-xs text-muted-foreground">
                              Posts the real grading return: grade + cert land on the inventory card
                              and its market value updates to the graded comp.
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "green" | "red" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-xl font-bold tnum",
          tone === "green" && "text-success",
          tone === "red" && "text-destructive",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Big({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-2xl font-bold tnum", className)}>{value}</div>
    </div>
  );
}
