"use client";

import { motion } from "framer-motion";
import { ArrowRight, CheckCircle } from "lucide-react";

const benefits = [
  "Access to hundreds of passionate collectors",
  "Local market exposure across the 940",
  "Network with other vendors and hobbyists",
  "Grow your business at a recurring show",
  "Indoor, climate-controlled environment",
  "Free parking & easy load-in",
];

export default function VendorSection() {
  return (
    <section id="vendors" className="py-28 lg:py-36 bg-[#171022] relative overflow-hidden">
      <div className="absolute top-0 left-0 w-[600px] h-[600px] rounded-full bg-[#A855F7]/5 blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <p className="text-[#A855F7] pixel-eyebrow mb-4">
              Vendor Opportunities
            </p>
            <h2 className="text-4xl lg:text-5xl xl:text-6xl font-black text-white leading-tight mb-6">
              Become A<br />
              <span className="bg-gradient-to-r from-[#A855F7] to-[#FACC15] bg-clip-text text-transparent">
                Vendor
              </span>
            </h2>
            <p className="text-lg text-[#E5E7EB]/70 leading-relaxed mb-8">
              Secure your table at the 940 Collectors Expo and put your business in front of hundreds of motivated collectors. Whether you&apos;re an established dealer or setting up for the first time, this is your platform to grow.
            </p>

            <ul className="space-y-3 mb-10">
              {benefits.map((b) => (
                <li key={b} className="flex items-center gap-3">
                  <CheckCircle size={18} className="text-[#A855F7] shrink-0" />
                  <span className="text-[#E5E7EB]/80 text-sm">{b}</span>
                </li>
              ))}
            </ul>

            <a
              href="/reserve"
              className="group inline-flex items-center gap-2 px-8 py-4 rounded-full retro-btn text-white font-bold text-lg transition-all duration-200 hover:shadow-xl hover:shadow-purple-500/30 hover:-translate-y-0.5"
            >
              Reserve Your Table
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </a>
          </motion.div>

          {/* Right - Visual Card */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="relative"
          >
            <div className="rounded-3xl bg-gradient-to-br from-[#A855F7]/20 to-[#FACC15]/10 border border-[#A855F7]/20 p-8 lg:p-10">
              <div className="mb-8">
                <p className="text-[#E5E7EB]/50 text-sm font-medium uppercase tracking-widest mb-1">Table Pricing</p>
                <p className="text-white text-5xl font-black">
                  $99.99<span className="text-xl text-[#E5E7EB]/50 font-bold"> / table</span>
                </p>
                <p className="text-[#E5E7EB]/50 text-sm mt-1">One flat rate — reserve online in minutes</p>
              </div>

              <div className="space-y-4 mb-8">
                {[
                  { label: "Pick Your Spot", note: "Choose your exact table on the floor map" },
                  { label: "Reserve Multiple", note: "Add as many tables as you need" },
                  { label: "20-Minute Hold", note: "Tables held while you check out" },
                ].map((tier) => (
                  <div key={tier.label} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                    <div>
                      <p className="text-white font-semibold text-sm">{tier.label}</p>
                      <p className="text-[#E5E7EB]/40 text-xs">{tier.note}</p>
                    </div>
                    <span className="text-[#FACC15] font-bold text-lg">✓</span>
                  </div>
                ))}
              </div>

              <a
                href="/reserve"
                className="block w-full text-center px-6 py-3.5 rounded-full bg-white text-[#0B0713] font-bold hover:bg-[#E5E7EB] transition-colors"
              >
                Reserve Your Table Now
              </a>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
