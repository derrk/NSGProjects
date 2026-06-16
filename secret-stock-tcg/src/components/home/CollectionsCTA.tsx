import Link from 'next/link';
import { DollarSign, ArrowRight, MessageCircle } from 'lucide-react';

export default function CollectionsCTA() {
  return (
    <section className="bg-gradient-to-r from-purple-950/40 via-[#0f0820] to-purple-950/40 border-y border-purple-900/30 py-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="w-16 h-16 bg-purple-800/50 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <DollarSign className="w-8 h-8 text-purple-300" />
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
          Sell Your Collection
        </h2>
        <p className="text-lg text-slate-400 max-w-xl mx-auto mb-8">
          Secret Stock TX buys Pokémon, One Piece, sports cards, sealed products, and entire
          collections. Get a fair offer — fast. Serving Wichita Falls and surrounding areas.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/collections"
            className="group flex items-center gap-2 px-8 py-3.5 bg-purple-700 hover:bg-purple-600 text-white font-semibold rounded-xl transition-all glow-purple-sm"
          >
            Request Collection Review
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            href="/contact"
            className="flex items-center gap-2 px-8 py-3.5 border border-gray-700 hover:border-purple-700/50 text-slate-300 hover:text-white font-semibold rounded-xl transition-all"
          >
            <MessageCircle className="w-4 h-4" />
            Message Us
          </Link>
        </div>
        <p className="mt-6 text-sm text-slate-500">
          Serving Wichita Falls · Burkburnett · Iowa Park · Vernon · Lawton
        </p>
      </div>
    </section>
  );
}
