"use client";

import { useState } from "react";
import { Check } from "lucide-react";

export default function CustomOrderForm() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#c9a96e]/20 text-[#c9a96e] mb-5">
          <Check className="w-8 h-8" />
        </div>
        <h2 className="font-serif text-3xl font-bold text-[#1a1612] mb-3">
          Request Received!
        </h2>
        <p className="text-[#6b5e50] max-w-md mx-auto">
          Thanks for reaching out. We&apos;ll review your request and get back to you within 1–2 business days to discuss your custom build.
        </p>
      </div>
    );
  }

  const inputClass = "w-full px-4 py-3 border border-[#e0d4bf] rounded bg-white text-[#1a1612] text-sm focus:outline-none focus:border-[#c9a96e] transition-colors";
  const labelClass = "block text-sm font-semibold text-[#1a1612] mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h2 className="font-serif text-2xl font-bold text-[#1a1612] mb-2">
        Custom Order Request
      </h2>
      <p className="text-[#6b5e50] text-sm mb-6">
        Fill out the form below and we&apos;ll reach out to discuss your project.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className={labelClass}>Name *</label>
          <input type="text" className={inputClass} placeholder="Your name" required />
        </div>
        <div>
          <label className={labelClass}>Email *</label>
          <input type="email" className={inputClass} placeholder="your@email.com" required />
        </div>
      </div>

      <div>
        <label className={labelClass}>Phone</label>
        <input type="tel" className={inputClass} placeholder="(555) 000-0000" />
      </div>

      <div>
        <label className={labelClass}>Type of Display Wanted *</label>
        <select className={inputClass} required defaultValue="">
          <option value="" disabled>Select display type</option>
          <option>Single Slab Stand</option>
          <option>Multi-Slab Display (2–5)</option>
          <option>Multi-Slab Display (6+)</option>
          <option>Wall-Mounted Display</option>
          <option>Shelf / Tiered Display</option>
          <option>Collector&apos;s Showcase (Glass front)</option>
          <option>Other / Not Sure Yet</option>
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className={labelClass}>Number of Cards / Slabs</label>
          <input type="number" min="1" className={inputClass} placeholder="e.g. 6" />
        </div>
        <div>
          <label className={labelClass}>Preferred Wood Finish</label>
          <select className={inputClass} defaultValue="">
            <option value="">No preference</option>
            <option>Natural</option>
            <option>Dark Stain</option>
            <option>Walnut</option>
            <option>Black</option>
            <option>Not Sure</option>
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Engraving or Logo Request</label>
        <input type="text" className={inputClass} placeholder="e.g. Team logo, name, card title..." />
      </div>

      <div>
        <label className={labelClass}>Budget Range</label>
        <select className={inputClass} defaultValue="">
          <option value="">Select a range</option>
          <option>Under $50</option>
          <option>$50 – $100</option>
          <option>$100 – $200</option>
          <option>$200 – $500</option>
          <option>$500+</option>
        </select>
      </div>

      <div>
        <label className={labelClass}>Reference Image</label>
        <div className="w-full px-4 py-8 border-2 border-dashed border-[#e0d4bf] rounded bg-[#faf8f5] text-center text-sm text-[#a89880] cursor-pointer hover:border-[#c9a96e] transition-colors">
          📎 Click to upload an image (coming soon)
        </div>
        <p className="text-xs text-[#a89880] mt-1">
          Image upload will be available in the full build. Feel free to describe your idea below.
        </p>
      </div>

      <div>
        <label className={labelClass}>Additional Details</label>
        <textarea
          className={`${inputClass} resize-none`}
          rows={5}
          placeholder="Tell us anything else about your project — dimensions, card type, how you plan to display it, style preferences..."
        />
      </div>

      <button
        type="submit"
        className="w-full py-4 bg-[#1a1612] text-[#f5f0e8] font-bold rounded hover:bg-[#c9a96e] hover:text-[#1a1612] transition-colors text-base"
      >
        Submit Custom Request
      </button>
    </form>
  );
}
