"use client";

import { AtSign, MessageCircle, Share2, Mail } from "lucide-react";
import { LOCAL_PAGES } from "../lib/site";

const navLinks = [
  { label: "Home", href: "/#home" },
  { label: "About", href: "/#about" },
  { label: "Vendors", href: "/#vendors" },
  { label: "Reserve a Table", href: "/reserve" },
  { label: "FAQ", href: "/#faq" },
  { label: "Contact", href: "/#contact" },
];

const socials = [
  { icon: AtSign, href: "#", label: "Instagram" },
  { icon: MessageCircle, href: "#", label: "Facebook" },
  { icon: Share2, href: "#", label: "Twitter / X" },
  { icon: Mail, href: "mailto:hello@940collectorsexpo.com", label: "Email" },
];

export default function Footer() {
  return (
    <footer className="bg-[#080510] border-t border-white/5">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        {/* Top section */}
        <div className="py-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#A855F7] to-[#FACC15] flex items-center justify-center font-black text-[#0B0713] text-sm">
                940
              </div>
              <span className="font-bold text-white text-xl">Collectors Expo</span>
            </div>
            <p className="text-[#E5E7EB]/50 text-sm leading-relaxed max-w-xs mb-6">
              North Texas&apos;s premier collectibles show. Cards, Funko, comics, LEGO, toys, games &amp; more — bringing collectors, vendors, and families together one show at a time.
            </p>
            <div className="flex items-center gap-3">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  className="w-9 h-9 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-[#E5E7EB]/50 hover:text-white hover:bg-[#A855F7]/15 hover:border-[#A855F7]/20 transition-all duration-200"
                >
                  <s.icon size={15} />
                </a>
              ))}
            </div>
          </div>

          {/* Navigation */}
          <div>
            <p className="text-xs font-semibold text-[#E5E7EB]/30 uppercase tracking-widest mb-4">
              Navigate
            </p>
            <ul className="space-y-2.5">
              {navLinks.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="text-sm text-[#E5E7EB]/55 hover:text-white transition-colors"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <p className="text-xs font-semibold text-[#E5E7EB]/30 uppercase tracking-widest mb-4">
              Stay Updated
            </p>
            <p className="text-sm text-[#E5E7EB]/50 mb-4 leading-relaxed">
              Be the first to know when show dates are announced.
            </p>
            <form className="flex gap-2" onSubmit={(e) => e.preventDefault()}>
              <input
                type="email"
                placeholder="Your email"
                className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-[#E5E7EB]/25 focus:outline-none focus:border-[#A855F7]/40 text-sm transition-colors"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-[#A855F7] text-white font-semibold text-sm hover:bg-[#9333EA] transition-colors shrink-0"
              >
                Join
              </button>
            </form>
          </div>
        </div>

        {/* Popular searches / local guides (internal links for SEO) */}
        <div className="py-6 border-t border-white/5">
          <p className="text-xs font-semibold text-[#E5E7EB]/30 uppercase tracking-widest mb-3">
            Popular searches
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {LOCAL_PAGES.map((p) => (
              <a
                key={p.slug}
                href={`/${p.slug}`}
                className="text-sm text-[#E5E7EB]/50 hover:text-[#A855F7] transition-colors"
              >
                {p.label}
              </a>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="py-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-[#E5E7EB]/25">
            © {new Date().getFullYear()} 940 Collectors Expo. All rights reserved. North Texas.
          </p>
          <p className="text-xs text-[#E5E7EB]/20">
            The Premier Collector&apos;s Expo in the 940
          </p>
        </div>
      </div>
    </footer>
  );
}
