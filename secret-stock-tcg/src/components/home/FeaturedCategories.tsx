import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { categories } from '@/lib/data';

export default function FeaturedCategories() {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Browse by Category</h2>
          <p className="text-slate-400 mt-1">Explore trading card inventory available through Secret Stock TCG</p>
        </div>
        <Link
          href="/inventory"
          className="hidden sm:flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300 transition-colors"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={cat.id === 'collections-wanted' ? '/collections' : `/inventory?category=${cat.id}`}
            className="card-hover group bg-[#0f0f1a] border border-gray-800 hover:border-purple-700/50 rounded-xl p-4 flex flex-col items-center text-center transition-colors"
          >
            <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${cat.color} flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition-transform`}>
              {cat.icon}
            </div>
            <h3 className="text-sm font-semibold text-white mb-1 group-hover:text-purple-400 transition-colors">
              {cat.name}
            </h3>
            <p className="text-xs text-slate-500 leading-snug hidden sm:block">{cat.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
