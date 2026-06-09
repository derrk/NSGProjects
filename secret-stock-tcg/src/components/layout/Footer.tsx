import Link from 'next/link';
import { Zap, MapPin, Mail, Phone, ExternalLink } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-[#080810] border-t border-purple-900/30 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="lg:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-purple-700 flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-lg text-white">
                Secret Stock <span className="text-purple-400">TCG</span>
              </span>
            </Link>
            <p className="text-sm text-slate-400 mb-4 leading-relaxed">
              Your local source for Pokémon, One Piece, and Sports Cards in Wichita Falls, Texas.
            </p>
            <div className="flex gap-3">
              {['Instagram', 'TikTok', 'Facebook'].map((label) => (
                <a key={label} href="#" title={label} className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-slate-400 hover:bg-purple-800 hover:text-white transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ))}
            </div>
          </div>

          {/* Shop */}
          <div>
            <h3 className="text-white font-semibold mb-4">Shop</h3>
            <ul className="space-y-2 text-sm text-slate-400">
              {[
                { href: '/shop?category=pokemon', label: 'Pokémon Cards' },
                { href: '/shop?category=one-piece', label: 'One Piece Cards' },
                { href: '/shop?category=sports-cards', label: 'Sports Cards' },
                { href: '/shop?category=graded-slabs', label: 'Graded Slabs' },
                { href: '/shop?category=sealed-products', label: 'Sealed Products' },
                { href: '/collections', label: 'Sell Your Collection' },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-purple-400 transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Info */}
          <div>
            <h3 className="text-white font-semibold mb-4">Information</h3>
            <ul className="space-y-2 text-sm text-slate-400">
              {[
                { href: '/about', label: 'About Us' },
                { href: '/events', label: 'Upcoming Events' },
                { href: '/contact', label: 'Contact Us' },
                { href: '/admin', label: 'Admin Dashboard' },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-purple-400 transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-white font-semibold mb-4">Contact</h3>
            <ul className="space-y-3 text-sm text-slate-400">
              <li className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                <span>Wichita Falls, TX<br />Available at local card shows</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-purple-400 shrink-0" />
                <a href="mailto:info@secretstocktcg.com" className="hover:text-purple-400 transition-colors">
                  info@secretstocktcg.com
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-purple-400 shrink-0" />
                <span>(940) 000-0000</span>
              </li>
            </ul>
            <div className="mt-4 p-3 bg-gray-900 rounded-lg border border-gray-800">
              <p className="text-xs text-slate-400 font-medium mb-1">Business Hours</p>
              <p className="text-xs text-slate-500">Online 24/7</p>
              <p className="text-xs text-slate-500">Local pickup by appointment</p>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} Secret Stock TCG. All rights reserved. Wichita Falls, Texas.
          </p>
          <p className="text-xs text-slate-600">
            Serving Wichita Falls · Burkburnett · Iowa Park · Vernon · Lawton
          </p>
        </div>
      </div>
    </footer>
  );
}
