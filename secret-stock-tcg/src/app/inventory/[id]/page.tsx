'use client';

import { useParams } from 'next/navigation';
import { notFound } from 'next/navigation';
import { ArrowLeft, Package, Star, Shield, MessageCircle, MapPin } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { products } from '@/lib/data';
import { GradedSlab, RawSingle, SealedProduct, Artwork, ApparelItem } from '@/lib/types';

export default function InventoryItemPage() {
  const { id } = useParams<{ id: string }>();
  const product = products.find((p) => p.id === id);
  const [imgError, setImgError] = useState(false);

  if (!product) return notFound();

  const outOfStock = product.quantity === 0;
  const hasRealImage = product.image && !imgError;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link
        href="/inventory"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-purple-400 transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Inventory
      </Link>

      <div className="grid md:grid-cols-2 gap-10">
        {/* Image */}
        <div>
          <div className="aspect-[3/4] bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl flex items-center justify-center border border-gray-700 overflow-hidden relative">
            {hasRealImage ? (
              <Image
                src={product.image}
                alt={product.name}
                fill
                className="object-contain p-4"
                sizes="(max-width: 768px) 100vw, 50vw"
                onError={() => setImgError(true)}
              />
            ) : (
              <Package className="w-24 h-24 text-gray-600" />
            )}
          </div>
          {outOfStock && (
            <div className="mt-3 p-3 bg-gray-900 border border-gray-700 rounded-xl text-center">
              <p className="text-sm text-slate-500">
                This item is currently unavailable. Contact us — similar inventory may be in stock.
              </p>
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          {/* Category + type badges */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="text-xs px-2.5 py-1 bg-purple-900/40 text-purple-300 border border-purple-700/40 rounded-full capitalize">
              {product.category.replace('-', ' ')}
            </span>
            {product.type === 'graded-slab' && (
              <span className="text-xs px-2.5 py-1 bg-yellow-900/40 text-yellow-300 border border-yellow-700/40 rounded-full flex items-center gap-1">
                <Star className="w-3 h-3" />
                {(product as GradedSlab).gradingCompany} Grade {(product as GradedSlab).grade}
              </span>
            )}
            {product.type === 'raw-single' && (
              <span className="text-xs px-2.5 py-1 bg-green-900/40 text-green-300 border border-green-700/40 rounded-full">
                {(product as RawSingle).condition}
              </span>
            )}
            {product.type === 'sealed-product' && (
              <span className="text-xs px-2.5 py-1 bg-blue-900/40 text-blue-300 border border-blue-700/40 rounded-full">
                {(product as SealedProduct).productType}
              </span>
            )}
            {product.type === 'artwork' && (
              <span className="text-xs px-2.5 py-1 bg-pink-900/40 text-pink-300 border border-pink-700/40 rounded-full">
                {(product as Artwork).medium}
              </span>
            )}
            {product.type === 'apparel-item' && (
              <span className="text-xs px-2.5 py-1 bg-indigo-900/40 text-indigo-300 border border-indigo-700/40 rounded-full">
                {(product as ApparelItem).apparelType}
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-4">{product.name}</h1>

          {product.description && (
            <p className="text-slate-400 mb-6 leading-relaxed">{product.description}</p>
          )}

          {/* Specs table */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 mb-6 space-y-2.5">
            <h3 className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">Details</h3>

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
                <SpecRow label="Grading Company" value={(product as GradedSlab).gradingCompany} />
                <SpecRow label="Grade" value={(product as GradedSlab).grade} />
                <SpecRow label="Cert Number" value={(product as GradedSlab).certNumber} />
              </>
            )}
            {product.type === 'sealed-product' && (
              <>
                <SpecRow label="Product Type" value={(product as SealedProduct).productType} />
                {(product as SealedProduct).releaseDate && (
                  <SpecRow
                    label="Release Date"
                    value={new Date((product as SealedProduct).releaseDate!).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'long', day: 'numeric',
                    })}
                  />
                )}
              </>
            )}
            {product.type === 'artwork' && (
              <>
                <SpecRow label="Medium" value={(product as Artwork).medium} />
                {(product as Artwork).dimensions && (
                  <SpecRow label="Dimensions" value={(product as Artwork).dimensions!} />
                )}
                {(product as Artwork).artist && (
                  <SpecRow label="Artist" value={(product as Artwork).artist!} />
                )}
              </>
            )}
            {product.type === 'apparel-item' && (
              <>
                <SpecRow label="Type" value={(product as ApparelItem).apparelType} />
                <SpecRow label="Color" value={(product as ApparelItem).color} />
                <SpecRow label="Available Sizes" value={(product as ApparelItem).sizes.join(', ')} />
                <SpecRow label="Design" value={(product as ApparelItem).design} />
              </>
            )}

            <SpecRow
              label="Availability"
              value={outOfStock ? 'Currently Unavailable' : 'Available — Contact to Confirm'}
              valueClass={outOfStock ? 'text-slate-500' : 'text-green-400'}
            />
          </div>

          {/* Primary CTA */}
          <Link
            href={`/contact?item=${encodeURIComponent(product.name)}`}
            className={`block w-full py-4 rounded-xl text-base font-semibold text-center flex items-center justify-center gap-2 transition-colors ${
              outOfStock
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed pointer-events-none'
                : 'bg-purple-700 hover:bg-purple-600 text-white glow-purple-sm'
            }`}
          >
            <MessageCircle className="w-5 h-5" />
            {outOfStock ? 'Currently Unavailable' : 'Ask About This Item'}
          </Link>

          {!outOfStock && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Link
                href="/contact"
                className="py-2.5 border border-gray-700 hover:border-purple-700/50 text-slate-300 hover:text-white text-sm font-medium rounded-xl transition-colors text-center"
              >
                Visit the Shop
              </Link>
              <Link
                href="/collections"
                className="py-2.5 border border-gray-700 hover:border-purple-700/50 text-slate-300 hover:text-white text-sm font-medium rounded-xl transition-colors text-center"
              >
                Sell Your Collection
              </Link>
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-purple-500" />
              Verified inventory
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-purple-500" />
              Local pickup · Wichita Falls, TX
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
