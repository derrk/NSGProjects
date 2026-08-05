"use client";

import { motion } from "framer-motion";
import {
  Calendar,
  Clock,
  MapPin,
  ParkingCircle,
  Utensils,
  Ticket,
  Truck,
} from "lucide-react";
import {
  VENUE,
  VENUE_ADDRESS,
  EVENT_DATE_LABEL,
  EVENT_HOURS_LABEL,
  EVENT_VIP_LABEL,
  VENDOR_SETUP_LABEL,
  ADMISSION,
  MAP_EMBED_SRC,
  MAP_LINK,
} from "../lib/site";

const details = [
  {
    icon: Calendar,
    label: "Date",
    value: EVENT_DATE_LABEL,
    sub: "Our debut show — Vol. 1",
  },
  {
    icon: Clock,
    label: "Hours",
    value: EVENT_HOURS_LABEL,
    sub: EVENT_VIP_LABEL,
  },
  {
    icon: MapPin,
    label: "Venue",
    value: VENUE.name,
    sub: VENUE_ADDRESS,
  },
  {
    icon: Ticket,
    label: "Admission",
    value: ADMISSION.doorLabel,
    sub: `${ADMISSION.kidsLabel} · ${ADMISSION.vipLabel}`,
  },
  {
    icon: Truck,
    label: "Vendor Setup",
    value: VENDOR_SETUP_LABEL,
    sub: "Load-in for registered vendors",
  },
  {
    icon: ParkingCircle,
    label: "Parking",
    value: "Free",
    sub: "Ample parking for vendors and guests",
  },
  {
    icon: Utensils,
    label: "Food",
    value: "On-Site Options",
    sub: "Food vendors and nearby restaurants",
  },
];

export default function EventInfo() {
  return (
    <section className="py-28 lg:py-36 bg-[#171022] relative overflow-hidden">
      <div className="absolute bottom-0 right-0 w-[500px] h-[400px] rounded-full bg-[#FACC15]/5 blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-[#A855F7] pixel-eyebrow mb-4">
            Event Details
          </p>
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-4">
            Plan Your Visit
          </h2>
          <p className="text-lg text-[#E5E7EB]/60 max-w-xl mx-auto">
            {`Saturday, ${EVENT_DATE_LABEL} at the ${VENUE.name} in Wichita Falls. Here's everything you need to plan your visit.`}
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-16">
          {details.map((d, i) => (
            <motion.div
              key={d.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className="p-6 rounded-2xl bg-[#0B0713] border border-white/5 hover:border-white/10 transition-all duration-300"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-[#A855F7]/10 flex items-center justify-center">
                  <d.icon size={18} className="text-[#A855F7]" />
                </div>
                <span className="text-xs font-semibold text-[#E5E7EB]/40 uppercase tracking-widest">
                  {d.label}
                </span>
              </div>
              <p className="font-bold text-white mb-1">{d.value}</p>
              <p className="text-xs text-[#E5E7EB]/40 leading-relaxed">{d.sub}</p>
            </motion.div>
          ))}
        </div>

        {/* Venue map */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="rounded-3xl bg-[#0B0713] border border-white/5 overflow-hidden"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-6 py-4 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#A855F7]/10 flex items-center justify-center shrink-0">
                <MapPin size={18} className="text-[#A855F7]" />
              </div>
              <div>
                <p className="font-bold text-white text-sm">{VENUE.name}</p>
                <p className="text-xs text-[#E5E7EB]/40">{VENUE_ADDRESS}</p>
              </div>
            </div>
            <a
              href={MAP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-full bg-[#A855F7] text-white text-xs font-semibold hover:bg-[#9333EA] transition-colors whitespace-nowrap"
            >
              Get directions →
            </a>
          </div>
          <iframe
            title={`Map to ${VENUE.name}, ${VENUE_ADDRESS}`}
            src={MAP_EMBED_SRC}
            className="w-full h-[320px] border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </motion.div>
      </div>
    </section>
  );
}
