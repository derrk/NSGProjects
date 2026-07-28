"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function RangeToolbar({ from, to }: { from?: string; to?: string }) {
  const router = useRouter();
  const [f, setF] = useState(from ?? "");
  const [t, setT] = useState(to ?? "");

  const go = (nf?: string, nt?: string) => {
    const p = new URLSearchParams();
    if (nf) p.set("from", nf);
    if (nt) p.set("to", nt);
    const qs = p.toString();
    router.push(`/capital/reports${qs ? `?${qs}` : ""}`);
  };
  const now = new Date();
  const allTime = !from && !to;

  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <Button size="sm" variant={allTime ? "default" : "outline"} onClick={() => { setF(""); setT(""); go(); }}>All time</Button>
      <Button size="sm" variant="outline" onClick={() => go(`${now.getFullYear()}-01-01`, iso(now))}>This year</Button>
      <Button size="sm" variant="outline" onClick={() => { const d = new Date(now); d.setDate(d.getDate() - 90); go(iso(d), iso(now)); }}>Last 90 days</Button>
      <div>
        <label className="block text-xs text-muted-foreground">From</label>
        <Input type="date" value={f} onChange={(e) => setF(e.target.value)} className="h-9 w-40" />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground">To</label>
        <Input type="date" value={t} onChange={(e) => setT(e.target.value)} className="h-9 w-40" />
      </div>
      <Button size="sm" variant="outline" onClick={() => go(f || undefined, t || undefined)}>Apply</Button>
    </div>
  );
}

export function ExportButton({ filename, headers, rows }: { filename: string; headers: string[]; rows: (string | number)[][] }) {
  const onClick = () => {
    const esc = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <Button size="sm" variant="ghost" onClick={onClick} title="Export this report to CSV">
      <Download className="size-3.5" /> CSV
    </Button>
  );
}
