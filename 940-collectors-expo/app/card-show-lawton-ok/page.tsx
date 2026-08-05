import type { Metadata } from "next";
import LocalLanding from "../components/LocalLanding";
import FaqJsonLd from "../components/FaqJsonLd";
import { SITE_URL, type Faq } from "../lib/site";

const PATH = "/card-show-lawton-ok";

export const metadata: Metadata = {
  title: "Card Show Near Lawton, OK — Cards, Funko & Collectibles",
  description:
    "The closest big card & collectibles show to Lawton, Oklahoma is the 940 Collector's Expo in Wichita Falls, TX — about an hour south. Buy, sell & trade Pokémon, sports cards, Funko, comics and more.",
  alternates: { canonical: PATH },
  openGraph: {
    title: "Card Show Near Lawton, OK | 940 Collector's Expo",
    description: "About an hour from Lawton & Fort Sill — cards, Funko, comics & collectibles in Wichita Falls, TX.",
    url: `${SITE_URL}${PATH}`,
    images: ["/hero-backdrop.jpg"],
  },
};

const faqs: Faq[] = [
  {
    q: "Is there a card show near Lawton, Oklahoma?",
    a: "The 940 Collector's Expo in Wichita Falls, TX is the nearest large card and collectibles show — roughly an hour south of Lawton and Fort Sill via I-44 / US-281, well worth the drive for the vendor selection.",
  },
  {
    q: "What can I buy, sell, or trade?",
    a: "Pokémon and sports cards, Magic, One Piece, Yu-Gi-Oh!, graded slabs, sealed product, plus Funko Pops, comics, LEGO, and toys — dozens of vendors in one room.",
  },
  {
    q: "Can Lawton vendors reserve a table?",
    a: "Absolutely. Reserve your exact table online on the interactive floor map — tables start at $99.99, with an early-bird discount for the first vendors.",
  },
];

const narrative = [
  {
    heading: "The closest big show to Lawton & Fort Sill",
    body: "Southern Oklahoma collectors don't have to drive to OKC for a real card show. The 940 Collector's Expo in Wichita Falls sits about an hour south of Lawton — an easy trip down I-44 for a room full of dealers, singles, slabs, and sealed product.",
  },
  {
    heading: "Cards, Funko, comics — the whole hobby",
    body: "It's a full collectibles event: Pokémon and sports cards, Magic, One Piece, and Yu-Gi-Oh!, plus Funko Pops, comics, LEGO, and toys. Buy, sell, and trade with dozens of vendors, then head back to Lawton with your haul.",
  },
  {
    heading: "Vending from Oklahoma? Grab a table",
    body: "Lawton and Duncan dealers are welcome. Pick your spot on the live floor map, bundle a corner table for a discount, and reach a fresh audience of North Texas and Southern Oklahoma collectors.",
  },
];

const breadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: "Card Show near Lawton, OK", item: `${SITE_URL}${PATH}` },
  ],
};

export default function Page() {
  return (
    <>
      <FaqJsonLd faqs={faqs} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <LocalLanding
        eyebrow="Card Show · Near Lawton, OK"
        h1="Card Show Near Lawton, Oklahoma"
        lede="The nearest big card and collectibles show to Lawton and Fort Sill is the 940 Collector's Expo in Wichita Falls, TX — about an hour south, and packed with vendors for Pokémon, sports cards, Funko, comics, and more."
        find={["Pokémon", "Sports cards", "Magic", "Yu-Gi-Oh!", "Funko Pop", "Comics", "Graded slabs", "Sealed"]}
        sections={[...narrative, ...faqs.map((f) => ({ heading: f.q, body: f.a }))]}
        nearby="Serving Lawton, Fort Sill, and Duncan, Oklahoma — plus Wichita Falls, Iowa Park, Burkburnett, and Vernon, Texas."
      />
    </>
  );
}
