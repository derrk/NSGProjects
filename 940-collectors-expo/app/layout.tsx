import type { Metadata } from "next";
import { Inter, Silkscreen } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const silkscreen = Silkscreen({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-pixel",
});

export const metadata: Metadata = {
  title: "940 Collector's Expo | North Texas Collectibles Show",
  description:
    "940 Collector's Expo is North Texas's premier collectibles event in Wichita Falls. Buy, sell, and trade trading cards, Funko Pops, comics, LEGO, action figures, video games, anime figures, memorabilia, and everything collectible.",
  keywords: [
    "940 Collectors Expo",
    "collectibles show Texas",
    "collectibles show Wichita Falls",
    "North Texas collectors event",
    "trading card show Texas",
    "Pokémon card show",
    "sports card show",
    "Funko Pop show",
    "comic con Wichita Falls",
    "LEGO show",
    "action figure show",
    "video game expo",
    "anime figure show",
    "collector convention",
    "vendor tables",
  ],
  openGraph: {
    title: "940 Collector's Expo | North Texas Collectibles Show",
    description:
      "Buy, sell, and trade cards, Funko Pops, comics, LEGO, action figures, video games, anime figures, memorabilia & more.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${silkscreen.variable} scroll-smooth`}>
      <body className="min-h-screen text-[#E5E7EB] antialiased">
        {children}
      </body>
    </html>
  );
}
