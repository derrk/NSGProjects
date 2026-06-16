import Link from 'next/link';
import { ChevronRight, MapPin } from 'lucide-react';

export default function Hero() {
  return (
    <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#0f0818] to-[#0a0a0f]" />

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            'linear-gradient(rgba(147,51,234,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(147,51,234,0.3) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Purple glow blobs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-900/20 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-700/15 rounded-full blur-[100px]" />

      {/* Content */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Location badge */}
        <div className="inline-flex items-center gap-2 bg-purple-900/30 border border-purple-700/40 rounded-full px-4 py-1.5 text-sm text-purple-300 mb-6">
          <MapPin className="w-3.5 h-3.5" />
          Wichita Falls, TX · Serving North Texas
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
          <span className="gradient-text">Pokémon, One Piece</span>{' '}
          &amp; Sports Cards{' '}
          <span className="block text-3xl sm:text-4xl lg:text-5xl mt-2 text-slate-300 font-bold">
            in Wichita Falls, TX
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-8 leading-relaxed">
          Browse featured inventory from Secret Stock TX — including sealed products, raw singles,
          graded slabs, sports cards, and collectibles. Contact us for current availability.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/inventory"
            className="group flex items-center gap-2 px-8 py-3.5 bg-purple-700 hover:bg-purple-600 text-white font-semibold rounded-xl transition-all glow-purple-sm hover:scale-105"
          >
            View Inventory
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            href="/collections"
            className="flex items-center gap-2 px-8 py-3.5 bg-transparent border border-purple-700/50 hover:border-purple-500 text-slate-300 hover:text-white font-semibold rounded-xl transition-all"
          >
            Sell Your Collection
          </Link>
        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap items-center justify-center gap-6 mt-12 text-sm text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Local pickup · Wichita Falls
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            PSA · BGS · CGC graded slabs
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            Collections bought &amp; traded
          </span>
        </div>
      </div>
    </section>
  );
}
