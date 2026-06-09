import Link from "next/link";
import { Product } from "@/lib/products";

interface Props {
  product: Product;
}

const WOOD_SVG = (
  <svg
    viewBox="0 0 400 280"
    className="w-full h-full"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="400" height="280" fill="#c4a265" />
    {/* Wood grain lines */}
    {[20, 45, 70, 95, 120, 145, 170, 195, 220, 245, 270].map((y, i) => (
      <path
        key={i}
        d={`M0 ${y} Q200 ${y + (i % 2 === 0 ? 8 : -8)} 400 ${y}`}
        stroke="#b08d52"
        strokeWidth="1.5"
        fill="none"
        opacity="0.5"
      />
    ))}
    {/* Display stand silhouette */}
    <rect x="140" y="60" width="120" height="160" rx="4" fill="#8b6335" opacity="0.7" />
    <rect x="170" y="75" width="60" height="115" rx="2" fill="#f5f0e8" opacity="0.85" />
    <rect x="150" y="220" width="100" height="14" rx="3" fill="#6b4c22" opacity="0.8" />
    {/* Card texture in stand */}
    <rect x="174" y="79" width="52" height="107" rx="1" fill="#e8e0d0" opacity="0.5" />
    <rect x="178" y="83" width="44" height="6" rx="1" fill="#c9a96e" opacity="0.6" />
    <rect x="178" y="95" width="44" height="75" rx="1" fill="#d4c9b5" opacity="0.4" />
  </svg>
);

export default function ProductCard({ product }: Props) {
  return (
    <div className="group bg-white rounded-lg overflow-hidden shadow-sm border border-[#e8e0d0] hover:shadow-md transition-shadow">
      {/* Image */}
      <div className="relative h-52 bg-[#f0e8d8] overflow-hidden">
        {WOOD_SVG}
        <div className="absolute inset-0 bg-[#1a1612]/0 group-hover:bg-[#1a1612]/5 transition-colors" />
      </div>

      {/* Info */}
      <div className="p-5">
        <div className="text-xs text-[#c9a96e] font-semibold tracking-wider uppercase mb-1">
          {product.category}
        </div>
        <h3 className="font-serif text-lg font-bold text-[#1a1612] mb-2 leading-snug">
          {product.name}
        </h3>
        <p className="text-sm text-[#6b5e50] mb-4 line-clamp-2">
          {product.description}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-[#1a1612] font-bold text-lg">
            {product.priceLabel}
          </span>
          <Link
            href={`/shop/${product.slug}`}
            className="px-4 py-2 bg-[#1a1612] text-[#f5f0e8] text-sm font-semibold rounded hover:bg-[#c9a96e] hover:text-[#1a1612] transition-colors"
          >
            View Details
          </Link>
        </div>
      </div>
    </div>
  );
}
