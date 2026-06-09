'use client';

import { X, ShoppingCart, Trash2, Plus, Minus } from 'lucide-react';
import Link from 'next/link';
import { useCartStore } from '@/lib/store';
import { formatPrice } from '@/lib/utils';

export default function CartDrawer() {
  const { items, isOpen, toggleCart, removeItem, updateQuantity, total } = useCartStore();
  const cartTotal = total();

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={toggleCart}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-[#0d0d18] border-l border-purple-900/30 z-50 flex flex-col transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-purple-400" />
            <h2 className="font-semibold text-white">Your Cart</h2>
            {items.length > 0 && (
              <span className="text-xs text-slate-400">({items.length} items)</span>
            )}
          </div>
          <button
            onClick={toggleCart}
            className="p-2 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <ShoppingCart className="w-16 h-16 text-gray-700 mb-4" />
              <p className="text-slate-400 mb-2">Your cart is empty</p>
              <p className="text-sm text-slate-600">Add some cards to get started</p>
              <button
                onClick={toggleCart}
                className="mt-6 px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white text-sm rounded-lg transition-colors"
              >
                Continue Shopping
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.product.id}
                  className="flex gap-3 p-3 bg-gray-900/50 rounded-lg border border-gray-800"
                >
                  <div className="w-16 h-20 bg-gray-800 rounded-md flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-6 h-6 text-gray-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{item.product.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5 capitalize">
                      {item.product.category.replace('-', ' ')}
                    </p>
                    <p className="text-sm font-semibold text-purple-400 mt-1">
                      {formatPrice(item.product.price)}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                        className="w-6 h-6 rounded bg-gray-800 flex items-center justify-center hover:bg-gray-700 transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-sm text-white w-4 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                        className="w-6 h-6 rounded bg-gray-800 flex items-center justify-center hover:bg-gray-700 transition-colors"
                        disabled={item.quantity >= item.product.quantity}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => removeItem(item.product.id)}
                    className="text-slate-600 hover:text-red-400 transition-colors p-1 self-start"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="p-4 border-t border-gray-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Subtotal</span>
              <span className="text-xl font-bold text-white">{formatPrice(cartTotal)}</span>
            </div>
            <p className="text-xs text-slate-500">Shipping calculated at checkout</p>
            <Link
              href="/checkout"
              onClick={toggleCart}
              className="block w-full py-3 bg-purple-700 hover:bg-purple-600 text-white text-center font-semibold rounded-lg transition-colors glow-purple-sm"
            >
              Proceed to Checkout
            </Link>
            <button
              onClick={toggleCart}
              className="block w-full py-2 text-sm text-slate-400 hover:text-white transition-colors text-center"
            >
              Continue Shopping
            </button>
          </div>
        )}
      </div>
    </>
  );
}
