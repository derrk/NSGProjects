'use client';

import { useActionState } from 'react';
import { DollarSign, CheckCircle, Images } from 'lucide-react';
import { submitCollectionOffer, type SellFormState } from './actions';
import { COLLECTION_CATEGORIES } from '@/lib/validators';

const inputClass =
  'w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-purple-600 text-sm';
const labelClass = 'block text-sm font-medium text-slate-300 mb-1.5';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-400">{message}</p>;
}

export default function CollectionsPage() {
  const [state, formAction, pending] = useActionState<SellFormState | undefined, FormData>(
    submitCollectionOffer,
    undefined,
  );
  const fieldErrors = state?.fieldErrors ?? {};

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="w-16 h-16 bg-purple-800/40 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <DollarSign className="w-8 h-8 text-purple-400" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">Sell Your Collection</h1>
        <p className="text-lg text-slate-400 max-w-xl mx-auto">
          Secret Stock TX buys Pokémon, One Piece, sports cards, sealed products, and entire
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
          <div
            key={item.label}
            className="flex items-center gap-2 p-3 bg-gray-900/50 border border-gray-800 rounded-xl text-sm text-slate-300"
          >
            <span className="text-xl">{item.icon}</span>
            {item.label}
          </div>
        ))}
      </div>

      {/* Form */}
      {state?.ok ? (
        <div className="text-center py-16">
          <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Request Submitted!</h2>
          <p className="text-slate-400">
            We&apos;ll review your collection details and reach out within 24–48 hours.
          </p>
        </div>
      ) : (
        <form action={formAction} className="space-y-5">
          {/* Honeypot: off-screen, never seen or tabbed into by a person. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute left-[-9999px] h-0 w-0 opacity-0"
          />

          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <label className={labelClass} htmlFor="name">
                Name *
              </label>
              <input id="name" required type="text" name="name" placeholder="Your name" className={inputClass} />
              <FieldError message={fieldErrors.name} />
            </div>
            <div>
              <label className={labelClass} htmlFor="email">
                Email *
              </label>
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

          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <label className={labelClass} htmlFor="phone">
                Phone
              </label>
              <input
                id="phone"
                type="tel"
                name="phone"
                placeholder="(555) 000-0000"
                className={inputClass}
              />
              <FieldError message={fieldErrors.phone} />
            </div>
            <div>
              <label className={labelClass} htmlFor="preferredContact">
                Best way to reach you
              </label>
              <select id="preferredContact" name="preferredContact" defaultValue="email" className={inputClass}>
                <option value="email">Email</option>
                <option value="phone">Phone call</option>
                <option value="text">Text message</option>
              </select>
            </div>
          </div>

          {/* Several boxes, because a collection is rarely just one thing. */}
          <fieldset>
            <legend className={labelClass}>What do you have? (pick any)</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {COLLECTION_CATEGORIES.map((c) => (
                <label
                  key={c}
                  className="flex items-center gap-2.5 px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-slate-300 cursor-pointer hover:border-purple-700/60 transition-colors has-[:checked]:border-purple-600 has-[:checked]:bg-purple-950/30"
                >
                  <input
                    type="checkbox"
                    name="categories"
                    value={c}
                    className="size-4 accent-purple-600"
                  />
                  {c}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <label className={labelClass} htmlFor="itemCountEstimate">
                Roughly how many items?
              </label>
              <input
                id="itemCountEstimate"
                type="text"
                name="itemCountEstimate"
                placeholder="e.g. 3 binders, 2 boxes, not sure"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="askingPrice">
                Asking price
              </label>
              <input
                id="askingPrice"
                type="text"
                name="askingPrice"
                placeholder="e.g. $500, open to offers"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="description">
              Tell us about it
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              placeholder="Notable cards, condition, sets, how long you've had it…"
              className={`${inputClass} resize-none`}
            />
            <FieldError message={fieldErrors.description} />
          </div>

          <div>
            <label className={labelClass} htmlFor="photosUrl">
              <span className="inline-flex items-center gap-1.5">
                <Images className="w-4 h-4 text-purple-400" />
                Link to photos
              </span>
            </label>
            <input
              id="photosUrl"
              type="url"
              name="photosUrl"
              placeholder="https://photos.app.goo.gl/… or any share link"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-slate-500">
              Upload to Google Photos, Drive, or Imgur and paste the share link. Photos help us
              quote faster.
            </p>
            <FieldError message={fieldErrors.photosUrl} />
          </div>

          {state?.error && (
            <p className="text-sm text-red-400 bg-red-950/40 border border-red-800/40 rounded-lg px-4 py-2">
              {state.error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full py-3.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors glow-purple-sm"
          >
            {pending ? 'Submitting...' : 'Request Collection Review'}
          </button>
        </form>
      )}
    </div>
  );
}
