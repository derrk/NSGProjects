import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { products } from '@/lib/data';
import InventoryCard from '@/components/shop/InventoryCard';

export default function FeaturedInventory() {
  const featured = products.filter((p) => p.featured).slice(0, 8);

  return (
    <section className="bg-[#080810] py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Featured Inventory</h2>
            <p className="text-slate-400 mt-1 max-w-xl">
              Browse examples of cards, sealed products, slabs, and collectibles available through
              Secret Stock TX. Contact us or visit locally for current availability.
            </p>
          </div>
          <Link
            href="/inventory"
            className="hidden sm:flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300 transition-colors shrink-0 ml-4"
          >
            View all inventory <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Availability note */}
        <div className="mb-6 p-3 bg-purple-900/20 border border-purple-700/30 rounded-lg text-sm text-purple-300">
          <span className="font-semibold">Inventory shown is for reference.</span>{' '}
          Contact us to confirm current availability — inventory changes frequently.
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {featured.map((product) => (
            <InventoryCard key={product.id} product={product} />
          ))}
        </div>

        <div className="mt-8 text-center sm:hidden">
          <Link
            href="/inventory"
            className="inline-flex items-center gap-2 px-6 py-2.5 border border-purple-700/50 text-purple-400 rounded-lg hover:border-purple-500 hover:text-purple-300 transition-colors text-sm"
          >
            View all inventory <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
