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

const details = [
  {
    icon: Calendar,
    label: "Date",
    value: "Coming Soon",
    sub: "Check back for the official announcement",
  },
  {
    icon: Clock,
    label: "Hours",
    value: "TBA",
    sub: "Doors open to the public",
  },
  {
    icon: MapPin,
    label: "Venue",
    value: "TBA — Wichita Falls, TX",
    sub: "Full address announced with event date",
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
  {
    icon: Ticket,
    label: "Admission",
    value: "TBA",
    sub: "Affordable entry for collectors of all ages",
  },
  {
    icon: Truck,
    label: "Vendor Setup",
    value: "Morning of Event",
    sub: "Early load-in for registered vendors",
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
            Full event details will be announced as the show date approaches. Sign up below to be the first to know.
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

        {/* Map placeholder */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="rounded-3xl bg-[#0B0713] border border-white/5 overflow-hidden h-[280px] flex items-center justify-center"
        >
          <div className="text-center">
            <MapPin size={36} className="text-[#A855F7]/40 mx-auto mb-3" />
            <p className="text-[#E5E7EB]/40 font-medium">
              Map will appear here once venue is announced
            </p>
            <p className="text-[#E5E7EB]/25 text-sm mt-1">
              Wichita Falls, Texas
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
