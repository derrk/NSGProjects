"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Minus, Plus, Ticket, Star, Gift } from "lucide-react";
import { TICKETS, EVENT_DATE_LABEL } from "../lib/site";
import { formatUSD } from "../reserve/tables";

function Stepper({
  value,
  onChange,
  min = 0,
  max = 20,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-8 h-8 rounded-lg bg-[#0B0713] border border-white/10 text-white flex items-center justify-center disabled:opacity-30 hover:border-[#A855F7]/50"
        aria-label="Decrease"
      >
        <Minus size={14} />
      </button>
      <span className="w-6 text-center font-bold text-white tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-8 h-8 rounded-lg bg-[#0B0713] border border-white/10 text-white flex items-center justify-center disabled:opacity-30 hover:border-[#A855F7]/50"
        aria-label="Increase"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

export default function TicketsPage() {
  const [vip, setVip] = useState(0);
  const [ga, setGa] = useState(0);
  const [extra, setExtra] = useState(0);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [canceled, setCanceled] = useState(false);

  useEffect(() => {
    fetch("/api/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setEnabled(!!j?.stripeEnabled))
      .catch(() => setEnabled(false));
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("canceled")) {
      setCanceled(true);
      window.history.replaceState({}, "", "/tickets");
    }
  }, []);

  const totalCents = vip * TICKETS.vip.priceCents + ga * TICKETS.general.priceCents + extra * TICKETS.extra.priceCents;
  const entries = vip * TICKETS.vip.entries + ga * TICKETS.general.entries + extra * TICKETS.extra.entries;
  const itemCount = vip + ga + extra;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (itemCount === 0) return setError("Add at least one ticket or entry.");
    if (!form.name.trim() || !form.phone.trim() || !form.email.trim())
      return setError("Please enter your name, phone, and email.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, vipQty: vip, gaQty: ga, extraEntries: extra }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok || !j.checkoutUrl) {
        const map: Record<string, string> = {
          payments_unavailable: "Online tickets aren't available right now — please try again later.",
          nothing_selected: "Add at least one ticket or entry.",
          missing_fields: "Please enter your name, phone, and email.",
          payment_init_failed: "Couldn't start checkout. Please try again.",
        };
        setError(map[j.error as string] ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      window.location.href = j.checkoutUrl; // to Stripe
    } catch {
      setError("Couldn't connect. Please try again.");
      setSubmitting(false);
    }
  };

  const inputCls =
    "w-full px-3.5 py-2.5 rounded-xl bg-[#0B0713] border border-white/10 text-white placeholder-[#E5E7EB]/25 focus:outline-none focus:border-[#A855F7]/50 text-sm";

  return (
    <main className="min-h-screen pt-24 pb-28 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-[#E5E7EB]/50 hover:text-white transition-colors mb-6">
          <ArrowLeft size={15} /> Back to home
        </Link>
        <p className="pixel-eyebrow text-[#A855F7] mb-3">Admission Tickets</p>
        <h1 className="text-3xl sm:text-4xl font-black text-white mb-3">Buy Tickets Online</h1>
        <p className="text-[#E5E7EB]/60 mb-8">{EVENT_DATE_LABEL} · Delta Hotel by Marriott, Wichita Falls, TX</p>

        {canceled && (
          <div className="mb-6 rounded-xl border border-[#FACC15]/40 bg-[#FACC15]/10 px-4 py-3 text-sm text-[#FACC15]/90">
            Checkout canceled — you weren&apos;t charged. Your selections are still here; try again when ready.
          </div>
        )}

        {enabled === false ? (
          <div className="retro-panel p-8 text-center">
            <Ticket size={36} className="text-[#A855F7]/50 mx-auto mb-3" />
            <p className="text-white font-bold mb-1">Online tickets are coming soon</p>
            <p className="text-sm text-[#E5E7EB]/60">Check back shortly — or grab tickets at the door on show day.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {/* VIP */}
            <div className="retro-panel p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-white flex items-center gap-1.5"><Star size={15} className="text-[#FACC15]" /> {TICKETS.vip.label} · {formatUSD(TICKETS.vip.priceCents)}</p>
                <p className="text-xs text-[#E5E7EB]/55 mt-0.5">{TICKETS.vip.blurb}</p>
              </div>
              <Stepper value={vip} onChange={setVip} />
            </div>
            {/* General */}
            <div className="retro-panel p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-white flex items-center gap-1.5"><Ticket size={15} className="text-[#A855F7]" /> {TICKETS.general.label} · {formatUSD(TICKETS.general.priceCents)}</p>
                <p className="text-xs text-[#E5E7EB]/55 mt-0.5">{TICKETS.general.blurb}</p>
              </div>
              <Stepper value={ga} onChange={setGa} />
            </div>
            {/* Extra entries */}
            <div className="retro-panel p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-white flex items-center gap-1.5"><Gift size={15} className="text-[#A855F7]" /> {TICKETS.extra.label} · {formatUSD(TICKETS.extra.priceCents)}</p>
                <p className="text-xs text-[#E5E7EB]/55 mt-0.5">{TICKETS.extra.blurb}</p>
              </div>
              <Stepper value={extra} onChange={setExtra} />
            </div>

            {/* Summary */}
            <div className="rounded-xl bg-[#0B0713] border border-white/5 p-4 text-sm space-y-1">
              <div className="flex items-center justify-between text-[#E5E7EB]/70">
                <span>Giveaway entries</span>
                <span className="font-bold text-[#A855F7]">{entries}</span>
              </div>
              <div className="flex items-center justify-between font-bold text-white pt-1">
                <span>Total</span>
                <span className="tabular-nums text-lg">{formatUSD(totalCents)}</span>
              </div>
            </div>

            {/* Buyer */}
            <div className="grid sm:grid-cols-2 gap-3">
              <input required placeholder="Full name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
              <input required type="tel" placeholder="Phone *" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={inputCls} />
            </div>
            <input required type="email" placeholder="Email * (we'll send your proof of purchase)" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={inputCls} />

            {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">{error}</p>}

            <button type="submit" disabled={submitting || itemCount === 0} className="retro-btn w-full disabled:opacity-50">
              {submitting ? "Starting checkout…" : itemCount === 0 ? "Select tickets" : `Pay ${formatUSD(totalCents)} — secure checkout`}
            </button>
            <p className="text-[11px] text-[#E5E7EB]/40 text-center">
              Secure card payment via Stripe. You&apos;ll get an email proof of purchase to show at the door.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
