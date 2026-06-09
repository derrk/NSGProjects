import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata = {
  title: "About | SlabCraft Displays",
  description: "Learn the story behind SlabCraft Displays — handmade wooden card displays built for serious collectors.",
};

export default function AboutPage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-[#1a1612] text-[#f5f0e8] py-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <div className="text-[#c9a96e] text-sm font-semibold tracking-widest uppercase mb-3">
            Our Story
          </div>
          <h1 className="font-serif text-5xl font-bold mb-5">
            Built by Collectors,{" "}
            <span className="text-[#c9a96e]">for Collectors</span>
          </h1>
          <p className="text-[#a89880] text-lg leading-relaxed">
            We create handmade wooden card displays for collectors who want
            their favorite cards to stand out. Each piece is built with care,
            attention to detail, and a focus on quality craftsmanship.
          </p>
        </div>
      </section>

      {/* Story sections */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 space-y-20">
        {/* Our Story */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div className="aspect-[4/3] bg-[#f0e8d8] rounded-lg overflow-hidden border border-[#e0d4bf]">
            <svg viewBox="0 0 400 300" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <rect width="400" height="300" fill="#c4a265" />
              {Array.from({ length: 12 }).map((_, i) => (
                <path key={i} d={`M0 ${i * 28} Q200 ${i * 28 + (i % 2 === 0 ? 10 : -10)} 400 ${i * 28}`} stroke="#b08d52" strokeWidth="1.5" fill="none" opacity="0.4" />
              ))}
              <text x="200" y="160" textAnchor="middle" fill="#6b4c22" fontSize="18" fontFamily="Georgia" opacity="0.6">Workshop Photo</text>
              <text x="200" y="185" textAnchor="middle" fill="#6b4c22" fontSize="12" fontFamily="Georgia" opacity="0.4">Coming Soon</text>
            </svg>
          </div>
          <div>
            <div className="text-[#c9a96e] text-xs font-semibold tracking-widest uppercase mb-2">
              How It Started
            </div>
            <h2 className="font-serif text-3xl font-bold text-[#1a1612] mb-4">
              Our Story
            </h2>
            <p className="text-[#6b5e50] leading-relaxed mb-4">
              SlabCraft Displays started in a garage workshop with a simple
              idea: collectors deserve better displays for their cards. After
              searching for quality wooden stands that could properly hold
              graded slabs, the founder decided to build one from scratch.
            </p>
            <p className="text-[#6b5e50] leading-relaxed">
              Word spread among friends and local collector communities, and
              before long, custom orders were coming in from collectors across
              the country. Every piece is still made by hand, one at a time.
            </p>
          </div>
        </div>

        {/* Built by hand */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div className="md:order-2 aspect-[4/3] bg-[#f0e8d8] rounded-lg overflow-hidden border border-[#e0d4bf]">
            <svg viewBox="0 0 400 300" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <rect width="400" height="300" fill="#d4b87a" />
              {Array.from({ length: 12 }).map((_, i) => (
                <path key={i} d={`M0 ${i * 28} Q200 ${i * 28 + (i % 2 === 0 ? 8 : -8)} 400 ${i * 28}`} stroke="#c4a265" strokeWidth="1.5" fill="none" opacity="0.4" />
              ))}
              <text x="200" y="160" textAnchor="middle" fill="#6b4c22" fontSize="18" fontFamily="Georgia" opacity="0.6">Process Photo</text>
              <text x="200" y="185" textAnchor="middle" fill="#6b4c22" fontSize="12" fontFamily="Georgia" opacity="0.4">Coming Soon</text>
            </svg>
          </div>
          <div className="md:order-1">
            <div className="text-[#c9a96e] text-xs font-semibold tracking-widest uppercase mb-2">
              The Process
            </div>
            <h2 className="font-serif text-3xl font-bold text-[#1a1612] mb-4">
              Built by Hand
            </h2>
            <p className="text-[#6b5e50] leading-relaxed mb-4">
              Every display starts as raw hardwood — carefully selected for
              grain pattern and quality. Each piece is cut, routed, sanded, and
              finished by hand. No shortcuts, no assembly lines.
            </p>
            <p className="text-[#6b5e50] leading-relaxed">
              The result is a piece that feels as premium as the cards it
              holds. Slight variations in wood grain are natural and give each
              display a character that mass-produced stands simply can&apos;t replicate.
            </p>
          </div>
        </div>

        {/* Made for collectors */}
        <div className="bg-[#1a1612] text-[#f5f0e8] rounded-xl p-10">
          <div className="text-center mb-10">
            <div className="text-[#c9a96e] text-xs font-semibold tracking-widest uppercase mb-2">
              Who We Build For
            </div>
            <h2 className="font-serif text-3xl font-bold mb-3">
              Made for Collectors
            </h2>
            <p className="text-[#a89880] max-w-lg mx-auto">
              Whether you collect Pokémon cards, graded sports cards, One Piece,
              or any other TCG — we build displays that work for your collection.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {["Pokémon & TCG", "Graded Slabs", "Sports Cards", "Custom Collections"].map((c) => (
              <div key={c} className="bg-[#231e19] border border-[#3a3228] rounded-lg p-4 text-center">
                <div className="text-[#c9a96e] text-sm font-semibold">{c}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#f0e8d8] border-t border-[#e0d4bf] py-16">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="font-serif text-3xl font-bold text-[#1a1612] mb-4">
            Ready to display your collection?
          </h2>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/shop"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#1a1612] text-[#f5f0e8] font-bold rounded hover:bg-[#c9a96e] hover:text-[#1a1612] transition-colors"
            >
              Shop Displays <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/custom-orders"
              className="inline-flex items-center gap-2 px-6 py-3 border-2 border-[#1a1612] text-[#1a1612] font-bold rounded hover:bg-[#1a1612] hover:text-[#f5f0e8] transition-colors"
            >
              Request Custom Build
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
