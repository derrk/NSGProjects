'use client';

import { useActionState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Mail, Phone, MapPin, Clock, ExternalLink, CheckCircle, MessageCircle } from 'lucide-react';
import { submitContactMessage, type ContactFormState } from './actions';

const inputClass =
  'w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-purple-600 text-sm';
const labelClass = 'block text-sm font-medium text-slate-300 mb-1.5';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-400">{message}</p>;
}

function ContactForm() {
  const searchParams = useSearchParams();
  // Pre-filled from the "ask about this" link on an inventory page.
  const interestedItem = searchParams.get('item') ?? '';

  const [state, formAction, pending] = useActionState<ContactFormState | undefined, FormData>(
    submitContactMessage,
    undefined,
  );
  const fieldErrors = state?.fieldErrors ?? {};
  const confirmationRef = useRef<HTMLDivElement>(null);

  // The form is roughly 700px tall and the confirmation is about 150px, so a
  // successful submit removes ~550px of page height. The browser keeps the
  // scroll position, which can leave the confirmation above the viewport while
  // the footer jumps up into it — the sender sees the form vanish and no
  // acknowledgement.
  useEffect(() => {
    if (state?.ok) confirmationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [state?.ok]);

  if (state?.ok) {
    return (
      <div
        ref={confirmationRef}
        className="flex flex-col items-center justify-center py-16 text-center"
      >
        <CheckCircle className="w-16 h-16 text-green-400 mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Message Sent!</h2>
        <p className="text-slate-400 max-w-sm">
          Thanks for reaching out. We&apos;ll get back to you as soon as possible — usually within a few hours.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="bg-[#0f0f1a] border border-gray-800 rounded-2xl p-6 space-y-5">
      {/* Honeypot: off-screen, never seen or tabbed into by a person. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Message Secret Stock TX</h2>
        <p className="text-sm text-slate-500">Ask about inventory, arrange local pickup, or inquire about selling your collection.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <label className={labelClass} htmlFor="name">Name *</label>
          <input
            id="name"
            required
            type="text"
            name="name"
            placeholder="Your name"
            className={inputClass}
          />
          <FieldError message={fieldErrors.name} />
        </div>
        <div>
          <label className={labelClass} htmlFor="email">Email *</label>
          <input
            id="email"
            required
            type="email"
            name="email"
            placeholder="your@email.com"
            className={inputClass}
          />
          <FieldError message={fieldErrors.email} />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="phone">Phone</label>
        <input
          id="phone"
          type="tel"
          name="phone"
          placeholder="(940) 000-0000"
          className={inputClass}
        />
        <FieldError message={fieldErrors.phone} />
      </div>

      <div>
        <label className={labelClass} htmlFor="interestedItem">
          Interested Product / Collection Details
        </label>
        <input
          id="interestedItem"
          type="text"
          name="interestedItem"
          defaultValue={interestedItem}
          placeholder="e.g. PSA 10 Charizard, Pokémon collection, sports cards..."
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="message">Message *</label>
        <textarea
          id="message"
          required
          rows={5}
          name="message"
          placeholder="Tell us what you're looking for, ask about availability, or let us know what you'd like to sell..."
          className={`${inputClass} resize-none`}
        />
        <FieldError message={fieldErrors.message} />
      </div>

      {state?.error && (
        <p className="text-sm text-red-400 bg-red-950/40 border border-red-800/40 rounded-lg px-4 py-2">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full py-3.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors glow-purple-sm flex items-center justify-center gap-2"
      >
        <MessageCircle className="w-4 h-4" />
        {pending ? 'Sending...' : 'Send Message'}
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
          We&apos;d love to hear from you.
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
