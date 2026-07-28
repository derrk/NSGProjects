"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TRANSACTION_SOURCES } from "@/lib/domain";
import { useActiveShow } from "@/components/show-mode-context";
import { CustomerPicker } from "./customer-picker";
import type { PickableCustomer } from "./types";

export interface MetaState {
  date: string;
  counterparty: string;
  /** Optional link to a known Customer. undefined = free-text mode (default,
   *  fastest path); "" = link mode selected but no customer picked yet. */
  customerId?: string;
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
  customers,
}: {
  meta: MetaState;
  onChange: (m: MetaState) => void;
  counterpartyLabel?: string;
  /** When provided, the counterparty field can switch to picking a known
   *  Customer instead of free text (repeat buyers worth tracking). */
  customers?: PickableCustomer[];
}) {
  // While Show Mode is active the ledger stamps source "Show" automatically.
  const showModeActive = useActiveShow() !== null;
  const canLinkCustomer = Array.isArray(customers);
  const isLinked = meta.customerId !== undefined;

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
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <Label>{counterpartyLabel}</Label>
          {canLinkCustomer ? (
            <div className="inline-flex overflow-hidden rounded-md border border-border">
              <ModeButton active={!isLinked} onClick={() => onChange({ ...meta, customerId: undefined })}>
                Free text
              </ModeButton>
              <ModeButton
                active={isLinked}
                onClick={() => onChange({ ...meta, customerId: meta.customerId ?? "" })}
              >
                Link customer
              </ModeButton>
            </div>
          ) : null}
        </div>
        {isLinked && customers ? (
          <CustomerPicker
            customers={customers}
            value={meta.customerId}
            onSelect={(c) =>
              onChange({ ...meta, customerId: c.id, counterparty: meta.counterparty || c.name })
            }
          />
        ) : (
          <Input
            value={meta.counterparty}
            placeholder="Name / who"
            onChange={(e) => onChange({ ...meta, counterparty: e.target.value })}
          />
        )}
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

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
