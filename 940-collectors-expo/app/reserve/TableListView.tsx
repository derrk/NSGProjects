"use client";

import { useId, useMemo } from "react";
import { Search, X, Check, Plus } from "lucide-react";
import { useReservation } from "./ReservationContext";
import {
  TABLE_GROUPS,
  basePriceCents,
  formatUSD,
  tableAccessibleName,
  type TableDef,
  type TableStatus,
} from "./tables";
import { spookyFx } from "../lib/spooky";

const pad2 = (n: number) => String(n).padStart(2, "0");

// Every availability state is named in words — colour never carries it alone.
// Keys match TableStatus from the reservation context; `spoken` matches the
// vocabulary tableAccessibleName() uses so the map and the list read alike.
const STATE: Record<
  TableStatus,
  { label: string; spoken: "available" | "selected" | "held" | "booked" | "unavailable"; chip: string }
> = {
  available: {
    label: "Available",
    spoken: "available",
    chip: "bg-[#33235C] border-[#7C4DD6]/60 text-[#EDE7FB]",
  },
  selected: {
    label: "In your cart",
    spoken: "selected",
    chip: "bg-[#A855F7]/20 border-[#D8B4FE]/60 text-[#E9D5FF]",
  },
  held: {
    label: "Pending payment",
    spoken: "held",
    chip: "bg-[#F97316]/15 border-[#C2410C]/60 text-[#FDBA74]",
  },
  reserved: {
    label: "Booked",
    spoken: "booked",
    chip: "bg-[#6EE04A]/15 border-[#3F9E1E]/60 text-[#9CF07E]",
  },
  blocked: {
    label: "Unavailable",
    spoken: "unavailable",
    chip: "bg-white/5 border-white/15 text-[#E5E7EB]/50",
  },
};

const FOCUS =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D8B4FE] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0713]";

// Matches a table against the search box on its number (padded or not) and on
// its group label, e.g. "07", "7", "center 3", "rear".
function matches(t: TableDef, label: string, q: string): boolean {
  if (!q) return true;
  return (
    pad2(t.id).includes(q) ||
    String(t.id).includes(q) ||
    label.toLowerCase().includes(q) ||
    t.zone.toLowerCase().includes(q)
  );
}

// Accessible, searchable equivalent of the SVG floor map: the same tables,
// grouped by location, reading and writing the same cart in ReservationContext.
// The search term is owned by the parent so switching to the map and back
// doesn't throw away the vendor's filter.
export default function TableListView({
  query,
  onQueryChange,
  maxHeight = "74vh",
}: {
  query: string;
  onQueryChange: (q: string) => void;
  maxHeight?: string;
}) {
  const { statusOf, canSelect, toggleTable, getVendor } = useReservation();
  const searchId = useId();

  // Strip the noise a vendor is likely to type around a table number.
  const q = query.trim().toLowerCase().replace(/^(#|table\s+)/, "");

  const groups = useMemo(
    () =>
      TABLE_GROUPS.map((g) => ({
        ...g,
        matched: g.tables.filter((t) => matches(t, g.label, q)),
      })).filter((g) => g.matched.length > 0),
    [q]
  );

  const shownCount = groups.reduce((n, g) => n + g.matched.length, 0);
  const totalCount = TABLE_GROUPS.reduce((n, g) => n + g.tables.length, 0);

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <label htmlFor={searchId} className="sr-only">
            Search tables by number or area
          </label>
          <Search
            size={15}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#E5E7EB]/40"
          />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search table number or area…"
            className={`w-full rounded-xl border border-white/10 bg-[#0B0713] py-2.5 pl-9 pr-9 text-sm text-white placeholder:text-[#E5E7EB]/35 ${FOCUS}`}
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
              className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#E5E7EB]/50 hover:text-white ${FOCUS}`}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <p aria-live="polite" className="mt-2 text-xs text-[#E5E7EB]/50">
        Showing {shownCount} of {totalCount} tables
        {q && ` matching “${query.trim()}”`}
      </p>

      <div
        className="mt-3 space-y-5 overflow-y-auto rounded-lg border border-white/10 bg-[#1A1230] p-3"
        style={{ maxHeight }}
      >
        {groups.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#E5E7EB]/40">
            No tables match that search. Try a number like 07, or an area like “Center 3”.
          </p>
        ) : (
          groups.map((g) => {
            const openCount = g.matched.filter((t) => statusOf(t.id) === "available").length;
            return (
              <section key={g.group} aria-labelledby={`${searchId}-${g.group}`}>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3
                    id={`${searchId}-${g.group}`}
                    className="pixel-eyebrow text-[#A855F7]"
                  >
                    {g.label} · {g.rangeLabel}
                  </h3>
                  <span className="text-[11px] text-[#E5E7EB]/45">
                    {openCount} of {g.matched.length} available
                  </span>
                </div>

                <ul className="space-y-1.5">
                  {g.matched.map((t) => (
                    <TableRow
                      key={t.id}
                      table={t}
                      groupLabel={g.label}
                      status={statusOf(t.id)}
                      selectable={canSelect(t.id)}
                      vendorName={getVendor(t.id)?.business}
                      onToggle={() => {
                        if (statusOf(t.id) !== "selected") spookyFx(); // 🎃 on adding
                        toggleTable(t.id);
                      }}
                    />
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>

      <p className="mt-2 text-xs text-[#E5E7EB]/45">
        The list and the map share one selection — a table you add here is highlighted on the
        map, and vice versa. Every table is 8&prime; &times; 2.5&prime;.
      </p>
    </div>
  );
}

function TableRow({
  table,
  groupLabel,
  status,
  selectable,
  vendorName,
  onToggle,
}: {
  table: TableDef;
  groupLabel: string;
  status: TableStatus;
  selectable: boolean;
  vendorName?: string;
  onToggle: () => void;
}) {
  const state = STATE[status];
  const inCart = status === "selected";
  const price = formatUSD(basePriceCents(table));

  const details = (
    <>
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-bold tabular-nums ${
          inCart
            ? "border-[#D8B4FE] bg-[#A855F7] text-white"
            : "border-[#7C4DD6]/60 bg-[#33235C] text-[#EDE7FB]"
        }`}
        aria-hidden="true"
      >
        {pad2(table.id)}
      </span>
      <span className="min-w-0 flex-1 text-left">
        {/* Wraps rather than truncates — the longer group names would be cut
            off on a phone, and the area is half of what the row is telling you. */}
        <span className="block text-sm font-medium leading-snug text-white">
          Table {pad2(table.id)} · {groupLabel}
        </span>
        <span className="block text-[11px] text-[#E5E7EB]/45">
          8&prime; &times; 2.5&prime; · {price}
          {vendorName && ` · ${vendorName}`}
        </span>
      </span>
      <span
        className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-medium ${state.chip}`}
      >
        {state.label}
      </span>
    </>
  );

  if (!selectable) {
    return (
      <li
        className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-[#0B0713]/60 px-2.5 py-2 opacity-80"
        aria-label={tableAccessibleName(table, state.spoken)}
      >
        {details}
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={inCart}
        aria-label={`${tableAccessibleName(table, state.spoken)}, ${price}. ${
          inCart ? "Remove from your booking" : "Add to your booking"
        }`}
        className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors ${FOCUS} ${
          inCart
            ? "border-[#A855F7]/60 bg-[#A855F7]/10 hover:bg-[#A855F7]/15"
            : "border-white/5 bg-[#0B0713] hover:border-[#7C4DD6]/60 hover:bg-[#33235C]/40"
        }`}
      >
        {details}
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
            inCart
              ? "border-[#D8B4FE]/60 bg-[#A855F7]/25 text-[#E9D5FF]"
              : "border-white/10 bg-white/5 text-[#E5E7EB]/60"
          }`}
          aria-hidden="true"
        >
          {inCart ? <Check size={14} /> : <Plus size={14} />}
        </span>
      </button>
    </li>
  );
}
