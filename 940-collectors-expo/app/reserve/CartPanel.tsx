"use client";

import { Clock, X, ShoppingCart, Trash2, Tag, Sparkles, Info } from "lucide-react";
import { useReservation } from "./ReservationContext";
import { formatUSD } from "./tables";

function fmt(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function CartPanel({ onCheckout }: { onCheckout: () => void }) {
  const {
    cart,
    pricing,
    promoInput,
    setPromoInput,
    remainingMs,
    holdExpiresAt,
    removeFromCart,
    clearCart,
  } = useReservation();

  const low = holdExpiresAt != null && remainingMs > 0 && remainingMs < 3 * 60 * 1000;

  // End caps in the cart that aren't yet bundled -> nudge the vendor.
  const unbundledHints = pricing.lines
    .filter((l) => l.table.tableType === "endcap" && l.bundledWith == null)
    .map((l) => ({ id: l.id, options: l.table.adjacentTableIds }));

  return (
    <div className="retro-panel p-5 lg:sticky lg:top-24">
      <div className="flex items-center justify-between mb-4">
        <h3 className="flex items-center gap-2 font-bold text-white">
          <ShoppingCart size={18} className="text-[#A855F7]" />
          Your Cart
        </h3>
        {cart.length > 0 && (
          <button
            onClick={clearCart}
            className="flex items-center gap-1 text-xs text-[#E5E7EB]/50 hover:text-[#E5E7EB] transition-colors"
          >
            <Trash2 size={13} /> Clear
          </button>
        )}
      </div>

      {holdExpiresAt != null && (
        <div
          className={`flex items-center justify-between gap-2 mb-4 px-3 py-2.5 rounded-xl border text-sm font-medium ${
            low
              ? "bg-red-500/10 border-red-500/30 text-red-300"
              : "bg-[#A855F7]/10 border-[#A855F7]/30 text-[#A855F7]"
          }`}
        >
          <span className="flex items-center gap-2">
            <Clock size={15} /> Held for
          </span>
          <span className="font-mono font-bold tabular-nums text-base">{fmt(remainingMs)}</span>
        </div>
      )}

      {cart.length === 0 ? (
        <div className="py-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-3">
            <ShoppingCart size={20} className="text-[#E5E7EB]/30" />
          </div>
          <p className="text-sm text-[#E5E7EB]/40">
            No tables selected yet.
            <br />
            Tap a table on the map to begin.
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2 mb-4 max-h-56 overflow-y-auto pr-1">
            {pricing.lines.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-[#0B0713] border border-white/5"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                      l.table.tableType === "endcap"
                        ? "bg-[#FACC15]/15 border border-[#FACC15]/40 text-[#FACC15]"
                        : "bg-[#A855F7]/15 border border-[#A855F7]/30 text-[#A855F7]"
                    }`}
                  >
                    {l.id}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm text-white font-medium truncate">
                      Table {l.id}
                      {l.table.tableType === "endcap" && " · 6′"}
                    </span>
                    <span className="block text-[11px] text-[#E5E7EB]/40 truncate">
                      {l.bundledWith != null
                        ? `Bundled with #${l.bundledWith}`
                        : l.table.zone}
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className="text-sm text-[#E5E7EB]/70 tabular-nums">
                    {formatUSD(l.baseCents)}
                  </span>
                  <button
                    onClick={() => removeFromCart(l.id)}
                    className="text-[#E5E7EB]/40 hover:text-red-400 transition-colors"
                    aria-label={`Remove table ${l.id}`}
                  >
                    <X size={15} />
                  </button>
                </span>
              </li>
            ))}
          </ul>

          {/* End-cap bundle nudges */}
          {unbundledHints.map((h) => (
            <div
              key={h.id}
              className="flex items-start gap-2 mb-3 px-3 py-2 rounded-xl bg-[#FACC15]/[0.07] border border-[#FACC15]/20 text-[11px] text-[#FACC15]/90"
            >
              <Info size={13} className="mt-0.5 shrink-0" />
              <span>
                Add table {h.options.join(" or ")} to unlock the end-cap bundle discount on #{h.id}.
              </span>
            </div>
          ))}

          {/* Promo code */}
          <div className="mb-4">
            <label className="flex items-center gap-1.5 text-xs font-medium text-[#E5E7EB]/60 mb-1.5">
              <Tag size={12} /> Discount code
            </label>
            <input
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value)}
              placeholder="Enter code (optional)"
              className={`w-full px-3.5 py-2.5 rounded-xl bg-[#0B0713] border text-white placeholder-[#E5E7EB]/25 focus:outline-none transition-colors text-sm uppercase ${
                pricing.promo
                  ? "border-green-500/50"
                  : pricing.promoInvalid
                    ? "border-red-500/50"
                    : "border-white/10 focus:border-[#A855F7]/50"
              }`}
            />
            {pricing.promo && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-green-400">
                <Sparkles size={12} /> {pricing.promo.code} applied — {pricing.promo.label}
              </p>
            )}
            {pricing.promoInvalid && (
              <p className="mt-1.5 text-xs text-red-400">That code isn&apos;t valid.</p>
            )}
          </div>

          {/* Totals */}
          <div className="border-t border-white/10 pt-4 space-y-1.5 mb-4 text-sm">
            <Row label={`Tables (${cart.length})`} value={formatUSD(pricing.baseSubtotalCents)} muted />
            {pricing.bundleDiscountCents > 0 && (
              <Row
                label={`End-cap bundle × ${pricing.bundleCount}`}
                value={`− ${formatUSD(pricing.bundleDiscountCents)}`}
                accent
              />
            )}
            {pricing.promoDiscountCents > 0 && (
              <Row
                label={`Code ${pricing.promo?.code}`}
                value={`− ${formatUSD(pricing.promoDiscountCents)}`}
                accent
              />
            )}
            <div className="flex items-center justify-between font-bold text-white pt-1.5">
              <span>Total</span>
              <span className="text-lg tabular-nums">{formatUSD(pricing.totalCents)}</span>
            </div>
          </div>

          <button
            onClick={onCheckout}
            className="w-full px-5 py-3.5 rounded-full retro-btn text-white font-bold transition-all duration-200 hover:shadow-lg hover:shadow-purple-500/25"
          >
            Checkout · {formatUSD(pricing.totalCents)}
          </button>
        </>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  accent,
}: {
  label: string;
  value: string;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-[#E5E7EB]/60" : accent ? "text-green-400" : "text-white"}>
        {label}
      </span>
      <span className={`tabular-nums ${accent ? "text-green-400" : "text-[#E5E7EB]/80"}`}>
        {value}
      </span>
    </div>
  );
}
