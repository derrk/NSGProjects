"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Clock, CheckCircle, DollarSign, AlertTriangle, Upload, ImageIcon, CreditCard } from "lucide-react";
import { useReservation } from "./ReservationContext";
import { formatUSD, EVENT } from "./tables";

function fmt(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const CATEGORIES = [
  "Sports Cards",
  "Pokémon & TCG",
  "Funko Pop",
  "Comics",
  "LEGO",
  "Action Figures",
  "Video Games",
  "Anime Figures",
  "Memorabilia",
  "Toys / Collectibles",
  "Art / Accessories",
  "Other",
];

const BIO_MAX = 220;

type Step = "form" | "processing" | "done";

const EMPTY = {
  business: "",
  instagram: "",
  bio: "",
  photo: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  category: CATEGORIES[0],
  notes: "",
  agree: false,
};

export default function CheckoutModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { cart, pricing, remainingMs, holdExpiresAt, submitReservation, stripeEnabled } = useReservation();
  const [step, setStep] = useState<Step>("form");
  const [confirmation, setConfirmation] = useState<{ code: string; tables: number[]; total: number }>();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [payMethod, setPayMethod] = useState<"card" | "zelle">("card");
  const fileRef = useRef<HTMLInputElement>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Card only if Stripe is configured; otherwise everyone pays by Zelle.
  const method: "card" | "zelle" = stripeEnabled ? payMethod : "zelle";

  // If the modal reopens before the post-close reset fires, cancel that reset so
  // it can't wipe freshly-entered data.
  useEffect(() => {
    if (open && resetTimer.current) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  }, [open]);

  const expired = holdExpiresAt == null && step === "form";

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({
        ...f,
        [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value,
      }));

  // Downscale the uploaded photo to a small square data URL so it fits in
  // localStorage and renders crisply on the map.
  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const size = 200;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        setForm((f) => ({ ...f, photo: canvas.toDataURL("image/jpeg", 0.82) }));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStep("processing");
    const tables = [...cart];
    const total = pricing.totalCents;
    const result = await submitReservation(
      {
        business: form.business,
        instagram: form.instagram || undefined,
        bio: form.bio || undefined,
        photo: form.photo || undefined,
        email: form.email,
        firstName: form.firstName || undefined,
        lastName: form.lastName || undefined,
        phone: form.phone || undefined,
        category: form.category,
        amountCents: total,
      },
      method === "card" ? "stripe" : "zelle"
    );
    if ("error" in result) {
      setStep("form");
      setError(
        result.error === "conflict"
          ? `Table${(result.tables?.length ?? 0) > 1 ? "s" : ""} ${(result.tables ?? []).join(", ")} ${
              (result.tables?.length ?? 0) > 1 ? "were" : "was"
            } just taken — please pick again.`
          : result.error === "promo_exhausted"
            ? "The early-bird code is sold out. Remove the code to book at the regular price."
            : result.error === "payment_init_failed"
              ? "We couldn't start card checkout. Please try again, or choose Zelle."
              : "Something went wrong submitting your request. Please try again."
      );
      return;
    }
    // Trust the server's actual method: if it created a Stripe session, redirect;
    // otherwise (incl. card requested but Stripe unavailable) fall through to Zelle.
    if (result.paymentMethod === "stripe" && result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
      return; // stay on "processing" while the browser redirects
    }
    // Zelle path → show the hold + payment instructions.
    setConfirmation({ code: result.resCode, tables, total });
    setStep("done");
  };

  const close = () => {
    onClose();
    resetTimer.current = setTimeout(() => {
      setStep("form");
      setConfirmation(undefined);
      setError(null);
      setForm({ ...EMPTY });
      setPayMethod("card");
      resetTimer.current = null;
    }, 250);
  };

  const inputCls =
    "w-full px-3.5 py-2.5 rounded-xl bg-[#0B0713] border border-white/10 text-white placeholder-[#E5E7EB]/25 focus:outline-none focus:border-[#A855F7]/50 transition-colors text-sm";
  const labelCls = "block text-xs font-medium text-[#E5E7EB]/60 mb-1.5";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={close}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto retro-panel shadow-2xl"
          >
            <div className="flex items-center justify-between p-6 border-b border-white/5 sticky top-0 bg-[#171022] z-10">
              <h3 className="font-bold text-white text-lg">
                {step === "done" ? "Reservation Confirmed" : "Checkout"}
              </h3>
              <button
                onClick={close}
                className="p-1.5 rounded-lg text-[#E5E7EB]/50 hover:text-white hover:bg-white/5 transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6">
              {expired && step === "form" && (
                <div className="text-center py-8">
                  <AlertTriangle size={44} className="text-[#FACC15] mx-auto mb-4" />
                  <h4 className="text-lg font-bold text-white mb-2">Your hold expired</h4>
                  <p className="text-sm text-[#E5E7EB]/60 mb-6">
                    The {EVENT.holdMinutes}-minute window ran out and your tables were released.
                  </p>
                  <button
                    onClick={close}
                    className="px-6 py-3 rounded-full bg-[#A855F7] hover:bg-[#9333EA] text-white font-bold transition-colors"
                  >
                    Back to Floor Map
                  </button>
                </div>
              )}

              {step === "form" && !expired && (
                <form onSubmit={handleSubmit} className="space-y-6">
                  {holdExpiresAt != null && (
                    <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-[#A855F7]/10 border border-[#A855F7]/30 text-[#A855F7] text-sm font-medium">
                      <span className="flex items-center gap-2">
                        <Clock size={15} /> Complete checkout within
                      </span>
                      <span className="font-mono font-bold tabular-nums">{fmt(remainingMs)}</span>
                    </div>
                  )}

                  {/* Order summary */}
                  <div className="rounded-xl bg-[#0B0713] border border-white/5 p-4">
                    <p className="text-xs font-semibold text-[#E5E7EB]/40 uppercase tracking-widest mb-3">
                      Your Tables ({cart.length})
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {pricing.lines.map((l) => (
                        <span
                          key={l.id}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                            l.table.tableType === "endcap"
                              ? "bg-[#FACC15]/15 border border-[#FACC15]/40 text-[#FACC15]"
                              : "bg-[#A855F7]/15 border border-[#A855F7]/30 text-[#A855F7]"
                          }`}
                        >
                          {l.id}
                          {l.table.tableType === "endcap" && "·6′"}
                        </span>
                      ))}
                    </div>
                    <div className="space-y-1 text-sm border-t border-white/5 pt-3">
                      <SummaryRow label={`Tables (${cart.length})`} value={formatUSD(pricing.baseSubtotalCents)} />
                      {pricing.bundleDiscountCents > 0 && (
                        <SummaryRow label={`Corner bundle × ${pricing.bundleCount}`} value={`− ${formatUSD(pricing.bundleDiscountCents)}`} accent />
                      )}
                      {pricing.promoDiscountCents > 0 && (
                        <SummaryRow label={`Code ${pricing.promo?.code}`} value={`− ${formatUSD(pricing.promoDiscountCents)}`} accent />
                      )}
                      <div className="flex items-center justify-between font-bold text-white pt-1">
                        <span>Total</span>
                        <span className="tabular-nums text-base">{formatUSD(pricing.totalCents)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Vendor profile (shown on the map) */}
                  <div className="space-y-4">
                    <p className="text-xs font-semibold text-[#A855F7] uppercase tracking-widest">
                      Vendor profile — shown on the event map
                    </p>

                    {/* Photo uploader */}
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-xl overflow-hidden bg-[#0B0713] border border-white/10 flex items-center justify-center shrink-0">
                        {form.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={form.photo} alt="Vendor" className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon size={22} className="text-[#E5E7EB]/25" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} className="hidden" />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0B0713] border border-white/10 text-[#E5E7EB]/80 hover:text-white hover:border-[#A855F7]/40 transition-colors text-xs font-medium"
                          >
                            <Upload size={13} /> {form.photo ? "Change photo" : "Upload photo"}
                          </button>
                          {form.photo && (
                            <button
                              type="button"
                              onClick={() => setForm((f) => ({ ...f, photo: "" }))}
                              className="text-xs text-[#E5E7EB]/40 hover:text-red-400 transition-colors"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-[#E5E7EB]/40 mt-1.5 leading-snug">
                          Logo or headshot — replaces your table number on the map so people can find you.
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className={labelCls}>Business / vendor name *</label>
                      <input required value={form.business} onChange={set("business")} placeholder="Your Business" className={inputCls} />
                    </div>

                    <div>
                      <label className={labelCls}>Instagram handle (optional)</label>
                      <input value={form.instagram} onChange={set("instagram")} placeholder="@yourhandle" className={inputCls} />
                    </div>

                    <div>
                      <label className={labelCls}>
                        Short bio <span className="text-[#E5E7EB]/30">— vendor highlight</span>
                      </label>
                      <textarea
                        rows={3}
                        maxLength={BIO_MAX}
                        value={form.bio}
                        onChange={set("bio")}
                        placeholder="What do you sell? What should collectors stop by for?"
                        className={`${inputCls} resize-none`}
                      />
                      <p className="text-[11px] text-[#E5E7EB]/30 mt-1 text-right">
                        {form.bio.length}/{BIO_MAX}
                      </p>
                    </div>
                  </div>

                  {/* Contact */}
                  <div className="space-y-4">
                    <p className="text-xs font-semibold text-[#E5E7EB]/40 uppercase tracking-widest">
                      Contact — for your confirmation &amp; updates
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>First name *</label>
                        <input required value={form.firstName} onChange={set("firstName")} placeholder="First" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Last name *</label>
                        <input required value={form.lastName} onChange={set("lastName")} placeholder="Last" className={inputCls} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Email *</label>
                        <input required type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Phone *</label>
                        <input required type="tel" value={form.phone} onChange={set("phone")} placeholder="(940) 000-0000" className={inputCls} />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Vendor category</label>
                      <select value={form.category} onChange={set("category")} className={inputCls}>
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Special requests</label>
                      <textarea rows={2} value={form.notes} onChange={set("notes")} placeholder="Anything we should know? (optional)" className={`${inputCls} resize-none`} />
                    </div>
                  </div>

                  {/* Payment method */}
                  {stripeEnabled && (
                    <div>
                      <p className="text-xs font-semibold text-[#A855F7] uppercase tracking-widest mb-2">Payment</p>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setPayMethod("card")}
                          className={`flex flex-col items-start gap-0.5 p-3 rounded-xl border text-left transition-colors ${
                            method === "card" ? "bg-[#A855F7]/15 border-[#A855F7]/60" : "bg-[#0B0713] border-white/10 hover:border-white/20"
                          }`}
                        >
                          <span className="flex items-center gap-1.5 text-sm font-bold text-white">
                            <CreditCard size={15} /> Card
                          </span>
                          <span className="text-[11px] text-[#E5E7EB]/50">Instant — confirmed on payment</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPayMethod("zelle")}
                          className={`flex flex-col items-start gap-0.5 p-3 rounded-xl border text-left transition-colors ${
                            method === "zelle" ? "bg-[#FACC15]/15 border-[#FACC15]/60" : "bg-[#0B0713] border-white/10 hover:border-white/20"
                          }`}
                        >
                          <span className="flex items-center gap-1.5 text-sm font-bold text-white">
                            <DollarSign size={15} /> Zelle
                          </span>
                          <span className="text-[11px] text-[#E5E7EB]/50">Free — pay within {EVENT.zelleHoldHours}h</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Terms */}
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" required checked={form.agree} onChange={set("agree")} className="mt-0.5 accent-[#A855F7] w-4 h-4" />
                    <span className="text-xs text-[#E5E7EB]/60 leading-relaxed">
                      {method === "card"
                        ? `I agree to the ${EVENT.name} vendor terms. My table(s) are confirmed once payment succeeds.`
                        : `I agree to the ${EVENT.name} vendor terms and understand my table(s) are held pending my Zelle payment and confirmed once it's received.`}
                    </span>
                  </label>

                  {method === "card" ? (
                    /* Card checkout note */
                    <div className="rounded-xl border-2 border-[#A855F7]/40 bg-[#A855F7]/[0.06] p-4">
                      <p className="flex items-center gap-2 text-[#A855F7] font-bold text-sm mb-2">
                        <CreditCard size={16} /> Secure card checkout
                      </p>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-[#E5E7EB]/60">You&apos;ll pay</span>
                        <span className="font-bold text-white tabular-nums">{formatUSD(pricing.totalCents)}</span>
                      </div>
                      <p className="text-[11px] text-[#E5E7EB]/45 leading-snug">
                        You&apos;ll be taken to Stripe&apos;s secure checkout to pay by card. Your table locks in
                        the moment payment succeeds — no waiting for confirmation.
                      </p>
                    </div>
                  ) : (
                    /* Zelle payment instructions */
                    <div className="rounded-xl border-2 border-[#FACC15]/40 bg-[#FACC15]/[0.06] p-4">
                      <p className="flex items-center gap-2 text-[#FACC15] font-bold text-sm mb-2">
                        <DollarSign size={16} /> Pay by Zelle to hold your table
                      </p>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-[#E5E7EB]/60">Send exactly</span>
                          <span className="font-bold text-white tabular-nums">{formatUSD(pricing.totalCents)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#E5E7EB]/60">Zelle to</span>
                          <span className="font-medium text-white">{EVENT.zelle.name}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#E5E7EB]/60">Phone</span>
                          <span className="font-medium text-white">{EVENT.zelle.phone}</span>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-[#E5E7EB]/60 shrink-0">Memo</span>
                          <span className="font-medium text-white text-right">
                            {form.business ? `"${form.business}"` : "your business name"}
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-[#FACC15]/90 mt-3 leading-snug font-medium">
                        ⚠ Please send your Zelle within {EVENT.zelleHoldHours} hours to secure your table —
                        after that we may release the hold to make room for other vendors.
                      </p>
                    </div>
                  )}

                  {error && (
                    <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">
                      {error}
                    </p>
                  )}

                  <button type="submit" className="retro-btn w-full">
                    {method === "card"
                      ? "Continue to secure payment"
                      : `Submit & Hold My ${cart.length > 1 ? "Tables" : "Table"}`}
                  </button>
                </form>
              )}

              {step === "processing" && (
                <div className="text-center py-14">
                  <span className="inline-block animate-spin w-10 h-10 border-[3px] border-[#A855F7]/30 border-t-[#A855F7] rounded-full mb-5" />
                  <p className="text-white font-semibold">Submitting your request…</p>
                  <p className="text-sm text-[#E5E7EB]/50 mt-1">Holding your table(s)</p>
                </div>
              )}

              {step === "done" && confirmation && (
                <div className="text-center py-4">
                  <CheckCircle size={56} className="text-[#FACC15] mx-auto mb-5" />
                  <h4 className="text-xl font-bold text-white mb-1">
                    Your {confirmation.tables.length > 1 ? "tables are" : "table is"} held
                    {form.firstName ? `, ${form.firstName}` : ""}!
                  </h4>
                  <p className="text-sm text-[#E5E7EB]/60 mb-5">
                    Now send your Zelle payment to lock it in. We&apos;ll confirm your spot as soon as
                    it lands and email {form.email || "you"} the confirmation.
                  </p>

                  {/* Zelle payment card */}
                  <div className="rounded-xl border-2 border-[#FACC15]/40 bg-[#FACC15]/[0.06] p-4 mb-4 text-sm space-y-2 text-left">
                    <SummaryRow label="Send exactly" value={formatUSD(confirmation.total)} highlight />
                    <SummaryRow label="Zelle to" value={EVENT.zelle.name} />
                    <SummaryRow label="Phone" value={EVENT.zelle.phone} />
                    <SummaryRow label="Memo" value={form.business ? `"${form.business}"` : "your business name"} />
                    <SummaryRow label="Hold #" value={confirmation.code} />
                  </div>

                  <div className="rounded-xl bg-[#0B0713] border border-white/5 p-4 mb-5 text-sm">
                    <p className="text-xs font-semibold text-[#E5E7EB]/40 uppercase tracking-widest mb-2">
                      Held {confirmation.tables.length > 1 ? "tables" : "table"} at {EVENT.venueName}
                    </p>
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {confirmation.tables.map((id) => (
                        <span key={id} className="px-3 py-1.5 rounded-lg bg-[#FACC15]/15 border border-[#FACC15]/40 text-sm font-bold text-[#FACC15]">
                          {id}
                        </span>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs text-[#FACC15]/90 font-medium mb-3">
                    ⚠ Please send your Zelle within {EVENT.zelleHoldHours} hours to secure your table —
                    after that we may release the hold to make room for other vendors.
                  </p>
                  <p className="text-xs text-[#E5E7EB]/40 mb-5">
                    Your spot shows as <span className="text-[#FACC15] font-semibold">held / pending</span> on the
                    map until we confirm payment — then your {form.photo ? "photo" : "table"} locks it in.
                  </p>
                  <button onClick={close} className="retro-btn w-full">
                    Done
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SummaryRow({
  label,
  value,
  accent,
  highlight,
}: {
  label: string;
  value: string;
  accent?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[#E5E7EB]/60 shrink-0">{label}</span>
      <span
        className={`tabular-nums text-right ${
          highlight ? "text-[#FACC15] font-bold" : accent ? "text-green-400" : "text-[#E5E7EB]/85"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
