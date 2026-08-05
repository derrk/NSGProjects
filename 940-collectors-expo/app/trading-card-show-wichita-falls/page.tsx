import type { Metadata } from "next";
import LocalLanding from "../components/LocalLanding";
import FaqJsonLd from "../components/FaqJsonLd";
import { SITE_URL, type Faq } from "../lib/site";

const PATH = "/trading-card-show-wichita-falls";

export const metadata: Metadata = {
  title: "Trading Card Show in Wichita Falls, TX",
  description:
    "The 940 Collector's Expo is the trading card show in Wichita Falls, TX — Pokémon, sports cards, Magic, One Piece, Yu-Gi-Oh!, graded slabs and sealed product, plus dozens of vendors. Serving Iowa Park, Burkburnett, Bowie & Lawton, OK.",
  alternates: { canonical: PATH },
  openGraph: {
    title: "Trading Card Show in Wichita Falls | 940 Collector's Expo",
    description: "Pokémon, sports, Magic, One Piece, Yu-Gi-Oh!, slabs & sealed — the card show for North Texas.",
    url: `${SITE_URL}${PATH}`,
    images: ["/hero-backdrop.jpg"],
  },
};

const faqs: Faq[] = [
  {
    q: "When is the next trading card show near me?",
    a: "The 940 Collector's Expo is a recurring trading card and collectibles show in Wichita Falls, TX. Follow us or join the mailing list for the next date — it's centrally located for all of North Texas and Southern Oklahoma.",
  },
  {
    q: "What games and cards are sold?",
    a: "Pokémon, sports cards, Magic: The Gathering, One Piece, Yu-Gi-Oh!, and more — singles, sealed product, graded slabs, supplies, and vintage. Plus non-card collectibles like Funko, comics, and toys.",
  },
  {
    q: "How do I get a vendor table?",
    a: "Reserve online: pick your exact table on the interactive floor map and check out. Tables start at $99.99, with an early-bird discount for the first vendors.",
  },
];

const narrative = [
  {
    heading: "The card show North Texas has been waiting for",
    body: "The 940 Collector's Expo brings the whole trading card community together at the Delta Hotel by Marriott in Wichita Falls. Instead of driving hours to the metroplex, collectors get a room full of dealers close to home — Pokémon, sports, Magic, One Piece, Yu-Gi-Oh! and more, all in one place.",
  },
  {
    heading: "Buy, sell, trade, and hang out",
    body: "Shop singles and sealed, sell your extras to vendors who buy on the spot, trade out of your binder, and talk shop with people who love the hobby as much as you do. It's family friendly and welcoming to brand-new collectors and seasoned veterans alike.",
  },
  {
    heading: "Vendors: claim your spot",
    body: "Reserving a table is quick — choose your exact location on the live floor map, bundle a corner with an adjacent table for a discount, and check out. Hundreds of local collectors, affordable tables, and a room built for selling.",
  },
];

const breadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: "Trading Card Show in Wichita Falls", item: `${SITE_URL}${PATH}` },
  ],
};

export default function Page() {
  return (
    <>
      <FaqJsonLd faqs={faqs} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <LocalLanding
        eyebrow="Card Show · Wichita Falls, TX"
        h1="Trading Card Show in Wichita Falls"
        lede="Pokémon, sports cards, Magic, One Piece, Yu-Gi-Oh! and more — the 940 Collector's Expo is North Texas's trading card show, bringing dozens of vendors under one roof in Wichita Falls."
        find={["Pokémon", "Sports cards", "Magic", "One Piece", "Yu-Gi-Oh!", "Graded slabs", "Sealed product", "Supplies"]}
        sections={[...narrative, ...faqs.map((f) => ({ heading: f.q, body: f.a }))]}
        nearby="Drawing collectors and vendors from Iowa Park, Burkburnett, Electra, Henrietta, Archer City, Holliday, Bowie, Nocona, Vernon, and Lawton & Duncan, Oklahoma."
      />
    </>
  );
}
