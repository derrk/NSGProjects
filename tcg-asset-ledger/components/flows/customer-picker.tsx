"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createCustomerQuick } from "@/app/actions";
import type { PickableCustomer } from "./types";

export function CustomerPicker({
  customers,
  value,
  onSelect,
  placeholder = "Search customers…",
}: {
  customers: PickableCustomer[];
  value?: string;
  onSelect: (customer: PickableCustomer) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Customers created inline via quick-create this session — the `customers`
  // prop won't include them until the page is reloaded.
  const [extra, setExtra] = useState<PickableCustomer[]>([]);
  const [pending, startTransition] = useTransition();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const all = useMemo(() => [...customers, ...extra], [customers, extra]);
  const selected = all.find((c) => c.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? all.filter((c) => [c.name, c.email, c.phone].some((f) => (f ?? "").toLowerCase().includes(q)))
      : all;
    return list.slice(0, 40);
  }, [all, query]);

  const trimmedQuery = query.trim();
  const hasExactMatch = filtered.some((c) => c.name.toLowerCase() === trimmedQuery.toLowerCase());
  const showCreateRow = trimmedQuery !== "" && !hasExactMatch;

  function createQuick() {
    const name = trimmedQuery;
    startTransition(async () => {
      const res = await createCustomerQuick(name);
      if (res.ok && res.id) {
        const created: PickableCustomer = { id: res.id, name, email: null, phone: null };
        setExtra((prev) => [...prev, created]);
        onSelect(created);
        setOpen(false);
        setQuery("");
      }
    });
  }

  return (
    <div className="relative">
      <div className="relative">
        <Input
          value={open ? query : selected ? selected.name : query}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 150);
          }}
          className="pr-8"
        />
        <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>

      {open ? (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg">
          {filtered.length === 0 && !showCreateRow ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matching customers.
            </div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                  onSelect(c);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-2 text-left text-sm hover:bg-accent",
                  c.id === value && "bg-accent",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  {c.email || c.phone ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {[c.email, c.phone].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </span>
                {c.id === value ? <Check className="size-4 shrink-0" /> : null}
              </button>
            ))
          )}
          {showCreateRow ? (
            <button
              type="button"
              disabled={pending}
              onMouseDown={(e) => e.preventDefault()}
              onClick={createQuick}
              className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-primary hover:bg-accent disabled:opacity-50"
            >
              <Plus className="size-4 shrink-0" />
              <span className="truncate">Add &ldquo;{trimmedQuery}&rdquo; as a new customer</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
