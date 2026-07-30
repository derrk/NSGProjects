"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const faqs = [
  {
    q: "What kinds of collectibles are welcome?",
    a: "All of them. The 940 Collector's Expo is a full collectibles event — trading cards (sports, Pokémon, Magic, One Piece, Yu-Gi-Oh!), Funko Pops, comics, LEGO, action figures, video games, anime figures, memorabilia, and pretty much anything else worth collecting.",
  },
  {
    q: "Can I trade or sell as an attendee?",
    a: "Trading with other collectors on the floor is always welcome. If you want to sell as a vendor, just reserve a table — easy to do right here through the table map and reservation page.",
  },
  {
    q: "Can vendors reserve multiple tables?",
    a: "Yes! Vendors can request multiple tables when filling out the registration form. We offer single tables, double tables, and premium corner placements depending on availability.",
  },
  {
    q: "Are kids allowed?",
    a: "Absolutely — the 940 Collectors Expo is completely family friendly. Kids are welcome and admission will be affordable for families. We encourage young collectors to come and discover the hobby.",
  },
  {
    q: "Is parking free?",
    a: "Yes. Free parking is available for all attendees and vendors at the event venue. Vendor load-in areas will be designated to make setup easy.",
  },
  {
    q: "Can I buy tickets online?",
    a: "Online ticket sales are coming in the future. For the first event, stay tuned to our social media and mailing list for admission details as the show date approaches.",
  },
  {
    q: "How do I become a vendor?",
    a: "Just fill out our Vendor Registration Form on this page. Submit your information and we'll reach out with table availability, pricing, and confirmation details. No payment is required to apply.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      layout
      className="retro-panel hover:border-white/10 transition-colors overflow-hidden"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 p-6 text-left group"
      >
        <span className="font-semibold text-white text-sm lg:text-base group-hover:text-[#A855F7] transition-colors">
          {q}
        </span>
        <ChevronDown
          size={18}
          className={`text-[#E5E7EB]/40 shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <p className="px-6 pb-6 text-sm text-[#E5E7EB]/65 leading-relaxed">
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function FAQ() {
  return (
    <section id="faq" className="py-28 lg:py-36 bg-[#0B0713] relative overflow-hidden">
      <div className="absolute bottom-0 right-1/2 translate-x-1/2 w-[600px] h-[300px] rounded-full bg-[#A855F7]/5 blur-[100px] pointer-events-none" />

      <div className="max-w-3xl mx-auto px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <p className="text-[#A855F7] pixel-eyebrow mb-4">
            FAQ
          </p>
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-4">
            Common Questions
          </h2>
          <p className="text-lg text-[#E5E7EB]/60">
            Everything you need to know before your first visit.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="space-y-3"
        >
          {faqs.map((faq) => (
            <FAQItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="text-center text-[#E5E7EB]/40 text-sm mt-8"
        >
          Still have questions?{" "}
          <a href="#contact" className="text-[#A855F7] hover:underline">
            Contact us directly
          </a>
        </motion.p>
      </div>
    </section>
  );
}
