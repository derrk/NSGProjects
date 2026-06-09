import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import CartDrawer from "@/components/cart/CartDrawer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Secret Stock TCG | Pokémon, One Piece & Sports Cards – Wichita Falls, TX",
  description:
    "Shop Pokémon, One Piece, and Sports Cards in Wichita Falls, Texas. Secret Stock TCG offers singles, sealed products, graded slabs, and vintage collectibles. Local pickup available.",
  keywords:
    "Pokémon cards Wichita Falls, sports cards Wichita Falls, trading card shop Wichita Falls, One Piece cards Texas, buy Pokémon cards Wichita Falls, card shop Wichita Falls TX",
  openGraph: {
    title: "Secret Stock TCG | Trading Cards – Wichita Falls, TX",
    description:
      "Your source for Pokémon, One Piece & Sports Cards. Shop online or find us at card shows across Texas.",
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
      <body className="min-h-screen flex flex-col bg-[#0a0a0f] text-slate-100">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <CartDrawer />
      </body>
    </html>
  );
}
