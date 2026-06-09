"use client";

import { useState } from "react";
import { Check } from "lucide-react";

export default function ContactForm() {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#c9a96e]/20 text-[#c9a96e] mb-4">
          <Check className="w-7 h-7" />
        </div>
        <h3 className="font-serif text-2xl font-bold text-[#1a1612] mb-2">Message Sent!</h3>
        <p className="text-[#6b5e50]">We&apos;ll get back to you within 1 business day.</p>
      </div>
    );
  }

  const inputClass = "w-full px-4 py-3 border border-[#e0d4bf] rounded bg-white text-[#1a1612] text-sm focus:outline-none focus:border-[#c9a96e] transition-colors";
  const labelClass = "block text-sm font-semibold text-[#1a1612] mb-1.5";

  return (
    <form onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }} className="space-y-5">
      <h2 className="font-serif text-2xl font-bold text-[#1a1612] mb-1">Send a Message</h2>
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
        <label className={labelClass}>Subject</label>
        <select className={inputClass} defaultValue="">
          <option value="">Select a subject</option>
          <option>Order Question</option>
          <option>Custom Order Inquiry</option>
          <option>Shipping Question</option>
          <option>General Question</option>
          <option>Other</option>
        </select>
      </div>
      <div>
        <label className={labelClass}>Message *</label>
        <textarea className={`${inputClass} resize-none`} rows={6} placeholder="How can we help you?" required />
      </div>
      <button
        type="submit"
        className="w-full py-3.5 bg-[#1a1612] text-[#f5f0e8] font-bold rounded hover:bg-[#c9a96e] hover:text-[#1a1612] transition-colors"
      >
        Send Message
      </button>
    </form>
  );
}
