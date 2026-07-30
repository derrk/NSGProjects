"use client";

import { motion } from "framer-motion";
import { Star, Zap, Trophy } from "lucide-react";

const tiers = [
  {
    icon: Star,
    name: "Bronze",
    color: "#CD7F32",
    bgColor: "#CD7F3215",
    borderColor: "#CD7F3230",
    perks: [
      "Logo on event website",
      "Social media mention",
      "Banner at event",
      "Table of contents listing",
    ],
    price: "Contact Us",
  },
  {
    icon: Zap,
    name: "Silver",
    color: "#C0C0C0",
    bgColor: "#C0C0C015",
    borderColor: "#C0C0C030",
    popular: true,
    perks: [
      "Everything in Bronze",
      "Featured sponsor placement",
      "Logo on printed materials",
      "PA announcement at event",
      "Complimentary vendor table",
    ],
    price: "Contact Us",
  },
  {
    icon: Trophy,
    name: "Gold",
    color: "#FACC15",
    bgColor: "#FACC1515",
    borderColor: "#FACC1530",
    perks: [
      "Everything in Silver",
      "Title sponsorship opportunity",
      "Premium logo placement",
      "Email marketing inclusion",
      "Stage & signage branding",
      "VIP event access",
    ],
    price: "Contact Us",
  },
];

export default function Sponsorship() {
  return (
    <section className="py-28 lg:py-36 bg-[#0B0713] relative overflow-hidden">
      <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[400px] h-[600px] rounded-full bg-[#FACC15]/4 blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-[#A855F7] pixel-eyebrow mb-4">
            Sponsorships
          </p>
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-4">
            Partner With Us
          </h2>
          <p className="text-lg text-[#E5E7EB]/60 max-w-xl mx-auto">
            Put your brand in front of a passionate, engaged audience of collectors across North Texas. Sponsorship packages are flexible — let&apos;s build something that works for you.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {tiers.map((tier, i) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className={`relative flex flex-col rounded-3xl border p-8 transition-all duration-300 ${
                tier.popular ? "scale-[1.03]" : ""
              }`}
              style={{
                backgroundColor: tier.bgColor,
                borderColor: tier.borderColor,
              }}
            >
              {tier.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-[#A855F7] text-white text-xs font-bold uppercase tracking-wide">
                  Most Popular
                </div>
              )}

              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-6"
                style={{ backgroundColor: `${tier.color}20` }}
              >
                <tier.icon size={22} style={{ color: tier.color }} />
              </div>

              <h3 className="text-2xl font-black text-white mb-1">{tier.name}</h3>
              <p className="text-sm font-semibold mb-6" style={{ color: tier.color }}>
                {tier.price}
              </p>

              <ul className="space-y-3 mb-8 flex-1">
                {tier.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2.5 text-sm text-[#E5E7EB]/70">
                    <span className="mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${tier.color}20` }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tier.color }} />
                    </span>
                    {perk}
                  </li>
                ))}
              </ul>

              <a
                href="#contact"
                className="block text-center px-5 py-3 rounded-full border font-semibold text-sm transition-all duration-200 hover:opacity-90"
                style={{
                  borderColor: tier.color,
                  color: tier.color,
                  backgroundColor: `${tier.color}10`,
                }}
              >
                Get in Touch
              </a>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="text-center text-[#E5E7EB]/30 text-sm mt-10"
        >
          Custom sponsorship packages available — contact us to discuss your goals.
        </motion.p>
      </div>
    </section>
  );
}
