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
                Secret Stock <span className="text-purple-400">TX</span>
              </span>
            </Link>
            <p className="text-sm text-slate-400 mb-4 leading-relaxed">
              Your local source for Pokémon, One Piece, and Sports Cards in Wichita Falls, Texas.
              Contact us for current availability.
            </p>
            <div className="flex gap-3">
              <a
                href="https://www.instagram.com/secret_stock_tx/"
                target="_blank"
                rel="noopener noreferrer"
                title="Instagram"
                className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-slate-400 hover:bg-purple-800 hover:text-white transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Inventory */}
          <div>
            <h3 className="text-white font-semibold mb-4">Inventory</h3>
            <ul className="space-y-2 text-sm text-slate-400">
              {[
                { href: '/inventory?category=pokemon', label: 'Pokémon Cards' },
                { href: '/inventory?category=one-piece', label: 'One Piece Cards' },
                { href: '/inventory?category=sports-cards', label: 'Sports Cards' },
                { href: '/inventory?category=graded-slabs', label: 'Graded Slabs' },
                { href: '/inventory?category=sealed-products', label: 'Sealed Products' },
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
                { href: '/contact', label: 'Contact Us' },
                { href: '/collections', label: 'Sell Your Collection' },
                // Events hidden for inventory-showcase version — restore when ready
                // { href: '/events', label: 'Upcoming Events' },
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
                <span>2820 Holliday Rd<br />Wichita Falls, TX 76301</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-purple-400 shrink-0" />
                <a href="mailto:info@secretstocktx.com" className="hover:text-purple-400 transition-colors">
                  info@secretstocktx.com
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-purple-400 shrink-0" />
                <a href="tel:+19724825154" className="hover:text-purple-400 transition-colors">(972) 482-5154</a>
              </li>
            </ul>
            <Link
              href="/contact"
              className="mt-4 inline-block px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Message Us
            </Link>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} Secret Stock TX · Wichita Falls, Texas · Trading Cards &amp; Collectibles
          </p>
          <p className="text-xs text-slate-600">
            Serving Wichita Falls · Burkburnett · Iowa Park · Vernon · Lawton
          </p>
        </div>
      </div>
    </footer>
  );
}
