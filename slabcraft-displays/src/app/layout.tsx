import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/lib/cart";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Custom Wooden Card Displays | Handmade Card Stands & Slab Displays",
  description:
    "Shop handmade wooden card displays for graded cards, sports cards, Pokémon cards, TCG collections, and custom slab displays.",
  keywords:
    "custom wooden card displays, wooden card display stands, graded card display, sports card display stand, Pokémon card display, TCG card display, custom slab display, handmade card display",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-screen flex flex-col bg-[#faf8f5] text-[#1a1612]">
        <CartProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
