"use client";

import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";

const links = [
  { label: "Home", href: "/#home" },
  { label: "About", href: "/#about" },
  { label: "Vendors", href: "/#vendors" },
  { label: "Events", href: "/#events" },
  { label: "Reserve", href: "/reserve" },
  { label: "FAQ", href: "/#faq" },
  { label: "Contact", href: "/#contact" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#0B0713]/95 backdrop-blur-md border-b border-white/5 shadow-xl"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <a href="/#home" className="flex items-center gap-2.5 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.jpg"
              alt="940 Collector's Expo"
              className="h-10 w-10 object-contain logo-screen"
            />
            <span className="font-pixel text-white text-xs tracking-tight hidden sm:block">
              940 Collector&apos;s Expo
            </span>
          </a>

          {/* Desktop Links */}
          <div className="hidden lg:flex items-center gap-8">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm font-medium text-[#E5E7EB]/70 hover:text-white transition-colors duration-200"
              >
                {l.label}
              </a>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden lg:flex items-center gap-3">
            <a
              href="/reserve"
              className="px-4 py-2 rounded-lg bg-[#A855F7] hover:bg-[#9333EA] text-white text-[10px] font-pixel tracking-wide border-2 border-[#E9D5FF] shadow-[0_3px_0_#6B21A8] active:translate-y-0.5 transition-all duration-100"
            >
              Reserve a Table
            </a>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setOpen(!open)}
            className="lg:hidden p-2 rounded-lg text-[#E5E7EB] hover:bg-white/10 transition-colors"
            aria-label="Toggle menu"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {open && (
        <div className="lg:hidden bg-[#171022] border-t border-white/5">
          <div className="px-6 py-4 flex flex-col gap-1">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="py-3 text-base font-medium text-[#E5E7EB]/80 hover:text-white border-b border-white/5 last:border-0 transition-colors"
              >
                {l.label}
              </a>
            ))}
            <a
              href="/reserve"
              onClick={() => setOpen(false)}
              className="mt-4 px-5 py-3 rounded-full bg-[#A855F7] text-white text-center font-semibold hover:bg-[#9333EA] transition-colors"
            >
              Reserve a Table
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
