import { products } from "@/lib/products";
import ProductCard from "@/components/ProductCard";

export const metadata = {
  title: "Shop | SlabCraft Displays",
  description: "Browse all handmade wooden card displays for graded slabs, sports cards, Pokémon, and TCG collections.",
};

export default function ShopPage() {
  const categories = Array.from(new Set(products.map((p) => p.category)));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
      {/* Header */}
      <div className="mb-10">
        <div className="text-[#c9a96e] text-sm font-semibold tracking-widest uppercase mb-2">
          Handmade Wooden Displays
        </div>
        <h1 className="font-serif text-4xl font-bold text-[#1a1612] mb-3">
          Shop All Displays
        </h1>
        <p className="text-[#6b5e50] max-w-xl">
          Every display is built to order using quality wood and precision craftsmanship.
          Choose your finish, add engravings, and showcase your collection.
        </p>
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-3 mb-10">
        <span className="px-4 py-1.5 bg-[#1a1612] text-[#f5f0e8] text-sm font-medium rounded-full">
          All
        </span>
        {categories.map((cat) => (
          <span
            key={cat}
            className="px-4 py-1.5 border border-[#c9a96e] text-[#6b5e50] text-sm font-medium rounded-full hover:bg-[#f0e8d8] cursor-pointer transition-colors"
          >
            {cat}
          </span>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

      {/* Custom CTA */}
      <div className="mt-16 bg-[#f0e8d8] border border-[#e0d4bf] rounded-lg p-10 text-center">
        <div className="text-[#c9a96e] text-sm font-semibold tracking-widest uppercase mb-2">
          Don&apos;t See What You Need?
        </div>
        <h2 className="font-serif text-3xl font-bold text-[#1a1612] mb-3">
          Request a Custom Build
        </h2>
        <p className="text-[#6b5e50] mb-6 max-w-md mx-auto">
          We build fully custom displays for any card type, size, or configuration.
          Tell us what you&apos;re looking for.
        </p>
        <a
          href="/custom-orders"
          className="inline-flex items-center gap-2 px-7 py-3 bg-[#1a1612] text-[#f5f0e8] font-bold rounded hover:bg-[#c9a96e] hover:text-[#1a1612] transition-colors"
        >
          Start Custom Order
        </a>
      </div>
    </div>
  );
}
