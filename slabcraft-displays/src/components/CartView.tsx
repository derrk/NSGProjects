"use client";

import { useCart } from "@/lib/cart";
import Link from "next/link";
import { Trash2, ArrowRight, ShoppingBag } from "lucide-react";

export default function CartView() {
  const { items, removeItem, updateQuantity, total, clearCart } = useCart();

  if (items.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#f0e8d8] text-[#c9a96e] mb-5">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <h2 className="font-serif text-2xl font-bold text-[#1a1612] mb-3">
          Your cart is empty
        </h2>
        <p className="text-[#6b5e50] mb-8">
          Looks like you haven&apos;t added anything yet.
        </p>
        <Link
          href="/shop"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#1a1612] text-[#f5f0e8] font-bold rounded hover:bg-[#c9a96e] hover:text-[#1a1612] transition-colors"
        >
          Browse Displays <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
      {/* Items */}
      <div className="lg:col-span-2 space-y-4">
        {items.map((item) => (
          <div
            key={`${item.id}-${item.finish}`}
            className="flex gap-4 bg-white border border-[#e0d4bf] rounded-lg p-5"
          >
            <div className="w-20 h-20 bg-[#f0e8d8] rounded shrink-0 overflow-hidden">
              <svg viewBox="0 0 80 80" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <rect width="80" height="80" fill="#c4a265" />
                <rect x="20" y="10" width="40" height="55" rx="2" fill="#8b6335" opacity="0.7" />
                <rect x="27" y="17" width="26" height="41" rx="1" fill="#f5f0e8" opacity="0.85" />
                <rect x="22" y="65" width="36" height="8" rx="2" fill="#6b4c22" opacity="0.8" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-serif font-bold text-[#1a1612]">{item.name}</h3>
              <p className="text-sm text-[#a89880]">Finish: {item.finish}</p>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center border border-[#e0d4bf] rounded">
                  <button
                    onClick={() => updateQuantity(item.id, item.finish, item.quantity - 1)}
                    className="px-2 py-1 text-[#6b5e50] hover:bg-[#f0e8d8] transition-colors text-sm"
                  >
                    −
                  </button>
                  <span className="px-3 py-1 text-sm font-semibold border-x border-[#e0d4bf]">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.id, item.finish, item.quantity + 1)}
                    className="px-2 py-1 text-[#6b5e50] hover:bg-[#f0e8d8] transition-colors text-sm"
                  >
                    +
                  </button>
                </div>
                <button
                  onClick={() => removeItem(item.id, item.finish)}
                  className="text-[#a89880] hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="text-right">
              <div className="font-bold text-[#1a1612]">
                ${(item.price * item.quantity).toFixed(2)}
              </div>
              <div className="text-sm text-[#a89880]">${item.price.toFixed(2)} each</div>
            </div>
          </div>
        ))}

        <button
          onClick={clearCart}
          className="text-sm text-[#a89880] hover:text-red-500 transition-colors mt-2"
        >
          Clear cart
        </button>
      </div>

      {/* Summary */}
      <div>
        <div className="bg-[#f0e8d8] border border-[#e0d4bf] rounded-lg p-6 sticky top-24">
          <h2 className="font-serif text-xl font-bold text-[#1a1612] mb-5">
            Order Summary
          </h2>
          <div className="space-y-3 text-sm text-[#6b5e50] mb-5">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>${total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Shipping</span>
              <span className="text-[#c9a96e]">Calculated at checkout</span>
            </div>
          </div>
          <div className="border-t border-[#e0d4bf] pt-4 mb-5">
            <div className="flex justify-between font-bold text-[#1a1612]">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>
          <Link
            href="/checkout"
            className="block w-full text-center py-3.5 bg-[#1a1612] text-[#f5f0e8] font-bold rounded hover:bg-[#c9a96e] hover:text-[#1a1612] transition-colors"
          >
            Proceed to Checkout
          </Link>
          <Link
            href="/shop"
            className="block w-full text-center mt-3 py-3 border border-[#c9a96e] text-[#6b5e50] text-sm font-medium rounded hover:bg-white transition-colors"
          >
            Continue Shopping
          </Link>
          <p className="text-xs text-[#a89880] text-center mt-4">
            All items handmade to order. Custom pieces take 1–2 weeks.
          </p>
        </div>
      </div>
    </div>
  );
}
