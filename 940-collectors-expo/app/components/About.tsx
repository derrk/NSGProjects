"use client";

import { motion } from "framer-motion";
import { Users, Repeat, TrendingUp, Heart } from "lucide-react";

const pillars = [
  {
    icon: Users,
    title: "Community First",
    desc: "We exist to connect collectors, vendors, and families who share a passion for the hobby.",
  },
  {
    icon: Repeat,
    title: "Buy, Sell & Trade",
    desc: "Whether you're hunting for that missing card or offloading a collection, this is your marketplace.",
  },
  {
    icon: TrendingUp,
    title: "Grow the Hobby",
    desc: "Every show grows the North Texas collector scene — cards, comics, toys, games and beyond.",
  },
  {
    icon: Heart,
    title: "Built for Everyone",
    desc: "Families, kids, seasoned collectors. The 940 Collectors Expo is for all ages and skill levels.",
  },
];

export default function About() {
  return (
    <section id="about" className="py-28 lg:py-36 bg-[#171022] relative overflow-hidden">
      {/* Subtle background accent */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-[#FACC15]/4 blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          {/* Left */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <p className="text-[#A855F7] pixel-eyebrow mb-4">
              Who We Are
            </p>
            <h2 className="text-4xl lg:text-5xl xl:text-6xl font-black text-white leading-tight mb-6">
              More Than<br />
              <span className="text-[#FACC15]">Just Cards</span>
            </h2>
            <p className="text-lg text-[#E5E7EB]/70 leading-relaxed mb-6">
              940 Collector&apos;s Expo was built on a simple belief: North Texas deserves a world-class collectibles event that brings the entire community together under one roof — not just card collectors, but everyone who loves the hunt.
            </p>
            <p className="text-lg text-[#E5E7EB]/70 leading-relaxed mb-8">
              Trading cards, Funko Pops, comics, LEGO, action figures, video games, anime figures, memorabilia — if it&apos;s collectible, you&apos;ll find a vendor for it here in Wichita Falls and the surrounding 940.
            </p>
            <div className="flex flex-wrap gap-3">
              {["Trading Cards", "Funko Pop", "Comics", "LEGO", "Action Figures", "Video Games", "Anime Figures", "Memorabilia"].map((tag) => (
                <span
                  key={tag}
                  className="px-4 py-1.5 rounded-full text-sm font-semibold bg-[#0B0713] border border-white/10 text-[#E5E7EB]/70"
                >
                  {tag}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Right - Pillars */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {pillars.map((p, i) => (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="p-6 rounded-2xl bg-[#0B0713] border border-white/5 hover:border-[#A855F7]/20 transition-all duration-300 group"
              >
                <div className="w-10 h-10 rounded-xl bg-[#A855F7]/10 flex items-center justify-center mb-4 group-hover:bg-[#A855F7]/20 transition-colors">
                  <p.icon size={20} className="text-[#A855F7]" />
                </div>
                <h3 className="font-bold text-white mb-2">{p.title}</h3>
                <p className="text-sm text-[#E5E7EB]/60 leading-relaxed">{p.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
