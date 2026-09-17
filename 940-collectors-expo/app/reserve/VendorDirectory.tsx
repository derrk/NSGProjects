"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AtSign, Store, Search, X } from "lucide-react";
import { useReservation } from "./ReservationContext";
import type { VendorListing } from "./ReservationContext";
import { instagramHandle, instagramUrl } from "../lib/instagram";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const logoOf = (v: VendorListing) =>
  v.photo && v.photo.startsWith("data:image/") ? v.photo : null;

const tablesLabelOf = (v: VendorListing) =>
  v.tables.length > 1 ? `Tables ${v.tables.join(", ")}` : v.tables.length === 1 ? `Table ${v.tables[0]}` : "";

function VendorCard({ v, i, onOpen }: { v: VendorListing; i: number; onOpen: (v: VendorListing) => void }) {
  const logo = logoOf(v);
  const handle = instagramHandle(v.instagram);
  const tablesLabel = tablesLabelOf(v);
  return (
    <motion.button
      type="button"
      onClick={() => onOpen(v)}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: Math.min(i, 8) * 0.05 }}
      className="group flex flex-col text-left rounded-2xl bg-[#0B0713] border border-white/5 hover:border-[#A855F7]/40 overflow-hidden transition-all duration-300 hover:-translate-y-1 cursor-pointer"
    >
      <div className="h-28 flex items-center justify-center relative bg-gradient-to-br from-[#A855F7]/15 to-[#6EE04A]/5">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={v.business} className="w-16 h-16 rounded-2xl object-cover border-2 border-white/10" />
        ) : (
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black text-white bg-[#33235C] border-2 border-[#7C4DD6]/50">
            {initialsOf(v.business)}
          </div>
        )}
      </div>
      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-bold text-white mb-1.5 text-sm">{v.business}</h3>
        {v.category && (
          <span className="self-start px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#A855F7]/15 border border-[#A855F7]/25 text-[#C9A6F5] mb-2.5">
            {v.category}
          </span>
        )}
        <p className="text-xs text-[#E5E7EB]/55 leading-relaxed mb-4 flex-1 line-clamp-3">
          {v.bio || "Come see us on the show floor at the 940 Collector's Expo."}
        </p>
        <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-3">
          {handle ? (
            <a
              href={instagramUrl(handle)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 text-xs text-[#E5E7EB]/55 hover:text-[#A855F7] transition-colors"
            >
              <AtSign size={13} />
              {handle}
            </a>
          ) : (
            <span />
          )}
          {tablesLabel && <span className="text-[11px] text-[#E5E7EB]/35 tabular-nums shrink-0">{tablesLabel}</span>}
        </div>
      </div>
    </motion.button>
  );
}

// Larger preview shown when a vendor card is clicked. Click the backdrop (or the
// ✕ / Esc) to close.
function VendorModal({ v, onClose }: { v: VendorListing; onClose: () => void }) {
  const logo = logoOf(v);
  const handle = instagramHandle(v.instagram);
  const tablesLabel = tablesLabelOf(v);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl bg-[#171022] border border-white/10 overflow-hidden shadow-2xl"
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 p-1.5 rounded-lg bg-black/40 text-white/70 hover:text-white"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="h-44 flex items-center justify-center bg-gradient-to-br from-[#A855F7]/25 to-[#6EE04A]/10">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={v.business} className="w-28 h-28 rounded-2xl object-cover border-2 border-white/15" />
          ) : (
            <div className="w-28 h-28 rounded-2xl flex items-center justify-center text-4xl font-black text-white bg-[#33235C] border-2 border-[#7C4DD6]/50">
              {initialsOf(v.business)}
            </div>
          )}
        </div>

        <div className="p-6">
          <h3 className="text-xl font-black text-white">{v.business}</h3>
          {v.category && (
            <span className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium bg-[#A855F7]/15 border border-[#A855F7]/25 text-[#C9A6F5]">
              {v.category}
            </span>
          )}
          <p className="text-sm text-[#E5E7EB]/75 leading-relaxed mt-4">
            {v.bio || "Come see us on the show floor at the 940 Collector's Expo."}
          </p>
          <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-white/10">
            {handle ? (
              <a
                href={instagramUrl(handle)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-[#A855F7] hover:underline"
              >
                <AtSign size={15} />
                {handle}
              </a>
            ) : (
              <span className="text-sm text-[#E5E7EB]/40">Find us on the floor</span>
            )}
            {tablesLabel && <span className="text-xs text-[#E5E7EB]/50 tabular-nums shrink-0">{tablesLabel}</span>}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// Public directory of confirmed vendors — so ticket buyers and prospective
// vendors can see who's coming and what they'll have. Built from data already
// loaded by the reservation context (no extra fetch).
export default function VendorDirectory() {
  const { confirmedVendors } = useReservation();
  const [q, setQ] = useState("");
  const [active, setActive] = useState<VendorListing | null>(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return confirmedVendors;
    return confirmedVendors.filter(
      (v) =>
        v.business.toLowerCase().includes(term) ||
        (v.category ?? "").toLowerCase().includes(term) ||
        (v.bio ?? "").toLowerCase().includes(term) ||
        (v.instagram ?? "").toLowerCase().includes(term)
    );
  }, [confirmedVendors, q]);

  const count = confirmedVendors.length;

  return (
    <section>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <p className="pixel-eyebrow text-[#A855F7] mb-2">Who&apos;s coming</p>
          <h2 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-2.5">
            <Store size={24} className="text-[#A855F7]" />
            Confirmed Vendors
            {count > 0 && <span className="text-lg font-bold text-[#E5E7EB]/40">({count})</span>}
          </h2>
          <p className="text-sm text-[#E5E7EB]/55 mt-2 max-w-xl">
            The vendors booked and confirmed for the show — tap any card for details before you grab a ticket or a
            table.
          </p>
        </div>
        {count > 4 && (
          <div className="relative w-full sm:w-64 shrink-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#E5E7EB]/40" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search vendors or collectibles…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#0B0713] border border-white/10 text-white text-sm placeholder-[#E5E7EB]/30 focus:outline-none focus:border-[#A855F7]/50"
            />
          </div>
        )}
      </div>

      {count === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-[#0B0713] p-10 text-center">
          <Store size={32} className="text-[#A855F7]/40 mx-auto mb-3" />
          <p className="text-white font-bold mb-1">Vendors are booking now</p>
          <p className="text-sm text-[#E5E7EB]/55 max-w-md mx-auto">
            Confirmed vendors will show up here with their logo, collectibles, and socials. Reserve a table to get your
            shop listed.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[#E5E7EB]/50 py-6">No vendors match &ldquo;{q}&rdquo;.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {filtered.map((v, i) => (
            <VendorCard key={v.resId} v={v} i={i} onOpen={setActive} />
          ))}
        </div>
      )}

      {active && <VendorModal v={active} onClose={() => setActive(null)} />}
    </section>
  );
}
