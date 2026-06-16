'use client';

import { useState, useMemo } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { products } from '@/lib/data';
import { ProductCategory, ProductType } from '@/lib/types';
import InventoryCard from '@/components/shop/InventoryCard';

const categoryOptions: { value: ProductCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All Categories' },
  { value: 'pokemon', label: 'Pokémon' },
  { value: 'one-piece', label: 'One Piece' },
  { value: 'sports-cards', label: 'Sports Cards' },
  { value: 'graded-slabs', label: 'Graded Slabs' },
  { value: 'sealed-products', label: 'Sealed Products' },
  { value: 'vintage', label: 'Vintage' },
  { value: 'high-end', label: 'High End' },
];

const typeOptions: { value: ProductType | 'all'; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'raw-single', label: 'Raw Singles' },
  { value: 'graded-slab', label: 'Graded Slabs' },
  { value: 'sealed-product', label: 'Sealed Products' },
];

const sortOptions = [
  { value: 'featured', label: 'Featured First' },
  { value: 'name-asc', label: 'Name A–Z' },
  { value: 'name-desc', label: 'Name Z–A' },
];

export default function InventoryPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ProductCategory | 'all'>('all');
  const [type, setType] = useState<ProductType | 'all'>('all');
  const [sort, setSort] = useState('featured');
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    let result = [...products];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.category.includes(q) ||
          ('set' in p && (p as { set: string }).set?.toLowerCase().includes(q))
      );
    }

    if (category !== 'all') result = result.filter((p) => p.category === category);
    if (type !== 'all') result = result.filter((p) => p.type === type);

    switch (sort) {
      case 'name-asc': result.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'name-desc': result.sort((a, b) => b.name.localeCompare(a.name)); break;
      default: result.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    }

    return result;
  }, [search, category, type, sort]);

  const hasActiveFilters = category !== 'all' || type !== 'all' || search !== '';
  const clearFilters = () => { setCategory('all'); setType('all'); setSearch(''); };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">Current Inventory</h1>
        <p className="text-slate-400 mt-1 max-w-xl">
          Browse trading cards, sealed products, graded slabs, and collectibles available through
          Secret Stock TX in Wichita Falls, TX.{' '}
          <span className="text-purple-400">Contact us to confirm availability.</span>
        </p>
      </div>

      {/* Availability disclaimer */}
      <div className="mb-6 p-4 bg-[#0f0f1a] border border-gray-800 rounded-xl text-sm text-slate-400 flex items-start gap-3">
        <span className="text-purple-400 font-bold mt-0.5">ℹ</span>
        <span>
          Inventory shown is representative of products we carry. Items change frequently due to
          in-store sales, card shows, and new acquisitions.{' '}
          <a href="/contact" className="text-purple-400 hover:text-purple-300 underline">
            Message us
          </a>{' '}
          to confirm a specific item is available before visiting.
        </span>
      </div>

      {/* Search + controls */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search cards, sets, players..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-600 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm border transition-colors ${
            showFilters || hasActiveFilters
              ? 'bg-purple-800 border-purple-600 text-white'
              : 'bg-gray-900 border-gray-700 text-slate-300 hover:border-purple-700'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span className="hidden sm:inline">Filter</span>
          {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-purple-400" />}
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="mb-6 p-4 bg-gray-900/50 border border-gray-800 rounded-xl">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block font-medium uppercase tracking-wider">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ProductCategory | 'all')}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-slate-300 focus:outline-none focus:border-purple-600"
              >
                {categoryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block font-medium uppercase tracking-wider">Product Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ProductType | 'all')}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-slate-300 focus:outline-none focus:border-purple-600"
              >
                {typeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block font-medium uppercase tracking-wider">Sort By</label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-slate-300 focus:outline-none focus:border-purple-600"
              >
                {sortOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="mt-3 text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
              <X className="w-3 h-3" /> Clear filters
            </button>
          )}
        </div>
      )}

      {/* Count */}
      <p className="text-sm text-slate-500 mb-4">
        Showing {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
        {hasActiveFilters && ' matching your filters'}
      </p>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {filtered.map((product) => (
            <InventoryCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-slate-400 text-lg mb-2">No items found</p>
          <p className="text-slate-600 text-sm">Try adjusting your search or filters</p>
          <button onClick={clearFilters} className="mt-4 text-purple-400 hover:text-purple-300 text-sm">
            Clear filters
          </button>
        </div>
      )}

      {/* Bottom CTA */}
      <div className="mt-12 p-6 bg-[#0f0f1a] border border-gray-800 rounded-2xl text-center">
        <p className="text-white font-semibold mb-1">Don't see what you're looking for?</p>
        <p className="text-sm text-slate-400 mb-4">
          Our inventory changes constantly. Contact us and we may have exactly what you need.
        </p>
        <a
          href="/contact"
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-purple-700 hover:bg-purple-600 text-white font-semibold rounded-xl transition-colors text-sm"
        >
          Ask About a Specific Card
        </a>
      </div>
    </div>
  );
}
