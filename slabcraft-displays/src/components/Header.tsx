"use client";

import Link from "next/link";
import { useState } from "react";
import { ShoppingCart, Menu, X } from "lucide-react";
import { useCart } from "@/lib/cart";

export default function Header() {
  const { count } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/shop", label: "Shop" },
    { href: "/custom-orders", label: "Custom Orders" },
    { href: "/about", label: "About" },
    { href: "/contact", label: "Contact" },
  ];

  return (
    <header className="bg-[#1a1612] text-[#f5f0e8] sticky top-0 z-50 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-[#c9a96e] text-2xl">⬡</span>
            <span className="font-serif text-xl font-bold tracking-wide">
              SlabCraft
              <span className="text-[#c9a96e]"> Displays</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm tracking-wide text-[#d4c9b5] hover:text-[#c9a96e] transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-4">
            <Link
              href="/custom-orders"
              className="hidden md:inline-flex items-center px-4 py-2 bg-[#c9a96e] text-[#1a1612] text-sm font-semibold rounded hover:bg-[#b8934f] transition-colors"
            >
              Request Custom Build
            </Link>
            <Link href="/cart" className="relative">
              <ShoppingCart className="w-5 h-5 text-[#d4c9b5] hover:text-[#c9a96e] transition-colors" />
              {count > 0 && (
                <span className="absolute -top-2 -right-2 bg-[#c9a96e] text-[#1a1612] text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {count}
                </span>
              )}
            </Link>
            <button
              className="md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-[#231e19] border-t border-[#3a3228] px-4 py-4">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="block py-3 text-[#d4c9b5] hover:text-[#c9a96e] transition-colors border-b border-[#3a3228]"
              onClick={() => setMobileOpen(false)}
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/custom-orders"
            className="block mt-4 text-center px-4 py-3 bg-[#c9a96e] text-[#1a1612] font-semibold rounded"
            onClick={() => setMobileOpen(false)}
          >
            Request Custom Build
          </Link>
        </div>
      )}
    </header>
  );
}
