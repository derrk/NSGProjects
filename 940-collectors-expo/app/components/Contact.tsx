"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Send, CheckCircle, Mail, AtSign, MessageCircle } from "lucide-react";
import { CONTACT_EMAIL } from "../lib/site";

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactName: form.name,
          email: form.email,
          phone: form.phone,
          notes: form.message,
        }),
      });
      if (!res.ok) {
        setError("Something went wrong — please email us directly.");
        setLoading(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Couldn't send — check your connection and try again.");
    }
    setLoading(false);
  };

  return (
    <section id="contact" className="py-28 lg:py-36 bg-[#171022] relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] rounded-full bg-[#A855F7]/6 blur-[80px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          {/* Left */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <p className="text-[#A855F7] pixel-eyebrow mb-4">
              Get In Touch
            </p>
            <h2 className="text-4xl lg:text-5xl font-black text-white mb-6">
              Contact Us
            </h2>
            <p className="text-lg text-[#E5E7EB]/70 leading-relaxed mb-10">
              Have questions about the show, vendor spots, or sponsorships? We&apos;d love to hear from you. Fill out the form and we&apos;ll get back to you as soon as possible.
            </p>

            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-[#0B0713] border border-white/5">
                <div className="w-10 h-10 rounded-xl bg-[#A855F7]/10 flex items-center justify-center">
                  <Mail size={18} className="text-[#A855F7]" />
                </div>
                <div>
                  <p className="text-xs text-[#E5E7EB]/40 font-medium uppercase tracking-widest">Email</p>
                  <a href={`mailto:${CONTACT_EMAIL}`} className="text-white font-medium text-sm hover:text-[#A855F7] transition-colors break-all">
                    {CONTACT_EMAIL}
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-2xl bg-[#0B0713] border border-white/5">
                <div className="w-10 h-10 rounded-xl bg-[#A855F7]/10 flex items-center justify-center">
                  <AtSign size={18} className="text-[#A855F7]" />
                </div>
                <div>
                  <p className="text-xs text-[#E5E7EB]/40 font-medium uppercase tracking-widest">Instagram</p>
                  <p className="text-white font-medium text-sm">@940CollectorsExpo</p>
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-2xl bg-[#0B0713] border border-white/5">
                <div className="w-10 h-10 rounded-xl bg-[#A855F7]/10 flex items-center justify-center">
                  <MessageCircle size={18} className="text-[#A855F7]" />
                </div>
                <div>
                  <p className="text-xs text-[#E5E7EB]/40 font-medium uppercase tracking-widest">Facebook</p>
                  <p className="text-white font-medium text-sm">940 Collectors Expo</p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right - Form */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            {submitted ? (
              <div className="text-center py-16 px-8 rounded-3xl bg-[#0B0713] border border-[#A855F7]/20">
                <CheckCircle size={52} className="text-[#A855F7] mx-auto mb-5" />
                <h3 className="text-xl font-bold text-white mb-2">Message Sent!</h3>
                <p className="text-[#E5E7EB]/60 text-sm">We&apos;ll get back to you soon.</p>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="rounded-3xl bg-[#0B0713] border border-white/5 p-8 space-y-5"
              >
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#E5E7EB]/60 mb-2">Name *</label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={set("name")}
                      placeholder="Your Name"
                      className="w-full px-4 py-3 rounded-xl bg-[#171022] border border-white/10 text-white placeholder-[#E5E7EB]/25 focus:outline-none focus:border-[#A855F7]/50 transition-colors text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#E5E7EB]/60 mb-2">Email *</label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={set("email")}
                      placeholder="you@example.com"
                      className="w-full px-4 py-3 rounded-xl bg-[#171022] border border-white/10 text-white placeholder-[#E5E7EB]/25 focus:outline-none focus:border-[#A855F7]/50 transition-colors text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#E5E7EB]/60 mb-2">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={set("phone")}
                    placeholder="(940) 000-0000"
                    className="w-full px-4 py-3 rounded-xl bg-[#171022] border border-white/10 text-white placeholder-[#E5E7EB]/25 focus:outline-none focus:border-[#A855F7]/50 transition-colors text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#E5E7EB]/60 mb-2">Message *</label>
                  <textarea
                    required
                    rows={5}
                    value={form.message}
                    onChange={set("message")}
                    placeholder="How can we help?"
                    className="w-full px-4 py-3 rounded-xl bg-[#171022] border border-white/10 text-white placeholder-[#E5E7EB]/25 focus:outline-none focus:border-[#A855F7]/50 transition-colors text-sm resize-none"
                  />
                </div>

                {error && <p className="text-sm text-red-400">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-full retro-btn text-white font-bold transition-all duration-200 disabled:opacity-60 hover:shadow-lg hover:shadow-purple-500/25"
                >
                  {loading ? (
                    <span className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
                  ) : (
                    <>
                      Send Message
                      <Send size={16} />
                    </>
                  )}
                </button>
              </form>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
