'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Mail, Phone, MapPin, Clock, ExternalLink, CheckCircle, MessageCircle } from 'lucide-react';

function ContactForm() {
  const searchParams = useSearchParams();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    interestedItem: '',
    message: '',
  });

  // Pre-fill item from inventory page link
  useEffect(() => {
    const item = searchParams.get('item');
    if (item) setForm((f) => ({ ...f, interestedItem: item }));
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed to send');
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again or call us directly.');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CheckCircle className="w-16 h-16 text-green-400 mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Message Sent!</h2>
        <p className="text-slate-400 max-w-sm">
          Thanks for reaching out. We'll get back to you as soon as possible — usually within a few hours.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[#0f0f1a] border border-gray-800 rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Message Secret Stock TX</h2>
        <p className="text-sm text-slate-500">Ask about inventory, arrange local pickup, or inquire about selling your collection.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Name *</label>
          <input
            required
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Your name"
            className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-purple-600 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Email *</label>
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="your@email.com"
            className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-purple-600 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Phone</label>
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="(940) 000-0000"
          className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-purple-600 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">
          Interested Product / Collection Details
        </label>
        <input
          type="text"
          value={form.interestedItem}
          onChange={(e) => setForm({ ...form, interestedItem: e.target.value })}
          placeholder="e.g. PSA 10 Charizard, Pokémon collection, sports cards..."
          className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-purple-600 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Message *</label>
        <textarea
          required
          rows={5}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          placeholder="Tell us what you're looking for, ask about availability, or let us know what you'd like to sell..."
          className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-purple-600 text-sm resize-none"
        />
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-950/40 border border-red-800/40 rounded-lg px-4 py-2">{error}</p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors glow-purple-sm flex items-center justify-center gap-2"
      >
        <MessageCircle className="w-4 h-4" />
        {loading ? 'Sending...' : 'Send Message'}
      </button>
    </form>
  );
}

export default function ContactPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">Contact Us</h1>
        <p className="text-slate-400 text-lg max-w-xl">
          Questions about inventory? Want to arrange a local pickup? Looking to sell your collection?
          We'd love to hear from you.
        </p>
      </div>

      <div className="grid lg:grid-cols-5 gap-10">
        {/* Info panel */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-[#0f0f1a] border border-gray-800 rounded-2xl p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-purple-900/40 rounded-lg flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5 uppercase tracking-wider">Email</p>
                <a href="mailto:info@secretstocktx.com" className="text-white hover:text-purple-400 transition-colors text-sm">
                  info@secretstocktx.com
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-purple-900/40 rounded-lg flex items-center justify-center shrink-0">
                <Phone className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5 uppercase tracking-wider">Phone</p>
                <a href="tel:+19724825154" className="text-white hover:text-purple-400 transition-colors text-sm">(972) 482-5154</a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-purple-900/40 rounded-lg flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5 uppercase tracking-wider">Location</p>
                <p className="text-white text-sm">2820 Holliday Rd</p>
                <p className="text-white text-sm">Wichita Falls, TX 76301</p>
                <p className="text-slate-500 text-xs mt-0.5">Serving North Texas &amp; Southern Oklahoma</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-purple-900/40 rounded-lg flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5 uppercase tracking-wider">Response Time</p>
                <p className="text-white text-sm">Usually within a few hours</p>
                <p className="text-slate-500 text-xs mt-0.5">7 days a week</p>
              </div>
            </div>
          </div>

          {/* Social */}
          <div className="bg-[#0f0f1a] border border-gray-800 rounded-2xl p-5">
            <p className="text-sm font-medium text-slate-300 mb-3">Follow Us</p>
            <div className="flex gap-3">
              <a
                href="https://www.instagram.com/secret_stock_tx/"
                target="_blank"
                rel="noopener noreferrer"
                title="Instagram"
                className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center text-slate-400 hover:bg-purple-800 hover:text-white transition-colors"
                aria-label="Instagram"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
            <p className="text-xs text-slate-600 mt-3">DMs open on Instagram for quick questions</p>
          </div>

          {/* Google Maps embed */}
          <div className="rounded-2xl overflow-hidden border border-gray-800 h-48">
            <iframe
              src="https://maps.google.com/maps?q=2820+Holliday+Rd,+Wichita+Falls,+TX+76301&output=embed&z=15"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Secret Stock TX location"
            />
          </div>
        </div>

        {/* Form */}
        <div className="lg:col-span-3">
          <Suspense fallback={<div className="h-96 bg-[#0f0f1a] border border-gray-800 rounded-2xl animate-pulse" />}>
            <ContactForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
