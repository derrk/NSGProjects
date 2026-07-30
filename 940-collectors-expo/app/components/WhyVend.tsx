"use client";

import { motion } from "framer-motion";
import {
  Users,
  DollarSign,
  TrendingUp,
  Building2,
  ParkingCircle,
  Baby,
  CalendarDays,
  Zap,
} from "lucide-react";

const perks = [
  {
    icon: Users,
    title: "Large Collector Audience",
    desc: "Hundreds of passionate collectors walk the floor — your ideal customers, all in one place.",
    color: "#A855F7",
  },
  {
    icon: DollarSign,
    title: "Affordable Tables",
    desc: "Competitive table pricing designed to make vending a profitable experience from day one.",
    color: "#FACC15",
  },
  {
    icon: TrendingUp,
    title: "Growing Hobby Community",
    desc: "North Texas's card hobby is booming. Be part of the wave while it's still early.",
    color: "#A855F7",
  },
  {
    icon: Building2,
    title: "Indoor Venue",
    desc: "Climate-controlled space. No weather worries — just comfortable buying and selling.",
    color: "#FACC15",
  },
  {
    icon: ParkingCircle,
    title: "Free Parking",
    desc: "Ample free parking for vendors and attendees alike. Easy setup and load-out.",
    color: "#A855F7",
  },
  {
    icon: Baby,
    title: "Family Friendly",
    desc: "A welcoming environment for all ages — great for family vendors and young collectors.",
    color: "#FACC15",
  },
  {
    icon: CalendarDays,
    title: "Recurring Annual Events",
    desc: "Build your customer base show after show. Returning vendors get priority table placement.",
    color: "#A855F7",
  },
  {
    icon: Zap,
    title: "High Foot Traffic",
    desc: "Marketed heavily on social media and locally — expect a well-attended, energetic floor.",
    color: "#FACC15",
  },
];

export default function WhyVend() {
  return (
    <section className="py-28 lg:py-36 bg-[#0B0713] relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[900px] h-[300px] bg-[#A855F7]/5 blur-[100px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-[#A855F7] pixel-eyebrow mb-4">
            Why Vendors Love Us
          </p>
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-4">
            Everything You Need<br />to Run a Great Show
          </h2>
          <p className="text-lg text-[#E5E7EB]/60 max-w-xl mx-auto">
            We take care of the venue, the marketing, and the foot traffic. You focus on what you do best — selling great cards.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {perks.map((perk, i) => (
            <motion.div
              key={perk.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className="group p-6 retro-panel hover:border-white/10 hover:-translate-y-1 transition-all duration-300 cursor-default"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-5 transition-transform group-hover:scale-110"
                style={{ backgroundColor: `${perk.color}15` }}
              >
                <perk.icon size={22} style={{ color: perk.color }} />
              </div>
              <h3 className="font-bold text-white mb-2 text-sm">{perk.title}</h3>
              <p className="text-xs text-[#E5E7EB]/55 leading-relaxed">{perk.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
