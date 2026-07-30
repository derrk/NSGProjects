"use client";

import { motion } from "framer-motion";
import { Image as ImageIcon } from "lucide-react";

const placeholders = [
  { label: "Vendor Floor", aspect: "aspect-[4/3]" },
  { label: "Rare Finds", aspect: "aspect-square" },
  { label: "Crowd", aspect: "aspect-[4/3]" },
  { label: "Graded Slabs", aspect: "aspect-square" },
  { label: "Kids Trading", aspect: "aspect-[4/3]" },
  { label: "Giveaways", aspect: "aspect-square" },
  { label: "Vendor Tables", aspect: "aspect-[4/3]" },
  { label: "Show Floor", aspect: "aspect-square" },
];

export default function Gallery() {
  return (
    <section className="py-28 lg:py-36 bg-[#171022] relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-[#A855F7] pixel-eyebrow mb-4">
            Gallery
          </p>
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-4">
            The Show Floor
          </h2>
          <p className="text-lg text-[#E5E7EB]/60 max-w-xl mx-auto">
            Photos from previous shows will appear here. We&apos;re just getting started — the best memories are ahead.
          </p>
        </motion.div>

        {/* Masonry-style grid */}
        <div className="columns-2 md:columns-3 lg:columns-4 gap-3 space-y-3">
          {placeholders.map((p, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.97 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
              className={`break-inside-avoid rounded-2xl bg-[#0B0713] border border-white/5 overflow-hidden ${p.aspect} flex items-center justify-center group cursor-pointer hover:border-[#A855F7]/20 transition-all duration-300 hover:-translate-y-0.5`}
            >
              <div className="flex flex-col items-center gap-2 opacity-30 group-hover:opacity-50 transition-opacity p-4">
                <ImageIcon size={28} className="text-[#E5E7EB]" />
                <span className="text-xs font-medium text-[#E5E7EB] text-center">{p.label}</span>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="text-center mt-10"
        >
          <p className="text-[#E5E7EB]/30 text-sm">
            After each event, the gallery will be updated with real photography from the show floor.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
