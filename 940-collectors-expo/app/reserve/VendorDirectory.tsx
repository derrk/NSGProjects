"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AtSign, Store, Search } from "lucide-react";
import { useReservation } from "./ReservationContext";
import type { VendorListing } from "./ReservationContext";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function igUrl(handle: string): string {
  return `https://instagram.com/${handle.replace(/^@/, "").trim()}`;
}

function VendorCard({ v, i }: { v: VendorListing; i: number }) {
  const logo = v.photo && v.photo.startsWith("data:image/") ? v.photo : null;
  const tablesLabel =
    v.tables.length > 1 ? `Tables ${v.tables.join(", ")}` : v.tables.length === 1 ? `Table ${v.tables[0]}` : "";
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: Math.min(i, 8) * 0.05 }}
      className="group flex flex-col rounded-2xl bg-[#0B0713] border border-white/5 hover:border-[#A855F7]/30 overflow-hidden transition-all duration-300 hover:-translate-y-1"
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
        <p className="text-xs text-[#E5E7EB]/55 leading-relaxed mb-4 flex-1">
          {v.bio || "Come see us on the show floor at the 940 Collector's Expo."}
        </p>
        <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-3">
          {v.instagram ? (
            <a
              href={igUrl(v.instagram)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-[#E5E7EB]/55 hover:text-[#A855F7] transition-colors"
            >
              <AtSign size={13} />
              {v.instagram.replace(/^@/, "")}
            </a>
          ) : (
            <span />
          )}
          {tablesLabel && <span className="text-[11px] text-[#E5E7EB]/35 tabular-nums shrink-0">{tablesLabel}</span>}
        </div>
      </div>
    </motion.div>
  );
}

// Public directory of confirmed vendors — so ticket buyers and prospective
// vendors can see who's coming and what they'll have. Built from data already
// loaded by the reservation context (no extra fetch).
export default function VendorDirectory() {
  const { confirmedVendors } = useReservation();
  const [q, setQ] = useState("");

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
    <section className="mt-14 pt-10 border-t border-white/10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <p className="pixel-eyebrow text-[#A855F7] mb-2">Who&apos;s coming</p>
          <h2 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-2.5">
            <Store size={24} className="text-[#A855F7]" />
            Confirmed Vendors
            {count > 0 && <span className="text-lg font-bold text-[#E5E7EB]/40">({count})</span>}
          </h2>
          <p className="text-sm text-[#E5E7EB]/55 mt-2 max-w-xl">
            The vendors booked and confirmed for the show — see who&apos;ll be there and what they&apos;ll have before
            you grab a ticket or a table.
          </p>
        </div>
        {count > 6 && (
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
            Confirmed vendors will show up here with their logo, collectibles, and socials. Reserve a table above to
            get your shop listed.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[#E5E7EB]/50 py-6">No vendors match &ldquo;{q}&rdquo;.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((v, i) => (
            <VendorCard key={v.resId} v={v} i={i} />
          ))}
        </div>
      )}
    </section>
  );
}
