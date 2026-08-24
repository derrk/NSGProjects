"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Info, Tag, ShoppingCart, X } from "lucide-react";
import { ReservationProvider, useReservation } from "./ReservationContext";
import FloorMap from "./FloorMap";
import CartPanel from "./CartPanel";
import CheckoutModal from "./CheckoutModal";
import { EVENT, formatUSD } from "./tables";

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
              your cart, and check out. Tables are held for {EVENT.holdMinutes} minutes
              while you complete your reservation.
            </p>

            <div className="flex flex-wrap gap-2.5 mt-6">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#171022] border border-white/10 text-sm">
                <span className="text-[#E5E7EB]/50">Tables from</span>
                <span className="font-bold text-white">{price}</span>
              </div>
              <AvailabilityChip />
              {EVENT.bundle.enabled && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#FACC15]/10 border border-[#FACC15]/25 text-sm">
                  <Tag size={14} className="text-[#FACC15]" />
                  <span className="text-[#FACC15]">
                    Bundle a 6′ corner with its 8′ neighbor and save{" "}
                    {formatUSD(EVENT.bundle.value)}
                  </span>
                </div>
              )}
            </div>
          </motion.div>

          <div className="grid lg:grid-cols-[1fr_360px] gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <FloorMap />
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
