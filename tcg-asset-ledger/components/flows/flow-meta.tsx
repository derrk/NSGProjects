"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { TRANSACTION_SOURCES } from "@/lib/domain";
import { useActiveShow } from "@/components/show-mode-context";

export interface MetaState {
  date: string;
  counterparty: string;
  notes: string;
  /** "" = auto (Show while Show Mode is active, otherwise unset). */
  source: string;
}

export function defaultMeta(): MetaState {
  // Local date in yyyy-mm-dd for the date input.
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { date: iso, counterparty: "", notes: "", source: "" };
}

export function FlowMeta({
  meta,
  onChange,
  counterpartyLabel = "Counterparty",
}: {
  meta: MetaState;
  onChange: (m: MetaState) => void;
  counterpartyLabel?: string;
}) {
  // While Show Mode is active the ledger stamps source "Show" automatically.
  const showModeActive = useActiveShow() !== null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <Label className="mb-1.5 block">Date</Label>
        <Input
          type="date"
          value={meta.date}
          onChange={(e) => onChange({ ...meta, date: e.target.value })}
        />
      </div>
      <div>
        <Label className="mb-1.5 block">{counterpartyLabel}</Label>
        <Input
          value={meta.counterparty}
          placeholder="Name / who"
          onChange={(e) => onChange({ ...meta, counterparty: e.target.value })}
        />
      </div>
      <div>
        <Label className="mb-1.5 block">Source</Label>
        <Select value={meta.source} onChange={(e) => onChange({ ...meta, source: e.target.value })}>
          <option value="">{showModeActive ? "Auto — Show" : "—"}</option>
          {TRANSACTION_SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label className="mb-1.5 block">Notes</Label>
        <Input
          value={meta.notes}
          placeholder="Optional"
          onChange={(e) => onChange({ ...meta, notes: e.target.value })}
        />
      </div>
    </div>
  );
}
