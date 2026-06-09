'use client';

import { ShoppingCart, Star, Package } from 'lucide-react';
import Link from 'next/link';
import { Product, RawSingle, GradedSlab, SealedProduct } from '@/lib/types';
import { formatPrice, calculateSavings } from '@/lib/utils';
import { useCartStore } from '@/lib/store';

interface ProductCardProps {
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

export default function ProductCard({ product }: ProductCardProps) {
  const { addItem } = useCartStore();
  const outOfStock = product.quantity === 0;

  const savings =
    product.marketPrice && product.marketPrice > product.price
      ? calculateSavings(product.marketPrice, product.price)
      : null;

  return (
    <div className="card-hover bg-[#0f0f1a] border border-gray-800 rounded-xl overflow-hidden flex flex-col">
      {/* Image */}
      <Link href={`/shop/${product.id}`} className="block relative">
        <div className="aspect-[3/4] bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
          <Package className="w-16 h-16 text-gray-700" />
        </div>
        {savings && savings > 0 && (
          <span className="absolute top-2 right-2 bg-purple-700 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {savings}% off
          </span>
        )}
        {outOfStock && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="bg-red-900/80 text-red-200 text-sm font-bold px-3 py-1 rounded-full">
              Sold Out
            </span>
          </div>
        )}
        {product.type === 'graded-slab' && (
          <span className="absolute top-2 left-2 bg-black/70 text-xs px-2 py-0.5 rounded-full text-slate-300">
            {(product as GradedSlab).gradingCompany}
          </span>
        )}
      </Link>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1">
        <Link href={`/shop/${product.id}`}>
          <h3 className="text-sm font-semibold text-white leading-tight hover:text-purple-400 transition-colors line-clamp-2 mb-1">
            {product.name}
          </h3>
        </Link>

        {/* Type badges */}
        <div className="flex flex-wrap gap-1 mb-2">
          {product.type === 'raw-single' && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getConditionColor((product as RawSingle).condition)}`}>
              {(product as RawSingle).condition}
            </span>
          )}
          {product.type === 'graded-slab' && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${getGradeColor((product as GradedSlab).grade)}`}>
              <Star className="inline w-2.5 h-2.5 mr-0.5" />
              {(product as GradedSlab).grade}
            </span>
          )}
          {product.type === 'sealed-product' && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 font-medium">
              {(product as SealedProduct).productType}
            </span>
          )}
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-slate-400 capitalize">
            {product.category.replace('-', ' ')}
          </span>
        </div>

        {/* Market price placeholder */}
        {product.marketPrice && (
          <div className="text-xs text-slate-500 mb-1">
            Market: {formatPrice(product.marketPrice)}
          </div>
        )}

        {/* Price */}
        <div className="mt-auto pt-2">
          <p className="text-lg font-bold text-white">{formatPrice(product.price)}</p>
          {product.quantity > 0 && product.quantity <= 3 && (
            <p className="text-xs text-amber-500 mt-0.5">Only {product.quantity} left</p>
          )}
        </div>

        {/* Add to Cart */}
        <button
          onClick={() => !outOfStock && addItem(product)}
          disabled={outOfStock}
          className={`mt-3 w-full py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
            outOfStock
              ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
              : 'bg-purple-700 hover:bg-purple-600 text-white'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          {outOfStock ? 'Sold Out' : 'Add to Cart'}
        </button>
      </div>
    </div>
  );
}
