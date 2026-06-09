'use client';

import { useState } from 'react';
import { Mail, Phone, MapPin, Clock, ExternalLink, CheckCircle } from 'lucide-react';

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">Contact Us</h1>
        <p className="text-slate-400 text-lg">
          Questions about inventory? Want to sell your collection? We'd love to hear from you.
        </p>
      </div>

      <div className="grid lg:grid-cols-5 gap-10">
        {/* Contact Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#0f0f1a] border border-gray-800 rounded-2xl p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-purple-900/40 rounded-lg flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5 uppercase tracking-wider">Email</p>
                <a href="mailto:info@secretstocktcg.com" className="text-white hover:text-purple-400 transition-colors text-sm">
                  info@secretstocktcg.com
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-purple-900/40 rounded-lg flex items-center justify-center shrink-0">
                <Phone className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5 uppercase tracking-wider">Phone</p>
                <p className="text-white text-sm">(940) 000-0000</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-purple-900/40 rounded-lg flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5 uppercase tracking-wider">Location</p>
                <p className="text-white text-sm">Wichita Falls, TX</p>
                <p className="text-slate-500 text-xs mt-0.5">Local pickup by appointment</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-purple-900/40 rounded-lg flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5 uppercase tracking-wider">Hours</p>
                <p className="text-white text-sm">Online store: 24/7</p>
                <p className="text-slate-500 text-xs">Local pickup: by appointment</p>
              </div>
            </div>
          </div>

          {/* Social */}
          <div className="bg-[#0f0f1a] border border-gray-800 rounded-2xl p-6">
            <p className="text-sm font-medium text-slate-300 mb-4">Follow Us</p>
            <div className="flex gap-3">
              {['Instagram', 'TikTok', 'Facebook'].map((label) => (
                <a
                  key={label}
                  href="#"
                  title={label}
                  className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center text-slate-400 hover:bg-purple-800 hover:text-white transition-colors"
                  aria-label={label}
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Map placeholder */}
          <div className="bg-[#0f0f1a] border border-gray-800 rounded-2xl overflow-hidden h-40 flex items-center justify-center">
            <div className="text-center">
              <MapPin className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-xs text-slate-600">Google Maps — Coming Soon</p>
              <p className="text-xs text-slate-700">Wichita Falls, TX</p>
            </div>
          </div>
        </div>

        {/* Contact Form */}
        <div className="lg:col-span-3">
          {submitted ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <CheckCircle className="w-16 h-16 text-green-400 mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Message Sent!</h2>
              <p className="text-slate-400">We'll get back to you within 24–48 hours.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-[#0f0f1a] border border-gray-800 rounded-2xl p-6 space-y-5">
              <h2 className="text-lg font-semibold text-white mb-2">Send a Message</h2>
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
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Subject</label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="What's this about?"
                  className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-purple-600 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Message *</label>
                <textarea
                  required
                  rows={6}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Tell us what you're looking for, or ask us anything..."
                  className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-purple-600 text-sm resize-none"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3.5 bg-purple-700 hover:bg-purple-600 text-white font-semibold rounded-xl transition-colors glow-purple-sm"
              >
                Send Message
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
