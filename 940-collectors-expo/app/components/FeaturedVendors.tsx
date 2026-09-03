"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AtSign, Star } from "lucide-react";

// Fallback cards shown before any vendor has been starred in the admin.
// Deliberately generic "open slot" copy — nothing here should read as a real,
// confirmed vendor.
const placeholders = [
  {
    name: "Your Booth Here",
    initials: "?",
    desc: "Sports cards, graded slabs, vintage singles — reserve a table and put your shop in front of hundreds of collectors.",
    tags: ["Available"],
    color: "#A855F7",
  },
  {
    name: "Your Booth Here",
    initials: "?",
    desc: "Funko Pops, comics, anime figures, and more. This spot is waiting for a vendor like you.",
    tags: ["Available"],
    color: "#FACC15",
  },
  {
    name: "Your Booth Here",
    initials: "?",
    desc: "New or seasoned dealer? Claim a table and get featured right here on the homepage.",
    tags: ["Available"],
    color: "#A855F7",
  },
  {
    name: "Your Booth Here",
    initials: "?",
    desc: "LEGO, retro video games, action figures, memorabilia — there's room for your collection on the floor.",
    tags: ["Available"],
    color: "#FACC15",
  },
];

interface FeaturedRes {
  resCode: string;
  business: string;
  instagram: string | null;
  bio: string | null;
  photo: string | null;
  category: string | null;
}

interface Vendor {
  resCode: string;
  business: string;
  desc: string;
  instagram: string | null;
  photo: string | null;
  tags: string[];
  color: string;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function igUrl(handle: string): string {
  return `https://instagram.com/${handle.replace(/^@/, "").trim()}`;
}

export default function FeaturedVendors() {
  const [vendors, setVendors] = useState<Vendor[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/featured", { cache: "no-store" });
        if (!res.ok) return;
        const json: { vendors?: FeaturedRes[] } = await res.json();
        const byCode = new Map<string, Vendor>();
        for (const r of json.vendors ?? []) {
          if (byCode.has(r.resCode)) continue;
          byCode.set(r.resCode, {
            resCode: r.resCode,
            business: r.business,
            desc: r.bio || "Come see us on the show floor at the 940 Collector's Expo.",
            instagram: r.instagram,
            photo: r.photo,
            tags: r.category ? [r.category] : [],
            color: byCode.size % 2 === 0 ? "#A855F7" : "#FACC15",
          });
        }
        if (!cancelled) setVendors([...byCode.values()]);
      } catch {
        /* leave empty -> placeholders render */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasReal = vendors.length > 0;

  return (
    <section className="py-28 lg:py-36 bg-[#171022] relative overflow-hidden">
      <div className="absolute bottom-0 left-0 w-[500px] h-[400px] rounded-full bg-[#A855F7]/5 blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-12"
        >
          <div>
            <p className="text-[#A855F7] pixel-eyebrow mb-4">Vendors</p>
            <h2 className="text-4xl lg:text-5xl font-black text-white">
              Featured Vendors
            </h2>
          </div>
          <p className="text-[#E5E7EB]/50 max-w-xs text-sm leading-relaxed">
            {hasReal
              ? "A few of the vendors you'll find on the floor. Reserve a table and you could be featured here too."
              : "Vendor spotlights will appear here as they reserve their tables. Reserve yours to get featured."}
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {hasReal
            ? vendors.map((v, i) => (
                <motion.div
                  key={v.resCode}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.08 }}
                  className="group flex flex-col rounded-2xl bg-[#0B0713] border border-white/5 hover:border-white/10 overflow-hidden transition-all duration-300 hover:-translate-y-1"
                >
                  <div
                    className="h-28 flex items-center justify-center relative"
                    style={{ background: `linear-gradient(135deg, ${v.color}20, ${v.color}08)` }}
                  >
                    <span className="absolute top-2 right-2 text-[#FACC15]">
                      <Star size={14} fill="currentColor" />
                    </span>
                    {v.photo && v.photo.startsWith("data:image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.photo}
                        alt={v.business}
                        className="w-16 h-16 rounded-2xl object-cover border-2 border-white/10"
                      />
                    ) : (
                      <div
                        className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black text-white"
                        style={{ backgroundColor: v.color }}
                      >
                        {initialsOf(v.business)}
                      </div>
                    )}
                  </div>

                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="font-bold text-white mb-2 text-sm">{v.business}</h3>
                    <p className="text-xs text-[#E5E7EB]/50 leading-relaxed mb-4 flex-1">{v.desc}</p>
                    {v.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {v.tags.map((t) => (
                          <span
                            key={t}
                            className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/5 border border-white/5 text-[#E5E7EB]/50"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    {v.instagram && (
                      <div className="flex items-center gap-2 border-t border-white/5 pt-4">
                        <a
                          href={igUrl(v.instagram)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-[#E5E7EB]/50 hover:text-[#A855F7] transition-colors"
                        >
                          <AtSign size={14} />
                          {v.instagram.startsWith("@") ? v.instagram : `@${v.instagram}`}
                        </a>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))
            : placeholders.map((v, i) => (
                <motion.div
                  key={`placeholder-${i}`}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.08 }}
                  className="group flex flex-col rounded-2xl bg-[#0B0713] border border-white/5 hover:border-white/10 overflow-hidden transition-all duration-300 hover:-translate-y-1"
                >
                  <div
                    className="h-28 flex items-center justify-center"
                    style={{ background: `linear-gradient(135deg, ${v.color}20, ${v.color}08)` }}
                  >
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black text-white"
                      style={{ backgroundColor: v.color }}
                    >
                      {v.initials}
                    </div>
                  </div>

                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="font-bold text-white mb-2 text-sm">{v.name}</h3>
                    <p className="text-xs text-[#E5E7EB]/50 leading-relaxed mb-4 flex-1">{v.desc}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {v.tags.map((t) => (
                        <span
                          key={t}
                          className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/5 border border-white/5 text-[#E5E7EB]/50"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-center mt-10"
        >
          <a
            href="/reserve"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-[#A855F7]/30 text-[#A855F7] font-semibold hover:bg-[#A855F7]/10 transition-colors text-sm"
          >
            Reserve Your Table — Get Listed Here
          </a>
        </motion.div>
      </div>
    </section>
  );
}
