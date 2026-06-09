"use client";

import { useState } from "react";
import { useCart } from "@/lib/cart";
import { Check, Lock } from "lucide-react";
import Link from "next/link";

export default function CheckoutView() {
  const { items, total, clearCart } = useCart();
  const [placed, setPlaced] = useState(false);

  function handlePlace(e: React.FormEvent) {
    e.preventDefault();
    clearCart();
    setPlaced(true);
  }

  if (placed) {
    return (
      <div className="text-center py-20">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#c9a96e]/20 text-[#c9a96e] mb-5">
          <Check className="w-8 h-8" />
        </div>
        <h2 className="font-serif text-3xl font-bold text-[#1a1612] mb-3">
          Order Placed! (Demo)
        </h2>
        <p className="text-[#6b5e50] mb-8 max-w-md mx-auto">
          In the real site, you&apos;d receive a confirmation email here. Thanks for checking out SlabCraft Displays!
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#1a1612] text-[#f5f0e8] font-bold rounded hover:bg-[#c9a96e] hover:text-[#1a1612] transition-colors"
        >
          Back to Home
        </Link>
      </div>
    );
  }

  const inputClass = "w-full px-4 py-3 border border-[#e0d4bf] rounded bg-white text-[#1a1612] text-sm focus:outline-none focus:border-[#c9a96e] transition-colors";
  const labelClass = "block text-sm font-semibold text-[#1a1612] mb-1.5";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
      {/* Form */}
      <form onSubmit={handlePlace} className="lg:col-span-2 space-y-8">
        {/* Contact */}
        <div>
          <h2 className="font-serif text-xl font-bold text-[#1a1612] mb-4">Contact</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>First Name</label>
              <input type="text" className={inputClass} required />
            </div>
            <div>
              <label className={labelClass}>Last Name</label>
              <input type="text" className={inputClass} required />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Email</label>
              <input type="email" className={inputClass} required />
            </div>
          </div>
        </div>

        {/* Shipping */}
        <div>
          <h2 className="font-serif text-xl font-bold text-[#1a1612] mb-4">Shipping Address</h2>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Street Address</label>
              <input type="text" className={inputClass} required />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className={labelClass}>City</label>
                <input type="text" className={inputClass} required />
              </div>
              <div>
                <label className={labelClass}>State</label>
                <input type="text" className={inputClass} required placeholder="TX" />
              </div>
              <div>
                <label className={labelClass}>ZIP</label>
                <input type="text" className={inputClass} required placeholder="78701" />
              </div>
            </div>
          </div>
        </div>

        {/* Payment placeholder */}
        <div>
          <h2 className="font-serif text-xl font-bold text-[#1a1612] mb-4 flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#c9a96e]" /> Payment
          </h2>
          <div className="bg-[#f0e8d8] border border-[#e0d4bf] rounded-lg p-6 text-center text-[#6b5e50] text-sm">
            <Lock className="w-6 h-6 text-[#c9a96e] mx-auto mb-2" />
            <p className="font-semibold text-[#1a1612] mb-1">Secure Payment (Demo)</p>
            <p>In the live site, Stripe or Shopify Payments would be integrated here.</p>
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-4 bg-[#1a1612] text-[#f5f0e8] font-bold rounded hover:bg-[#c9a96e] hover:text-[#1a1612] transition-colors text-base"
        >
          Place Order (Demo)
        </button>
      </form>

      {/* Summary */}
      <div>
        <div className="bg-[#f0e8d8] border border-[#e0d4bf] rounded-lg p-6 sticky top-24">
          <h2 className="font-serif text-xl font-bold text-[#1a1612] mb-5">
            Order Summary
          </h2>
          <div className="space-y-3 mb-5">
            {items.map((item) => (
              <div key={`${item.id}-${item.finish}`} className="flex justify-between text-sm">
                <span className="text-[#6b5e50]">
                  {item.name} × {item.quantity}
                  <br />
                  <span className="text-xs text-[#a89880]">{item.finish}</span>
                </span>
                <span className="font-semibold text-[#1a1612]">
                  ${(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-[#e0d4bf] pt-4">
            <div className="flex justify-between font-bold text-[#1a1612]">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
            <p className="text-xs text-[#a89880] mt-2">+ shipping calculated at checkout</p>
          </div>
        </div>
      </div>
    </div>
  );
}
