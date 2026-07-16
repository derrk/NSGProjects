"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatUSD } from "@/lib/money";
import { assetLabel, marketOf, type PickableAsset } from "./types";

export function AssetCombobox({
  assets,
  value,
  onSelect,
  placeholder = "Search inventory…",
}: {
  assets: PickableAsset[];
  value?: string;
  onSelect: (asset: PickableAsset) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = assets.find((a) => a.id === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? assets.filter((a) =>
          [a.name, a.set, a.cardNumber, a.game].some((f) =>
            (f ?? "").toLowerCase().includes(q),
          ),
        )
      : assets;
    return list.slice(0, 40);
  }, [assets, query]);

  return (
    <div className="relative">
      <div className="relative">
        <Input
          value={open ? query : selected ? assetLabel(selected) : query}
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
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matching in-stock assets.
            </div>
          ) : (
            filtered.map((a) => (
              <button
                key={a.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                  onSelect(a);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-2 text-left text-sm hover:bg-accent",
                  a.id === value && "bg-accent",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[a.game, a.set, a.cardNumber && `#${a.cardNumber}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs">
                  <span className="tnum block">{formatUSD(marketOf(a))}</span>
                  <span className="text-muted-foreground">×{a.quantity}</span>
                </span>
                {a.id === value ? <Check className="size-4 shrink-0" /> : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
