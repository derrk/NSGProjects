"use client";

import { useState } from "react";
import { X } from "lucide-react";

export function TransactionPhotos({ paths }: { paths: string[] }) {
  const [active, setActive] = useState<string | null>(null);

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {paths.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setActive(p)}
            className="size-28 overflow-hidden rounded-md border border-border bg-muted transition-opacity hover:opacity-90"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p} alt="transaction photo" className="size-full object-cover" />
          </button>
        ))}
      </div>

      {active ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setActive(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={active}
            alt="transaction photo"
            className="max-h-full max-w-full rounded-md object-contain"
          />
        </div>
      ) : null}
    </>
  );
}
