"use client";

import { motion } from "framer-motion";
import { ArrowRight, ChevronDown } from "lucide-react";

const categories = [
  "Sports Cards",
  "Pokémon & TCG",
  "Funko Pop",
  "Comics",
  "LEGO",
  "Action Figures",
  "Video Games",
  "Anime Figures",
  "Memorabilia",
  "& more",
];

export default function Hero() {
  return (
    <section
      id="home"
      className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden"
    >
      {/* Backdrop artwork */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(/hero-backdrop.jpg)" }}
      />
      {/* Legibility overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0B0713] via-[#0B0713]/75 to-[#0B0713]/20" />
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#0B0713]/90 to-transparent" />
      <div className="absolute inset-0 scanlines pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto w-full px-6 lg:px-8 pb-16 lg:pb-24 text-center">
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="pixel-eyebrow text-[#FACC15] mb-5"
        >
          Wichita Falls, TX · Delta Hotel by Marriott
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.05] mb-5"
          style={{ textShadow: "0 2px 24px rgba(0,0,0,0.8)" }}
        >
          The Premier Collector&apos;s Expo
          <br className="hidden sm:block" />{" "}
          in the{" "}
          <span className="bg-gradient-to-r from-[#A855F7] to-[#FACC15] bg-clip-text text-transparent">
            940
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="pixel-eyebrow text-white/80 mb-6"
        >
          Buy · Sell · Trade
        </motion.p>

        {/* Category chips */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-wrap justify-center gap-2 mb-9 max-w-2xl mx-auto"
        >
          {categories.map((cat) => (
            <span
              key={cat}
              className="px-3 py-1 rounded-md text-xs font-semibold bg-black/40 border border-white/15 text-[#E5E7EB]/90 backdrop-blur-sm"
            >
              {cat}
            </span>
          ))}
        </motion.div>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <a href="/reserve" className="retro-btn group">
            Reserve a Table
            <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </a>
          <a href="#contact" className="retro-btn-outline">
            Get Event Updates
          </a>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1 }}
        className="relative z-10 flex justify-center pb-5 text-[#E5E7EB]/40"
      >
        <ChevronDown size={18} className="animate-bounce" />
      </motion.div>
    </section>
  );
}
