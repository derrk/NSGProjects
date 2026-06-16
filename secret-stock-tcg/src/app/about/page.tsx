import type { Metadata } from 'next';
import Link from 'next/link';
import { MapPin, Heart, ShoppingBag, Users, Trophy } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About Secret Stock TX | Trading Card Shop – Wichita Falls, TX',
  description:
    'Learn about Secret Stock TX, your local trading card shop in Wichita Falls, Texas. We specialize in Pokémon, One Piece, and Sports Cards.',
};

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Hero */}
      <div className="text-center mb-16">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-4">
          About <span className="gradient-text">Secret Stock TX</span>
        </h1>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto">
          A passion project turned business — serving collectors in Wichita Falls, Texas and beyond.
        </p>
      </div>

      {/* Our Story */}
      <section className="mb-16">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-purple-800/50 rounded-xl flex items-center justify-center">
            <Heart className="w-5 h-5 text-purple-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">Our Story</h2>
        </div>
        <div className="prose prose-invert prose-slate max-w-none">
          <p className="text-slate-400 leading-relaxed mb-4">
            Secret Stock TX started the way most great card shops do — with a passion for collecting.
            What began as a personal collection quickly grew into something bigger: a desire to share
            the hobby with the community and provide collectors in Wichita Falls with a reliable,
            trustworthy source for quality cards.
          </p>
          <p className="text-slate-400 leading-relaxed mb-4">
            We specialize in Pokémon, One Piece, and Sports Cards — from raw singles to PSA 10
            slabs to factory-sealed products. Whether you're a competitive player hunting for the
            last piece of your deck or a collector chasing that dream grade, we're here to help
            you find it.
          </p>
          <p className="text-slate-400 leading-relaxed">
            Our mission is simple: bring premium card shop energy to North Texas, one transaction
            at a time.
          </p>
        </div>
      </section>

      {/* Why We Collect */}
      <section className="mb-16 bg-[#0f0f1a] border border-gray-800 rounded-2xl p-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-purple-800/50 rounded-xl flex items-center justify-center">
            <Trophy className="w-5 h-5 text-purple-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">Why We Collect</h2>
        </div>
        <p className="text-slate-400 leading-relaxed mb-6">
          Trading cards are more than cardboard. They're nostalgia, art, investment, and community
          rolled into one. We believe every collector deserves access to quality inventory at fair
          prices — and that's exactly what we set out to provide.
        </p>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { title: 'Nostalgia', desc: 'Reconnect with the cards that started it all' },
            { title: 'Art', desc: 'Premium art you can hold in your hands' },
            { title: 'Community', desc: 'Built on shared love of the hobby' },
          ].map((item) => (
            <div key={item.title} className="p-4 bg-gray-900/50 rounded-xl text-center">
              <h3 className="text-white font-semibold mb-1">{item.title}</h3>
              <p className="text-sm text-slate-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What We Buy */}
      <section className="mb-16">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-purple-800/50 rounded-xl flex items-center justify-center">
            <ShoppingBag className="w-5 h-5 text-purple-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">What We Buy</h2>
        </div>
        <p className="text-slate-400 leading-relaxed mb-6">
          Looking to sell your collection? We buy Pokémon, One Piece, sports cards, sealed products,
          graded slabs, vintage cards, and entire collections. We offer fair, transparent pricing
          based on current market values.
        </p>
        <Link
          href="/collections"
          className="inline-flex items-center gap-2 px-6 py-3 bg-purple-700 hover:bg-purple-600 text-white font-semibold rounded-xl transition-colors"
        >
          Submit a Collection Request
        </Link>
      </section>

      {/* Events & Community */}
      <section className="mb-16">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-purple-800/50 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-purple-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">Events &amp; Community</h2>
        </div>
        <p className="text-slate-400 leading-relaxed mb-4">
          We're regulars at card shows and trading card events across Texas — from local Wichita
          Falls shows to Collect-A-Con Dallas. Follow us on social media to stay updated on where
          we'll be next.
        </p>
        <p className="text-slate-400 leading-relaxed">
          We also support the local Pokémon league community and participate in regional tournaments
          as both vendor and fellow collector.
        </p>
      </section>

      {/* Location */}
      <section className="bg-gradient-to-br from-purple-950/30 to-[#0a0a0f] border border-purple-900/30 rounded-2xl p-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-purple-800/50 rounded-xl flex items-center justify-center">
            <MapPin className="w-5 h-5 text-purple-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">Serving Wichita Falls Collectors</h2>
        </div>
        <p className="text-slate-400 leading-relaxed mb-4">
          Based in Wichita Falls, Texas, we serve collectors throughout North Texas and southern
          Oklahoma — including Burkburnett, Iowa Park, Vernon, and Lawton.
        </p>
        <div className="flex flex-wrap gap-2">
          {['Wichita Falls', 'Burkburnett', 'Iowa Park', 'Vernon', 'Lawton', 'Abilene', 'North Texas'].map((city) => (
            <span key={city} className="px-3 py-1 bg-gray-800 text-slate-400 rounded-full text-sm">
              {city}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
