'use client';

import { ShoppingCart, CreditCard, Lock, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useCartStore } from '@/lib/store';
import { formatPrice } from '@/lib/utils';

export default function CheckoutPage() {
  const { items, total } = useCartStore();
  const cartTotal = total();

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <Link
        href="/shop"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-purple-400 transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4" /> Continue Shopping
      </Link>

      <h1 className="text-2xl font-bold text-white mb-8">Checkout</h1>

      {items.length === 0 ? (
        <div className="text-center py-16">
          <ShoppingCart className="w-16 h-16 text-gray-700 mx-auto mb-4" />
          <p className="text-slate-400 mb-4">Your cart is empty</p>
          <Link href="/shop" className="text-purple-400 hover:text-purple-300 text-sm">
            Browse inventory
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Order summary */}
          <div className="bg-[#0f0f1a] border border-gray-800 rounded-2xl p-5">
            <h2 className="font-semibold text-white mb-4">Order Summary</h2>
            <div className="space-y-2 mb-4">
              {items.map((item) => (
                <div key={item.product.id} className="flex justify-between text-sm">
                  <span className="text-slate-400">{item.product.name} × {item.quantity}</span>
                  <span className="text-white">{formatPrice(item.product.price * item.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-800 pt-3 flex justify-between font-bold">
              <span className="text-white">Total</span>
              <span className="text-white text-lg">{formatPrice(cartTotal)}</span>
            </div>
          </div>

          {/* Payment placeholder */}
          <div className="bg-[#0f0f1a] border border-purple-900/30 rounded-2xl p-8 text-center">
            <div className="w-14 h-14 bg-purple-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CreditCard className="w-7 h-7 text-purple-400" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Payment Processing</h2>
            <p className="text-slate-400 text-sm mb-4">
              Stripe / PayPal integration coming soon. To complete your purchase, contact us directly.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/contact"
                className="px-6 py-2.5 bg-purple-700 hover:bg-purple-600 text-white font-medium rounded-xl transition-colors text-sm"
              >
                Contact to Purchase
              </Link>
            </div>
            <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-600">
              <Lock className="w-3 h-3" />
              Secure checkout coming soon via Stripe
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
