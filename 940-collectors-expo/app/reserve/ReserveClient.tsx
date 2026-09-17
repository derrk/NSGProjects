"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Info, Tag, ShoppingCart, X } from "lucide-react";
import { ReservationProvider, useReservation } from "./ReservationContext";
import ExpoFloorMap, { type FloorStatus, type FloorVendor } from "./ExpoFloorMap";
import CartPanel from "./CartPanel";
import CheckoutModal from "./CheckoutModal";
import VendorDirectory from "./VendorDirectory";
import { EVENT, formatUSD } from "./tables";
import { spookyFx } from "../lib/spooky";

// The booking floor map — the same ExpoFloorMap used in preview + admin, wired to
// the reservation cart: tap an open table to add it (green goop 🎃), tap a booked
// table to see the vendor (logo shown on their table).
function BookingMap() {
  const { vendors, cart, toggleTable, getVendor } = useReservation();
  const status: FloorStatus = {};
  const vendorInfo: Record<number, FloorVendor> = {};
  for (const key of Object.keys(vendors)) {
    const id = Number(key);
    const v = getVendor(id);
    if (!v) continue;
    status[id] = v.status === "confirmed" ? "confirmed" : "held";
    vendorInfo[id] = {
      business: v.business,
      photo: v.photo,
      instagram: v.instagram,
      bio: v.bio,
      resId: v.resId,
      status: v.status === "confirmed" ? "confirmed" : "held",
    };
  }
  return (
    <ExpoFloorMap
      status={status}
      vendors={vendorInfo}
      spotlightOnBooked
      showLogos
      selected={new Set(cart)}
      onTableClick={(id) => {
        if (!cart.includes(id)) spookyFx(); // 🎃 on adding a table
        toggleTable(id);
      }}
      maxHeight="74vh"
    />
  );
}

// A single color key in the map legend (a small table-colored swatch + label).
function LegendSwatch({ fill, stroke, label }: { fill: string; stroke: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block w-4 h-3 rounded-[2px]"
        style={{ background: fill, border: `1.5px solid ${stroke}` }}
      />
      {label}
    </span>
  );
}

// Live "X of Y tables available" chip — must be a child of ReservationProvider.
function AvailabilityChip() {
  const { availableCount, bookableCount } = useReservation();
  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#171022] border border-white/10 text-sm">
      <Info size={14} className="text-[#A855F7]" />
      <span className="text-[#E5E7EB]/70">
        <span className="font-bold text-white">{availableCount}</span> of {bookableCount} tables available
      </span>
    </div>
  );
}

// Live early-bird promo counter (X of 25 left) — hidden if no capped code exists.
function EarlyBirdChip() {
  const { promos } = useReservation();
  // Only advertise the early-bird code publicly; other admin codes stay unlisted.
  const eb = promos.find((p) => p.code === "EARLYBIRD940");
  if (!eb || eb.maxUses == null) return null;
  const gone = (eb.remaining ?? 0) <= 0;
  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm ${
        gone
          ? "bg-white/5 border-white/10 text-[#E5E7EB]/40"
          : "bg-[#6EE04A]/10 border-[#6EE04A]/35 text-[#9CF07E]"
      }`}
    >
      <Tag size={14} />
      {gone ? (
        <span>
          Early-bird code <span className="font-mono">{eb.code}</span> — sold out
        </span>
      ) : (
        <span>
          Early-bird <span className="font-mono font-bold">{eb.code}</span>:{" "}
          <span className="font-bold">{eb.remaining}</span> of {eb.maxUses} left · $85/table
        </span>
      )}
    </div>
  );
}

export default function ReserveClient() {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [canceled, setCanceled] = useState(false);
  const price = formatUSD(EVENT.standardPriceCents);

  // Returning from a canceled Stripe checkout (?canceled=1) — let them know.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("canceled")) {
      setCanceled(true);
      window.history.replaceState({}, "", "/reserve"); // don't re-show on refresh
    }
  }, []);

  return (
    <ReservationProvider>
      <main className="min-h-screen pt-24 pb-28 lg:pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {canceled && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-[#FACC15]/40 bg-[#FACC15]/10 px-4 py-3">
              <Info size={16} className="text-[#FACC15] mt-0.5 shrink-0" />
              <p className="text-sm text-[#FACC15]/90">
                Card checkout was canceled — you weren&apos;t charged. Your tables will reopen
                shortly; pick them again to retry, or choose Zelle at checkout.
              </p>
            </div>
          )}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <a
              href="/"
              className="inline-flex items-center gap-2 text-sm text-[#E5E7EB]/50 hover:text-white transition-colors mb-6"
            >
              <ArrowLeft size={15} /> Back to home
            </a>
            <p className="pixel-eyebrow text-[#A855F7] mb-3">Vendor Table Reservation</p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-4">
              Reserve Your Table
            </h1>
            <p className="text-base sm:text-lg text-[#E5E7EB]/60 max-w-2xl">
              Pick your spot on the {EVENT.venueName} floor, add one or more tables to
              your cart, and check out. Every table is a standard 8′ × 2.5′ table.
              Tables are held for {EVENT.holdMinutes} minutes while you complete your reservation.
            </p>

            <div className="flex flex-wrap gap-2.5 mt-6">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#171022] border border-white/10 text-sm">
                <span className="text-[#E5E7EB]/50">Tables from</span>
                <span className="font-bold text-white">{price}</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#171022] border border-white/10 text-sm">
                <span className="text-[#E5E7EB]/50">Table size</span>
                <span className="font-bold text-white">8′ × 2.5′</span>
              </div>
              <AvailabilityChip />
              <EarlyBirdChip />
            </div>

            {/* Color legend — what each table color means on the map. */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-xs text-[#E5E7EB]/60">
              <LegendSwatch fill="#33235C" stroke="#7C4DD6" label="Available" />
              <LegendSwatch fill="#A855F7" stroke="#D8B4FE" label="Your pick" />
              <LegendSwatch fill="#6EE04A" stroke="#3F9E1E" label="Booked" />
              <LegendSwatch fill="#F97316" stroke="#C2410C" label="Pending payment" />
              <span className="text-[#E5E7EB]/40">Tap a booked table to see who&apos;s there.</span>
            </div>
          </motion.div>

          <div className="grid lg:grid-cols-[1fr_360px] gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <BookingMap />
            </motion.div>

            {/* Desktop cart sidebar */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="hidden lg:block"
            >
              <CartPanel onCheckout={() => setCheckoutOpen(true)} />
            </motion.div>
          </div>

          {/* Public directory of confirmed vendors */}
          <VendorDirectory />
        </div>

        {/* Mobile sticky cart bar + slide-up sheet */}
        <MobileCart onCheckout={() => setCheckoutOpen(true)} />

        <CheckoutModal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} />
      </main>
    </ReservationProvider>
  );
}

function MobileCart({ onCheckout }: { onCheckout: () => void }) {
  const { cart, pricing } = useReservation();
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      {/* Sticky bar (only when something is selected) */}
      <AnimatePresence>
        {cart.length > 0 && !open && (
          <motion.button
            initial={{ y: 80 }}
            animate={{ y: 0 }}
            exit={{ y: 80 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-between gap-3 px-5 py-4 bg-[#A855F7] border-t-2 border-[#E9D5FF] shadow-[0_-4px_20px_rgba(0,0,0,0.5)]"
          >
            <span className="flex items-center gap-2 text-white font-pixel text-[10px]">
              <ShoppingCart size={16} />
              {cart.length} {cart.length === 1 ? "table" : "tables"}
            </span>
            <span className="flex items-center gap-2 text-white font-bold">
              {formatUSD(pricing.totalCents)}
              <span className="font-pixel text-[10px] bg-black/25 px-2.5 py-1.5 rounded-md">
                Review →
              </span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Bottom sheet */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-h-[85vh] overflow-y-auto rounded-t-3xl bg-[#171022] border-t-2 border-[#C7CAD1] p-4 pb-8"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="w-10 h-1 rounded-full bg-white/20 mx-auto" />
                <button
                  onClick={() => setOpen(false)}
                  className="absolute right-5 p-1.5 rounded-lg text-[#E5E7EB]/60 hover:text-white"
                  aria-label="Close cart"
                >
                  <X size={18} />
                </button>
              </div>
              <CartPanel
                onCheckout={() => {
                  setOpen(false);
                  onCheckout();
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
