import Link from 'next/link';
import { Package, Star, MessageCircle } from 'lucide-react';
import { Product, RawSingle, GradedSlab, SealedProduct } from '@/lib/types';

interface InventoryCardProps {
  product: Product;
}

function getConditionColor(condition: string): string {
  const colors: Record<string, string> = {
    'Mint': 'text-emerald-400 bg-emerald-950',
    'Near Mint': 'text-green-400 bg-green-950',
    'Lightly Played': 'text-yellow-400 bg-yellow-950',
    'Moderately Played': 'text-orange-400 bg-orange-950',
    'Heavily Played': 'text-red-400 bg-red-950',
    'Damaged': 'text-red-600 bg-red-950',
  };
  return colors[condition] || 'text-slate-400 bg-gray-800';
}

function getGradeColor(grade: string): string {
  const g = parseFloat(grade);
  if (g >= 10) return 'text-yellow-300 bg-yellow-950 border border-yellow-700';
  if (g >= 9) return 'text-emerald-400 bg-emerald-950';
  if (g >= 8) return 'text-green-400 bg-green-950';
  return 'text-slate-400 bg-gray-800';
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    'pokemon': 'Pokémon',
    'one-piece': 'One Piece',
    'sports-cards': 'Sports Cards',
    'graded-slabs': 'Graded Slabs',
    'sealed-products': 'Sealed Products',
    'vintage': 'Vintage',
    'high-end': 'High End',
  };
  return labels[category] || category;
}

export default function InventoryCard({ product }: InventoryCardProps) {
  const outOfStock = product.quantity === 0;

  return (
    <div className={`card-hover bg-[#0f0f1a] border rounded-xl overflow-hidden flex flex-col transition-colors ${
      outOfStock ? 'border-gray-800/50 opacity-60' : 'border-gray-800 hover:border-purple-700/40'
    }`}>
      {/* Image */}
      <Link href={`/inventory/${product.id}`} className="block relative">
        <div className="aspect-[3/4] bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
          <Package className="w-16 h-16 text-gray-700" />
        </div>

        {/* Grading company badge */}
        {product.type === 'graded-slab' && (
          <span className="absolute top-2 left-2 bg-black/70 text-xs px-2 py-0.5 rounded-full text-slate-300 font-medium">
            {(product as GradedSlab).gradingCompany}
          </span>
        )}

        {/* Availability overlay */}
        {outOfStock && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="bg-gray-900/90 text-slate-400 text-xs font-semibold px-3 py-1 rounded-full border border-gray-700">
              Currently Unavailable
            </span>
          </div>
        )}
      </Link>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1">
        {/* Name */}
        <Link href={`/inventory/${product.id}`}>
          <h3 className="text-sm font-semibold text-white leading-tight hover:text-purple-400 transition-colors line-clamp-2 mb-2">
            {product.name}
          </h3>
        </Link>

        {/* Category + type badges */}
        <div className="flex flex-wrap gap-1 mb-3">
          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300 border border-purple-800/40 font-medium">
            {getCategoryLabel(product.category)}
          </span>

          {product.type === 'raw-single' && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getConditionColor((product as RawSingle).condition)}`}>
              {(product as RawSingle).condition}
            </span>
          )}

          {product.type === 'graded-slab' && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-0.5 ${getGradeColor((product as GradedSlab).grade)}`}>
              <Star className="w-2.5 h-2.5" />
              Grade {(product as GradedSlab).grade}
            </span>
          )}

          {product.type === 'sealed-product' && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 font-medium">
              {(product as SealedProduct).productType}
            </span>
          )}
        </div>

        {/* Short description */}
        {product.description && (
          <p className="text-xs text-slate-500 leading-relaxed mb-3 line-clamp-2 flex-1">
            {product.description}
          </p>
        )}

        {/* Contact CTA */}
        <Link
          href={`/contact?item=${encodeURIComponent(product.name)}`}
          className={`mt-auto w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
            outOfStock
              ? 'bg-gray-800/50 text-gray-600 cursor-not-allowed pointer-events-none'
              : 'bg-purple-900/40 hover:bg-purple-700 border border-purple-700/40 hover:border-purple-600 text-purple-300 hover:text-white'
          }`}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          {outOfStock ? 'Currently Unavailable' : 'Contact for Availability'}
        </Link>
      </div>
    </div>
  );
}
