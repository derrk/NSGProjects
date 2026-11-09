import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Secret Stock TX | Trading Cards in Wichita Falls, TX",
  description:
    "Browse Pokémon, One Piece, and Sports Cards inventory from Secret Stock TX in Wichita Falls, Texas. Raw singles, graded slabs, sealed products, and collectibles. Contact us for availability.",
  keywords:
    "trading cards Wichita Falls, Pokémon cards Wichita Falls TX, sports cards Wichita Falls, One Piece cards Wichita Falls, buy sell trading cards Wichita Falls, card shop Wichita Falls TX, trading card inventory Wichita Falls",
  openGraph: {
    title: "Secret Stock TX | Trading Card Inventory – Wichita Falls, TX",
    description:
      "Browse featured inventory from Secret Stock TX — Pokémon, One Piece & Sports Cards in Wichita Falls, Texas.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      {/* The storefront's header and footer live in (storefront)/layout.tsx,
          so /admin renders without them. */}
      <body className="min-h-screen flex flex-col bg-[#0a0a0f] text-slate-100">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
