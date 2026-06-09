import Link from "next/link";
import { products } from "@/lib/products";
import ProductCard from "@/components/ProductCard";
import { ArrowRight, Hammer, Shield, Palette, Star } from "lucide-react";

export default function HomePage() {
  const featured = products.slice(0, 3);

  return (
    <>
      {/* Hero */}
      <section className="relative bg-[#1a1612] text-[#f5f0e8] overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <svg viewBox="0 0 800 500" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
            {Array.from({ length: 20 }).map((_, i) => (
              <path
                key={i}
                d={`M0 ${i * 28} Q400 ${i * 28 + (i % 2 === 0 ? 14 : -14)} 800 ${i * 28}`}
                stroke="#c9a96e"
                strokeWidth="1"
                fill="none"
              />
            ))}
          </svg>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-36">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-[#c9a96e]/20 border border-[#c9a96e]/40 rounded-full px-4 py-1.5 text-[#c9a96e] text-sm font-medium mb-6">
              <span>⬡</span> Handmade to Order
            </div>
            <h1 className="font-serif text-5xl md:text-6xl font-bold leading-tight mb-6">
              Custom Wooden Card Displays{" "}
              <span className="text-[#c9a96e]">Built for Collectors</span>
            </h1>
            <p className="text-xl text-[#a89880] mb-10 leading-relaxed">
              Handmade display pieces designed to showcase your favorite graded
              cards, slabs, and collectibles. Every piece is crafted to order.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/shop"
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-[#c9a96e] text-[#1a1612] font-bold rounded hover:bg-[#b8934f] transition-colors text-base"
              >
                Shop Displays <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/custom-orders"
                className="inline-flex items-center gap-2 px-7 py-3.5 border-2 border-[#c9a96e] text-[#c9a96e] font-bold rounded hover:bg-[#c9a96e] hover:text-[#1a1612] transition-colors text-base"
              >
                Request Custom Build
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="bg-[#f0e8d8] border-b border-[#e0d4bf]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-wrap justify-center gap-6 md:gap-12 text-sm text-[#6b5e50] font-medium">
            {["Handmade to Order", "Natural Wood Materials", "Graded Slab Compatible", "Custom Engravings Available", "Ships Nationwide"].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <span className="text-[#c9a96e]">✦</span> {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <div className="text-[#c9a96e] text-sm font-semibold tracking-widest uppercase mb-2">
            Popular Pieces
          </div>
          <h2 className="font-serif text-4xl font-bold text-[#1a1612] mb-4">
            Featured Displays
          </h2>
          <p className="text-[#6b5e50] max-w-lg mx-auto">
            Each display is handcrafted and built to order. Choose a finish,
            add personalization, and make it your own.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 mb-10">
          {featured.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        <div className="text-center">
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 px-8 py-3 border-2 border-[#1a1612] text-[#1a1612] font-bold rounded hover:bg-[#1a1612] hover:text-[#f5f0e8] transition-colors"
          >
            View All Products <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Why Collectors Love Them */}
      <section className="bg-[#1a1612] text-[#f5f0e8] py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="text-[#c9a96e] text-sm font-semibold tracking-widest uppercase mb-2">
              The Difference
            </div>
            <h2 className="font-serif text-4xl font-bold mb-4">
              Why Collectors Love Them
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                icon: <Hammer className="w-7 h-7" />,
                title: "Handmade Craftsmanship",
                body: "Every display is built by hand with care and attention to detail. No mass production — just quality woodworking.",
              },
              {
                icon: <Shield className="w-7 h-7" />,
                title: "Slab Compatible",
                body: "Designed specifically for PSA, BGS, CGC, and SGC graded slabs. Your cards fit perfectly, every time.",
              },
              {
                icon: <Star className="w-7 h-7" />,
                title: "All Card Types",
                body: "From Pokémon and sports cards to MTG and One Piece, our displays work for any TCG collection.",
              },
              {
                icon: <Palette className="w-7 h-7" />,
                title: "Fully Customizable",
                body: "Choose your wood finish, add engravings, request custom sizes, logos, and configurations.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-[#231e19] border border-[#3a3228] rounded-lg p-7 text-center"
              >
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#c9a96e]/15 border border-[#c9a96e]/30 text-[#c9a96e] mb-5">
                  {item.icon}
                </div>
                <h3 className="font-serif text-lg font-bold mb-3 text-[#f5f0e8]">
                  {item.title}
                </h3>
                <p className="text-[#a89880] text-sm leading-relaxed">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Custom Orders CTA */}
      <section className="bg-[#f0e8d8] border-t border-b border-[#e0d4bf] py-20">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <div className="text-[#c9a96e] text-sm font-semibold tracking-widest uppercase mb-3">
            Something Unique
          </div>
          <h2 className="font-serif text-4xl font-bold text-[#1a1612] mb-5">
            Have a custom idea?{" "}
            <span className="text-[#c9a96e]">Let&apos;s build it.</span>
          </h2>
          <p className="text-[#6b5e50] text-lg mb-8 leading-relaxed">
            Got a specific size in mind? Want a team logo engraved? Need a
            display for 20 slabs? We do full custom builds — just tell us what
            you&apos;re looking for.
          </p>
          <Link
            href="/custom-orders"
            className="inline-flex items-center gap-2 px-8 py-4 bg-[#1a1612] text-[#f5f0e8] font-bold rounded hover:bg-[#c9a96e] hover:text-[#1a1612] transition-colors text-base"
          >
            Start Custom Order <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
