"use client";

import { motion } from "framer-motion";
import { Calendar, MapPin, Clock } from "lucide-react";

const events: {
  title: string;
  date: string;
  time: string;
  location: string;
  status: "coming-soon" | "open";
  badge: string;
}[] = [
  {
    title: "940 Collectors Expo — Vol. 1",
    date: "Date TBA",
    time: "Time TBA",
    location: "Wichita Falls, TX",
    status: "coming-soon",
    badge: "Coming Soon",
  },
];

export default function UpcomingEvents() {
  return (
    <section id="events" className="py-28 lg:py-36 bg-[#0B0713] relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] rounded-full bg-[#A855F7]/5 blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-[#A855F7] pixel-eyebrow mb-4">
            Schedule
          </p>
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-4">
            Upcoming Events
          </h2>
          <p className="text-lg text-[#E5E7EB]/60 max-w-xl mx-auto">
            Our first show is on its way. Follow us on social media to be first when the date drops.
          </p>
        </motion.div>

        <div className="max-w-3xl mx-auto space-y-4">
          {events.map((event, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="group relative retro-panel hover:border-[#A855F7]/20 p-6 lg:p-8 transition-all duration-300"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#A855F7]/20 to-[#FACC15]/10 border border-[#A855F7]/20 flex items-center justify-center shrink-0">
                    <Calendar size={24} className="text-[#A855F7]" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-lg">{event.title}</h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                      <span className="flex items-center gap-1 text-sm text-[#E5E7EB]/50">
                        <Clock size={13} /> {event.time}
                      </span>
                      <span className="flex items-center gap-1 text-sm text-[#E5E7EB]/50">
                        <MapPin size={13} /> {event.location}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-[#FACC15]/10 text-[#FACC15] border border-[#FACC15]/20">
                    {event.badge}
                  </span>
                  <a
                    href="#contact"
                    className="px-5 py-2.5 rounded-full bg-[#A855F7] text-white text-sm font-semibold hover:bg-[#9333EA] transition-colors"
                  >
                    Get Notified
                  </a>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Future event teaser */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-6 max-w-3xl mx-auto rounded-2xl border border-dashed border-white/10 p-6 text-center"
        >
          <p className="text-[#E5E7EB]/30 text-sm font-medium">
            More shows coming in 2025 & 2026 — this calendar will fill up fast
          </p>
        </motion.div>
      </div>
    </section>
  );
}
