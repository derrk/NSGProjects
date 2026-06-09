import { notFound } from "next/navigation";
import { products, getProductBySlug } from "@/lib/products";
import AddToCartButton from "@/components/AddToCartButton";
import Link from "next/link";
import { ChevronRight, Check } from "lucide-react";

export async function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) return {};
  return {
    title: `${product.name} | SlabCraft Displays`,
    description: product.description,
  };
}

const WOOD_SVG_LARGE = (
  <svg viewBox="0 0 600 500" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
    <rect width="600" height="500" fill="#c4a265" />
    {Array.from({ length: 16 }).map((_, i) => (
      <path
        key={i}
        d={`M0 ${i * 36} Q300 ${i * 36 + (i % 2 === 0 ? 12 : -12)} 600 ${i * 36}`}
        stroke="#b08d52"
        strokeWidth="2"
        fill="none"
        opacity="0.4"
      />
    ))}
    {/* Stand silhouette */}
    <rect x="200" y="80" width="200" height="300" rx="6" fill="#8b6335" opacity="0.75" />
    <rect x="230" y="105" width="140" height="245" rx="3" fill="#f5f0e8" opacity="0.9" />
    <rect x="210" y="380" width="180" height="22" rx="4" fill="#6b4c22" opacity="0.85" />
    {/* Card art */}
    <rect x="234" y="109" width="132" height="237" rx="2" fill="#e8e0d0" opacity="0.6" />
    <rect x="240" y="115" width="120" height="12" rx="2" fill="#c9a96e" opacity="0.7" />
    <rect x="240" y="135" width="120" height="100" rx="2" fill="#d4c9b5" opacity="0.5" />
    <rect x="240" y="245" width="80" height="8" rx="2" fill="#c9a96e" opacity="0.4" />
    <rect x="240" y="260" width="100" height="6" rx="2" fill="#c9a96e" opacity="0.3" />
  </svg>
);

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) notFound();

  const related = products.filter((p) => p.id !== product.id).slice(0, 3);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-[#a89880] mb-8">
        <Link href="/" className="hover:text-[#c9a96e]">Home</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/shop" className="hover:text-[#c9a96e]">Shop</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-[#1a1612]">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
        {/* Image */}
        <div className="aspect-[4/3] bg-[#f0e8d8] rounded-lg overflow-hidden border border-[#e0d4bf]">
          {WOOD_SVG_LARGE}
        </div>

        {/* Details */}
        <div>
          <div className="text-[#c9a96e] text-xs font-semibold tracking-widest uppercase mb-2">
            {product.category}
          </div>
          <h1 className="font-serif text-4xl font-bold text-[#1a1612] mb-2">
            {product.name}
          </h1>
          <div className="text-3xl font-bold text-[#1a1612] mb-4">
            {product.priceLabel}
          </div>

          <p className="text-[#6b5e50] leading-relaxed mb-6">
            {product.longDescription}
          </p>

          {/* Features */}
          <ul className="space-y-2 mb-8">
            {product.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-[#6b5e50]">
                <Check className="w-4 h-4 text-[#c9a96e] mt-0.5 shrink-0" />
                {f}
              </li>
            ))}
          </ul>

          {/* Add to cart form */}
          <AddToCartButton product={product} />

          <p className="mt-4 text-xs text-[#a89880] italic">
            Custom handmade items may vary slightly in wood grain and finish. Each piece is unique.
          </p>
        </div>
      </div>

      {/* Related products */}
      <div>
        <h2 className="font-serif text-2xl font-bold text-[#1a1612] mb-6">
          You Might Also Like
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {related.map((p) => (
            <Link
              key={p.id}
              href={`/shop/${p.slug}`}
              className="group bg-white border border-[#e8e0d0] rounded-lg overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="h-36 bg-[#f0e8d8]">
                <svg viewBox="0 0 400 200" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                  <rect width="400" height="200" fill="#c4a265" />
                  {[15, 40, 65, 90, 115, 140, 165].map((y, i) => (
                    <path key={i} d={`M0 ${y} Q200 ${y + (i % 2 === 0 ? 8 : -8)} 400 ${y}`} stroke="#b08d52" strokeWidth="1.5" fill="none" opacity="0.4" />
                  ))}
                  <rect x="150" y="30" width="100" height="130" rx="4" fill="#8b6335" opacity="0.7" />
                  <rect x="168" y="44" width="64" height="100" rx="2" fill="#f5f0e8" opacity="0.85" />
                </svg>
              </div>
              <div className="p-4">
                <p className="font-serif font-bold text-[#1a1612] group-hover:text-[#c9a96e] transition-colors">
                  {p.name}
                </p>
                <p className="text-sm text-[#6b5e50]">{p.priceLabel}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
