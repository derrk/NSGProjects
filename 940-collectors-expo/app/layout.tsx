import type { Metadata } from "next";
import { Inter, Silkscreen } from "next/font/google";
import "./globals.css";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, SEO_KEYWORDS } from "./lib/site";
import StructuredData from "./components/StructuredData";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const silkscreen = Silkscreen({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-pixel",
});

const TITLE = "940 Collector's Expo — Trading Cards, Pokémon, Funko & Collectibles Show | Wichita Falls, TX";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s | 940 Collector's Expo",
  },
  description: SITE_DESCRIPTION,
  keywords: SEO_KEYWORDS,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_US",
    images: [
      {
        url: "/hero-backdrop.jpg",
        width: 1260,
        height: 1260,
        alt: "940 Collector's Expo — North Texas collectibles show in Wichita Falls",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: SITE_DESCRIPTION,
    images: ["/hero-backdrop.jpg"],
  },
  category: "events",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${silkscreen.variable} scroll-smooth`}>
      <body className="min-h-screen text-[#E5E7EB] antialiased">
        <StructuredData />
        {children}
      </body>
    </html>
  );
}
