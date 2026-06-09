import Link from "next/link";
import { Mail, Camera, Globe, MessageCircle } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-[#1a1612] text-[#d4c9b5]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[#c9a96e] text-xl">⬡</span>
              <span className="font-serif text-lg font-bold text-[#f5f0e8]">
                SlabCraft<span className="text-[#c9a96e]"> Displays</span>
              </span>
            </div>
            <p className="text-sm text-[#a89880] leading-relaxed">
              Handcrafted wooden displays built for serious collectors. Every
              piece is made to order with care.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-[#f5f0e8] font-semibold text-sm tracking-wider uppercase mb-4">
              Quick Links
            </h4>
            <ul className="space-y-2 text-sm">
              {[
                { href: "/shop", label: "Shop All" },
                { href: "/custom-orders", label: "Custom Orders" },
                { href: "/about", label: "About Us" },
                { href: "/contact", label: "Contact" },
                { href: "/cart", label: "Cart" },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-[#a89880] hover:text-[#c9a96e] transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Products */}
          <div>
            <h4 className="text-[#f5f0e8] font-semibold text-sm tracking-wider uppercase mb-4">
              Products
            </h4>
            <ul className="space-y-2 text-sm">
              {[
                "Single Card Slab Stand",
                "Triple Slab Display",
                "Wall-Mounted Display",
                "Sports Card Showcase",
                "TCG Collector Shelf",
                "Custom Logo Display",
              ].map((name) => (
                <li key={name}>
                  <Link
                    href="/shop"
                    className="text-[#a89880] hover:text-[#c9a96e] transition-colors"
                  >
                    {name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-[#f5f0e8] font-semibold text-sm tracking-wider uppercase mb-4">
              Get In Touch
            </h4>
            <div className="flex items-center gap-2 text-sm text-[#a89880] mb-4">
              <Mail className="w-4 h-4 text-[#c9a96e]" />
              <span>hello@slabcraftdisplays.com</span>
            </div>
            <div className="flex gap-4 mt-4">
              <a
                href="#"
                className="text-[#a89880] hover:text-[#c9a96e] transition-colors"
              >
                <Camera className="w-5 h-5" />
              </a>
              <a
                href="#"
                className="text-[#a89880] hover:text-[#c9a96e] transition-colors"
              >
                <Globe className="w-5 h-5" />
              </a>
              <a
                href="#"
                className="text-[#a89880] hover:text-[#c9a96e] transition-colors"
              >
                <MessageCircle className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-[#3a3228] text-center text-xs text-[#6b5e50]">
          © {new Date().getFullYear()} SlabCraft Displays. All rights reserved.
          Handmade with care.
        </div>
      </div>
    </footer>
  );
}
