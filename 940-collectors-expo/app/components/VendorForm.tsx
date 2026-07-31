"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Send, CheckCircle } from "lucide-react";

const products = [
  "Sports Cards",
  "Pokémon & TCG",
  "Graded Slabs",
  "Sealed Product",
  "Funko Pop",
  "Comics",
  "LEGO",
  "Action Figures",
  "Video Games",
  "Anime Figures",
  "Memorabilia",
  "Toys / Collectibles",
  "Other",
];

export default function VendorForm() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      business: fd.get("business"),
      contactName: fd.get("contactName"),
      email: fd.get("email"),
      phone: fd.get("phone"),
      products: fd.getAll("products"),
      tablesRequested: fd.get("tablesRequested"),
      website: fd.get("website"),
      social: fd.get("social"),
      notes: fd.get("notes"),
    };
    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("failed");
      setSubmitted(true);
    } catch {
      setError("Something went wrong sending your info — please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      id="vendor-form"
      className="py-28 lg:py-36 bg-[#0B0713] relative overflow-hidden"
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] rounded-full bg-[#A855F7]/6 blur-[100px] pointer-events-none" />

      <div className="max-w-3xl mx-auto px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <p className="text-[#A855F7] pixel-eyebrow mb-4">
            Vendor Registration
          </p>
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-4">
            Reserve Your Table
          </h2>
          <p className="text-[#E5E7EB]/60 text-lg">
            Questions or want us to reach out? Drop your info below.
          </p>
          <p className="text-sm text-[#E5E7EB]/50 mt-3">
            Ready to lock in your spot?{" "}
            <a href="/reserve" className="text-[#A855F7] font-semibold hover:underline">
              Reserve your exact table →
            </a>
          </p>
        </motion.div>

        {submitted ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16 px-8 rounded-3xl bg-[#171022] border border-[#A855F7]/20"
          >
            <CheckCircle size={56} className="text-[#A855F7] mx-auto mb-6" />
            <h3 className="text-2xl font-bold text-white mb-3">
              Application Received!
            </h3>
            <p className="text-[#E5E7EB]/60 max-w-sm mx-auto">
              Thanks for your interest in vending at the 940 Collectors Expo. We&apos;ll be in touch soon with next steps.
            </p>
          </motion.div>
        ) : (
          <motion.form
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            onSubmit={handleSubmit}
            className="retro-panel p-8 lg:p-10 space-y-6"
          >
            {/* Row 1 */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#E5E7EB]/70 mb-2">
                  Business Name
                </label>
                <input
                  type="text"
                  name="business"
                  required
                  placeholder="Your Business"
                  className="w-full px-4 py-3 rounded-xl bg-[#0B0713] border border-white/10 text-white placeholder-[#E5E7EB]/30 focus:outline-none focus:border-[#A855F7]/50 transition-colors text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#E5E7EB]/70 mb-2">
                  Contact Name *
                </label>
                <input
                  type="text"
                  name="contactName"
                  required
                  placeholder="Your Name"
                  className="w-full px-4 py-3 rounded-xl bg-[#0B0713] border border-white/10 text-white placeholder-[#E5E7EB]/30 focus:outline-none focus:border-[#A855F7]/50 transition-colors text-sm"
                />
              </div>
            </div>

            {/* Row 2 */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#E5E7EB]/70 mb-2">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 rounded-xl bg-[#0B0713] border border-white/10 text-white placeholder-[#E5E7EB]/30 focus:outline-none focus:border-[#A855F7]/50 transition-colors text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#E5E7EB]/70 mb-2">
                  Phone
                </label>
                <input
                  type="tel"
                  name="phone"
                  placeholder="(940) 000-0000"
                  className="w-full px-4 py-3 rounded-xl bg-[#0B0713] border border-white/10 text-white placeholder-[#E5E7EB]/30 focus:outline-none focus:border-[#A855F7]/50 transition-colors text-sm"
                />
              </div>
            </div>

            {/* Products */}
            <div>
              <label className="block text-sm font-medium text-[#E5E7EB]/70 mb-2">
                Products Sold
              </label>
              <div className="flex flex-wrap gap-2">
                {products.map((p) => (
                  <label
                    key={p}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0B0713] border border-white/10 cursor-pointer hover:border-[#A855F7]/40 transition-colors text-sm text-[#E5E7EB]/70 hover:text-white"
                  >
                    <input type="checkbox" name="products" value={p} className="accent-[#A855F7]" />
                    {p}
                  </label>
                ))}
              </div>
            </div>

            {/* Row 3 */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#E5E7EB]/70 mb-2">
                  Number of Tables Requested
                </label>
                <select name="tablesRequested" className="w-full px-4 py-3 rounded-xl bg-[#0B0713] border border-white/10 text-white focus:outline-none focus:border-[#A855F7]/50 transition-colors text-sm">
                  <option value="1">1 Table</option>
                  <option value="2">2 Tables</option>
                  <option value="3">3 Tables</option>
                  <option value="4+">4+ Tables</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#E5E7EB]/70 mb-2">
                  Website
                </label>
                <input
                  type="url"
                  name="website"
                  placeholder="https://yoursite.com"
                  className="w-full px-4 py-3 rounded-xl bg-[#0B0713] border border-white/10 text-white placeholder-[#E5E7EB]/30 focus:outline-none focus:border-[#A855F7]/50 transition-colors text-sm"
                />
              </div>
            </div>

            {/* Social */}
            <div>
              <label className="block text-sm font-medium text-[#E5E7EB]/70 mb-2">
                Social Media Handle(s)
              </label>
              <input
                type="text"
                name="social"
                placeholder="@yourhandle (Instagram, Facebook, etc.)"
                className="w-full px-4 py-3 rounded-xl bg-[#0B0713] border border-white/10 text-white placeholder-[#E5E7EB]/30 focus:outline-none focus:border-[#A855F7]/50 transition-colors text-sm"
              />
            </div>

            {/* Special Requests */}
            <div>
              <label className="block text-sm font-medium text-[#E5E7EB]/70 mb-2">
                Special Requests or Notes
              </label>
              <textarea
                rows={3}
                name="notes"
                placeholder="Anything we should know? Corner table preference, accessibility needs, etc."
                className="w-full px-4 py-3 rounded-xl bg-[#0B0713] border border-white/10 text-white placeholder-[#E5E7EB]/30 focus:outline-none focus:border-[#A855F7]/50 transition-colors text-sm resize-none"
              />
            </div>

            {/* Agreement */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                required
                className="mt-0.5 accent-[#A855F7] w-4 h-4"
              />
              <span className="text-sm text-[#E5E7EB]/60 leading-relaxed">
                I understand this is an application, not a confirmed reservation. The 940 Collectors Expo team will contact me with availability and payment details. Table fees are due upon confirmation.
              </span>
            </label>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-full retro-btn text-white font-bold text-lg transition-all duration-200 disabled:opacity-60 hover:shadow-lg hover:shadow-purple-500/25"
            >
              {loading ? (
                <span className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
              ) : (
                <>
                  Submit Application
                  <Send size={18} />
                </>
              )}
            </button>
          </motion.form>
        )}
      </div>
    </section>
  );
}
