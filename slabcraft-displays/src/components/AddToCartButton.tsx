"use client";

import { useState } from "react";
import { useCart } from "@/lib/cart";
import { Product } from "@/lib/products";
import { ShoppingCart, Check } from "lucide-react";

export default function AddToCartButton({ product }: { product: Product }) {
  const { addItem } = useCart();
  const [finish, setFinish] = useState(product.finishes[0]);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  function handleAdd() {
    addItem({ id: product.id, name: product.name, price: product.price, quantity, finish });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <div className="space-y-5">
      {/* Finish selector */}
      <div>
        <label className="block text-sm font-semibold text-[#1a1612] mb-2">
          Wood Finish
        </label>
        <div className="flex flex-wrap gap-2">
          {product.finishes.map((f) => (
            <button
              key={f}
              onClick={() => setFinish(f)}
              className={`px-4 py-2 rounded border text-sm font-medium transition-colors ${
                finish === f
                  ? "bg-[#1a1612] text-[#f5f0e8] border-[#1a1612]"
                  : "border-[#c9a96e] text-[#6b5e50] hover:border-[#1a1612]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Quantity */}
      <div>
        <label className="block text-sm font-semibold text-[#1a1612] mb-2">
          Quantity
        </label>
        <div className="flex items-center border border-[#e0d4bf] rounded w-fit">
          <button
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            className="px-3 py-2 text-[#6b5e50] hover:bg-[#f0e8d8] transition-colors"
          >
            −
          </button>
          <span className="px-5 py-2 font-semibold text-[#1a1612] border-x border-[#e0d4bf]">
            {quantity}
          </span>
          <button
            onClick={() => setQuantity(quantity + 1)}
            className="px-3 py-2 text-[#6b5e50] hover:bg-[#f0e8d8] transition-colors"
          >
            +
          </button>
        </div>
      </div>

      {/* Add to cart */}
      <button
        onClick={handleAdd}
        className={`w-full flex items-center justify-center gap-2 py-4 rounded font-bold text-base transition-colors ${
          added
            ? "bg-green-700 text-white"
            : "bg-[#1a1612] text-[#f5f0e8] hover:bg-[#c9a96e] hover:text-[#1a1612]"
        }`}
      >
        {added ? (
          <>
            <Check className="w-5 h-5" /> Added to Cart
          </>
        ) : (
          <>
            <ShoppingCart className="w-5 h-5" /> Add to Cart
          </>
        )}
      </button>
    </div>
  );
}
