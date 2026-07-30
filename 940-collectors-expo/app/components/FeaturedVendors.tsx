"use client";

import { motion } from "framer-motion";
import { Globe, AtSign, MessageCircle } from "lucide-react";

const vendors = [
  {
    name: "Your Business Here",
    initials: "YB",
    desc: "Premier sports card dealer specializing in graded slabs and vintage singles. Find rare PSA 10s and BGS 9.5s.",
    tags: ["Sports Cards", "Graded Slabs"],
    color: "#A855F7",
  },
  {
    name: "Pop Culture Vault",
    initials: "PV",
    desc: "Funko Pops, exclusives, and grails — plus comics and anime figures for every fandom.",
    tags: ["Funko Pop", "Comics", "Anime"],
    color: "#FACC15",
  },
  {
    name: "Vendor Spot Available",
    initials: "VS",
    desc: "This could be your business. Reserve a table and put your brand in front of hundreds of collectors.",
    tags: ["Your Products"],
    color: "#A855F7",
  },
  {
    name: "Brick & Blocks",
    initials: "BB",
    desc: "Retired LEGO sets, minifigs, retro video games, and action figures. Something for every collector.",
    tags: ["LEGO", "Video Games", "Action Figures"],
    color: "#FACC15",
  },
];

export default function FeaturedVendors() {
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
            <p className="text-[#A855F7] pixel-eyebrow mb-4">
              Vendors
            </p>
            <h2 className="text-4xl lg:text-5xl font-black text-white">
              Featured Vendors
            </h2>
          </div>
          <p className="text-[#E5E7EB]/50 max-w-xs text-sm leading-relaxed">
            Placeholder vendor profiles. These will be updated with real vendors as they reserve their tables.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {vendors.map((v, i) => (
            <motion.div
              key={v.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="group flex flex-col rounded-2xl bg-[#0B0713] border border-white/5 hover:border-white/10 overflow-hidden transition-all duration-300 hover:-translate-y-1"
            >
              {/* Header */}
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

              {/* Body */}
              <div className="p-5 flex flex-col flex-1">
                <h3 className="font-bold text-white mb-2 text-sm">{v.name}</h3>
                <p className="text-xs text-[#E5E7EB]/50 leading-relaxed mb-4 flex-1">{v.desc}</p>
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
                <div className="flex items-center gap-2 border-t border-white/5 pt-4">
                  <button className="p-1.5 rounded-lg hover:bg-white/5 text-[#E5E7EB]/40 hover:text-[#E5E7EB] transition-colors">
                    <Globe size={14} />
                  </button>
                  <button className="p-1.5 rounded-lg hover:bg-white/5 text-[#E5E7EB]/40 hover:text-[#E5E7EB] transition-colors">
                    <AtSign size={14} />
                  </button>
                  <button className="p-1.5 rounded-lg hover:bg-white/5 text-[#E5E7EB]/40 hover:text-[#E5E7EB] transition-colors">
                    <MessageCircle size={14} />
                  </button>
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
