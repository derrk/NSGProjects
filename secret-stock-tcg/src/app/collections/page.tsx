'use client';

import { useState } from 'react';
import { DollarSign, CheckCircle, Upload } from 'lucide-react';

const collectionTypes = [
  'Pokémon Singles',
  'Pokémon Sealed Products',
  'One Piece Singles',
  'One Piece Sealed Products',
  'Sports Cards',
  'Graded Slabs',
  'Vintage Cards',
  'Entire Collection',
  'Other',
];

export default function CollectionsPage() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    collectionType: '',
    estimatedValue: '',
    notes: '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Placeholder — future integration point
    setSubmitted(true);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="w-16 h-16 bg-purple-800/40 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <DollarSign className="w-8 h-8 text-purple-400" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">Sell Your Collection</h1>
        <p className="text-lg text-slate-400 max-w-xl mx-auto">
          Secret Stock TCG buys Pokémon, One Piece, sports cards, sealed products, and entire
          collections. Get a fair, fast offer — no hassle.
        </p>
      </div>

      {/* What we buy */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-12">
        {[
          { icon: '⚡', label: 'Pokémon Singles' },
          { icon: '⚓', label: 'One Piece Cards' },
          { icon: '🏆', label: 'Sports Cards' },
          { icon: '🏅', label: 'Graded Slabs' },
          { icon: '📦', label: 'Sealed Products' },
          { icon: '🎴', label: 'Vintage Cards' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2 p-3 bg-gray-900/50 border border-gray-800 rounded-xl text-sm text-slate-300">
            <span className="text-xl">{item.icon}</span>
            {item.label}
          </div>
        ))}
      </div>

      {/* Form */}
      {submitted ? (
        <div className="text-center py-16">
          <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Request Submitted!</h2>
          <p className="text-slate-400">
            We'll review your collection details and reach out within 24–48 hours.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
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

          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(555) 000-0000"
                className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-purple-600 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Collection Type *</label>
              <select
                required
                value={form.collectionType}
                onChange={(e) => setForm({ ...form, collectionType: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-600 text-sm"
              >
                <option value="">Select type...</option>
                {collectionTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Estimated Value</label>
            <input
              type="text"
              value={form.estimatedValue}
              onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })}
              placeholder="e.g. $500, unsure, large collection"
              className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-purple-600 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={4}
              placeholder="Tell us about your collection — notable cards, condition, sets, etc."
              className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-purple-600 text-sm resize-none"
            />
          </div>

          {/* Photo upload placeholder */}
          <div className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center hover:border-purple-700/50 transition-colors cursor-pointer">
            <Upload className="w-8 h-8 text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400">Upload photos of your collection</p>
            <p className="text-xs text-slate-600 mt-1">Photo upload coming soon</p>
          </div>

          <button
            type="submit"
            className="w-full py-3.5 bg-purple-700 hover:bg-purple-600 text-white font-semibold rounded-xl transition-colors glow-purple-sm"
          >
            Request Collection Review
          </button>
        </form>
      )}
    </div>
  );
}
