"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { UploadCloud, FilePlus2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money } from "@/components/money-text";
import { analyzeCollectr, commitCollectr, type AnalyzeResult } from "./actions";

const ACTION_LABEL: Record<string, { label: string; variant: "success" | "secondary" | "warning" }> = {
  create: { label: "New", variant: "success" },
  refresh: { label: "Refresh", variant: "secondary" },
  "price-only": { label: "Price only", variant: "warning" },
};

export function ImportClient() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [committed, setCommitted] = useState<{
    created: number;
    updated: number;
    syncedCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onFile(file: File) {
    setError(null);
    setCommitted(null);
    setAnalysis(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setCsvText(text);
      startTransition(async () => {
        const res = await analyzeCollectr(text);
        if (!res.ok) setError(res.error ?? "Could not read file");
        setAnalysis(res);
      });
    };
    reader.readAsText(file);
  }

  function commit() {
    if (!csvText) return;
    setError(null);
    startTransition(async () => {
      const res = await commitCollectr(csvText, fileName ?? undefined);
      if (!res.ok) {
        setError(res.error ?? "Import failed");
        return;
      }
      setCommitted({
        created: res.created ?? 0,
        updated: res.updated ?? 0,
        syncedCount: res.syncedCount ?? 0,
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border py-10 text-center transition-colors hover:bg-accent/40">
            <UploadCloud className="size-8 text-muted-foreground" />
            <div>
              <div className="font-medium">
                {fileName ? fileName : "Choose your Collectr CSV export"}
              </div>
              <div className="text-sm text-muted-foreground">
                Portfolio → Export → upload the .csv here
              </div>
            </div>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
          </label>
        </CardContent>
      </Card>

      {pending && !analysis ? (
        <p className="text-sm text-muted-foreground">Reading file…</p>
      ) : null}

      {error ? (
        <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4" /> {error}
        </p>
      ) : null}

      {committed ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <CheckCircle2 className="size-6 text-success" />
            <div>
              <div className="font-medium">Import complete</div>
              <div className="text-sm text-muted-foreground">
                {committed.created} created · {committed.updated} updated
                {committed.syncedCount > 0
                  ? ` · ${committed.syncedCount} backlog item${committed.syncedCount === 1 ? "" : "s"} confirmed synced`
                  : ""}
                .{" "}
                <button className="underline" onClick={() => router.push("/inventory")}>
                  View inventory
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {analysis?.ok && !committed ? (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Stat label="Rows" value={String(analysis.rowCount ?? 0)} />
            <Stat label="New assets" value={String(analysis.createCount ?? 0)} tone="success" />
            <Stat label="Refreshed" value={String((analysis.refreshCount ?? 0) + (analysis.priceOnlyCount ?? 0))} />
            <Stat
              label="Qty conflicts"
              value={String(analysis.mismatchCount ?? 0)}
              tone={(analysis.mismatchCount ?? 0) > 0 ? "warning" : "default"}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {analysis.asOfDate
                ? `Market prices as of ${format(new Date(analysis.asOfDate), "MMM d, yyyy")}. `
                : ""}
              {(analysis.priceOnlyCount ?? 0) > 0
                ? `${analysis.priceOnlyCount} ledger-tracked asset(s) will get price updates only.`
                : ""}
            </p>
            <Button onClick={commit} disabled={pending}>
              <FilePlus2 /> Commit import
            </Button>
          </div>

          {analysis.mismatchCount ? (
            <p className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
              <AlertTriangle className="size-4" />
              Some cards you&apos;ve traded/sold here show a different quantity in Collectr. We keep
              your ledger quantity and only refresh price — review the flagged rows below.
            </p>
          ) : null}

          {(analysis.duplicateWarningCount ?? 0) > 0 ? (
            <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="size-4" />
              {analysis.duplicateWarningCount} new row(s) look like cards already in your inventory
              that aren&apos;t synced to Collectr yet (marked below). Committing would double-count
              them — edit the card here so its set/number/variant matches Collectr exactly, then
              re-import.
            </p>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preview {analysis.preview && analysis.preview.length >= 60 ? "(first 60)" : ""}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Cost/u</TableHead>
                    <TableHead className="text-right">Market/u</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysis.preview?.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="max-w-[280px] truncate">{p.name}</TableCell>
                      <TableCell>
                        <Badge variant={ACTION_LABEL[p.action]?.variant ?? "secondary"}>
                          {ACTION_LABEL[p.action]?.label ?? p.action}
                        </Badge>
                        {p.quantityMismatch ? (
                          <Badge variant="warning" className="ml-1">qty conflict</Badge>
                        ) : null}
                        {p.possibleDuplicateOf ? (
                          <Badge variant="destructive" className="ml-1">
                            duplicate of &quot;{p.possibleDuplicateOf}&quot;?
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tnum">
                        {p.qtyBefore !== null && p.qtyBefore !== p.qtyAfter
                          ? `${p.qtyBefore} → ${p.qtyAfter}`
                          : p.qtyAfter}
                      </TableCell>
                      <TableCell className="text-right"><Money cents={p.costAfterCents} /></TableCell>
                      <TableCell className="text-right">
                        {p.marketBeforeCents !== null && p.marketBeforeCents !== p.marketAfterCents ? (
                          <span className="text-muted-foreground">
                            <Money cents={p.marketBeforeCents} /> →{" "}
                          </span>
                        ) : null}
                        <Money cents={p.marketAfterCents} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
}) {
  const t = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold tnum ${t}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
