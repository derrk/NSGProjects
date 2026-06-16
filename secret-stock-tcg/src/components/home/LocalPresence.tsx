import Link from 'next/link';
import { MapPin, MessageCircle, Package, DollarSign } from 'lucide-react';

const steps = [
  {
    icon: Package,
    title: 'Browse Inventory',
    description:
      'View featured cards, sealed products, graded slabs, and collectibles from Secret Stock TX.',
    href: '/inventory',
    cta: 'View Inventory',
  },
  {
    icon: MessageCircle,
    title: 'Ask About Availability',
    description:
      'See something you like? Contact us to confirm it\'s available and arrange local pickup.',
    href: '/contact',
    cta: 'Contact Us',
  },
  {
    icon: DollarSign,
    title: 'Sell Your Collection',
    description:
      'Looking to sell? We buy Pokémon, sports cards, One Piece, graded slabs, and entire collections.',
    href: '/collections',
    cta: 'Get an Offer',
  },
];

export default function LocalPresence() {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* How it works */}
      <div className="text-center mb-10">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">How It Works</h2>
        <p className="text-slate-400">
          Secret Stock TX serves collectors in Wichita Falls and surrounding North Texas communities.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-6 mb-16">
        {steps.map((step, i) => (
          <div key={step.title} className="card-hover bg-[#0f0f1a] border border-gray-800 hover:border-purple-700/40 rounded-2xl p-6 text-center transition-colors">
            <div className="w-12 h-12 bg-purple-900/40 rounded-xl flex items-center justify-center mx-auto mb-4 relative">
              <step.icon className="w-5 h-5 text-purple-400" />
              <span className="absolute -top-2 -right-2 w-5 h-5 bg-purple-700 rounded-full text-xs text-white font-bold flex items-center justify-center">
                {i + 1}
              </span>
            </div>
            <h3 className="text-white font-semibold mb-2">{step.title}</h3>
            <p className="text-sm text-slate-500 leading-relaxed mb-4">{step.description}</p>
            <Link
              href={step.href}
              className="text-sm text-purple-400 hover:text-purple-300 font-medium transition-colors"
            >
              {step.cta} →
            </Link>
          </div>
        ))}
      </div>

      {/* Local service area */}
      <div className="bg-gradient-to-br from-purple-950/20 to-[#0a0a0f] border border-purple-900/30 rounded-2xl p-8">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-purple-900/40 rounded-xl flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white mb-2">
              Trading Cards in Wichita Falls, TX &amp; Surrounding Areas
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-4">
              Secret Stock TX is your local source for Pokémon cards, One Piece cards, sports cards,
              graded slabs, and sealed products in Wichita Falls, Texas. We serve collectors throughout
              North Texas and southern Oklahoma — including Burkburnett, Iowa Park, Vernon, and Lawton.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                'Wichita Falls', 'Burkburnett', 'Iowa Park',
                'Vernon', 'Lawton', 'North Texas', 'Southern Oklahoma',
              ].map((city) => (
                <span key={city} className="px-3 py-1 bg-gray-800 text-slate-400 rounded-full text-xs">
                  {city}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
