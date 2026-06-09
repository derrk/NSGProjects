'use client';

import { useParams, notFound } from 'next/navigation';
import { ShoppingCart, ArrowLeft, Package, Star, Shield, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { products } from '@/lib/data';
import { useCartStore } from '@/lib/store';
import { formatPrice, calculateSavings } from '@/lib/utils';
import { GradedSlab, RawSingle, SealedProduct } from '@/lib/types';

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const product = products.find((p) => p.id === id);
  const { addItem } = useCartStore();

  if (!product) return notFound();

  const outOfStock = product.quantity === 0;
  const savings = product.marketPrice && product.marketPrice > product.price
    ? calculateSavings(product.marketPrice, product.price)
    : null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link
        href="/shop"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-purple-400 transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Shop
      </Link>

      <div className="grid md:grid-cols-2 gap-10">
        {/* Image */}
        <div>
          <div className="aspect-[3/4] bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl flex items-center justify-center border border-gray-700">
            <Package className="w-24 h-24 text-gray-600" />
          </div>
          {savings && savings > 0 && (
            <div className="mt-3 p-3 bg-purple-900/20 border border-purple-700/30 rounded-xl text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
                Market Price Comparison <span className="text-purple-400">(Coming Soon: Collectr)</span>
              </p>
              <div className="flex items-center justify-center gap-4 text-sm">
                <span className="text-slate-400">Market: <span className="line-through">{formatPrice(product.marketPrice!)}</span></span>
                <span className="text-green-400 font-semibold">Save {savings}%</span>
              </div>
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs px-2.5 py-1 bg-purple-900/40 text-purple-300 border border-purple-700/40 rounded-full capitalize">
              {product.category.replace('-', ' ')}
            </span>
            {product.type === 'graded-slab' && (
              <span className="text-xs px-2.5 py-1 bg-yellow-900/40 text-yellow-300 border border-yellow-700/40 rounded-full flex items-center gap-1">
                <Star className="w-3 h-3" />
                {(product as GradedSlab).gradingCompany} {(product as GradedSlab).grade}
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-4">{product.name}</h1>

          {product.description && (
            <p className="text-slate-400 mb-6 leading-relaxed">{product.description}</p>
          )}

          {/* Specs */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 mb-6 space-y-2">
            {product.type === 'raw-single' && (
              <>
                <SpecRow label="Set" value={(product as RawSingle).set} />
                <SpecRow label="Card Number" value={(product as RawSingle).cardNumber} />
                <SpecRow label="Condition" value={(product as RawSingle).condition} />
                <SpecRow label="Language" value={(product as RawSingle).language} />
              </>
            )}
            {product.type === 'graded-slab' && (
              <>
                <SpecRow label="Set" value={(product as GradedSlab).set} />
                <SpecRow label="Grading Co." value={(product as GradedSlab).gradingCompany} />
                <SpecRow label="Grade" value={(product as GradedSlab).grade} />
                <SpecRow label="Cert #" value={(product as GradedSlab).certNumber} />
              </>
            )}
            {product.type === 'sealed-product' && (
              <>
                <SpecRow label="Product Type" value={(product as SealedProduct).productType} />
                {(product as SealedProduct).releaseDate && (
                  <SpecRow
                    label="Release Date"
                    value={new Date((product as SealedProduct).releaseDate!).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  />
                )}
              </>
            )}
            <SpecRow
              label="Availability"
              value={outOfStock ? 'Out of Stock' : product.quantity <= 3 ? `Only ${product.quantity} left` : 'In Stock'}
              valueClass={outOfStock ? 'text-red-400' : product.quantity <= 3 ? 'text-amber-400' : 'text-green-400'}
            />
          </div>

          {/* Pricing */}
          <div className="mb-6">
            <p className="text-4xl font-extrabold text-white">{formatPrice(product.price)}</p>
            {product.marketPrice && (
              <p className="text-sm text-slate-500 mt-1">
                Market value: {formatPrice(product.marketPrice)}
                {savings && savings > 0 && (
                  <span className="ml-2 text-green-400 font-medium">({savings}% below market)</span>
                )}
              </p>
            )}
          </div>

          {/* CTA */}
          <button
            onClick={() => !outOfStock && addItem(product)}
            disabled={outOfStock}
            className={`w-full py-4 rounded-xl text-base font-semibold flex items-center justify-center gap-2 transition-colors ${
              outOfStock
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                : 'bg-purple-700 hover:bg-purple-600 text-white glow-purple-sm'
            }`}
          >
            <ShoppingCart className="w-5 h-5" />
            {outOfStock ? 'Sold Out' : 'Add to Cart'}
          </button>

          {/* Trust */}
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-purple-500" />
              Authenticated inventory
            </div>
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-purple-500" />
              Local pickup available
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SpecRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={valueClass || 'text-white font-medium'}>{value}</span>
    </div>
  );
}
