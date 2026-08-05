import type { Metadata } from "next";
import LocalLanding from "../components/LocalLanding";
import FaqJsonLd from "../components/FaqJsonLd";
import { SITE_URL, type Faq } from "../lib/site";

const PATH = "/card-show-bowie-tx";

export const metadata: Metadata = {
  title: "Card Show Near Bowie, TX — Cards, Funko & Collectibles",
  description:
    "The nearest card & collectibles show to Bowie, Texas is the 940 Collector's Expo in Wichita Falls — a short drive up US-287. Buy, sell & trade Pokémon, sports cards, Funko, comics and more.",
  alternates: { canonical: PATH },
  openGraph: {
    title: "Card Show Near Bowie, TX | 940 Collector's Expo",
    description: "A short drive up US-287 — cards, Funko, comics & collectibles in Wichita Falls, TX.",
    url: `${SITE_URL}${PATH}`,
    images: ["/hero-backdrop.jpg"],
  },
};

const faqs: Faq[] = [
  {
    q: "Is there a card show near Bowie, Texas?",
    a: "Yes — the 940 Collector's Expo in Wichita Falls is the closest large card and collectibles show to Bowie, a straight shot up US-287, with dozens of vendors under one roof.",
  },
  {
    q: "What's sold at the show?",
    a: "Pokémon and sports cards, Magic, One Piece, Yu-Gi-Oh!, graded slabs and sealed product, plus Funko Pops, comics, LEGO, and toys.",
  },
  {
    q: "Can I get a vendor table?",
    a: "Yes — reserve your exact table online on the interactive floor map. Tables start at $99.99, with an early-bird discount for the first vendors.",
  },
];

const narrative = [
  {
    heading: "A quick drive up US-287",
    body: "Bowie and Montague County collectors are close to a real card show. The 940 Collector's Expo in Wichita Falls is a straightforward trip up US-287 — a full room of dealers, singles, slabs, and sealed instead of a long haul to Fort Worth.",
  },
  {
    heading: "The whole hobby in one room",
    body: "Pokémon and sports cards, Magic, One Piece, and Yu-Gi-Oh!, plus Funko Pops, comics, LEGO, and toys. Buy, sell, and trade with dozens of vendors — bring your binder and your want list.",
  },
  {
    heading: "Vendors from Bowie & Nocona welcome",
    body: "Set up close to home. Choose your table on the live floor map, bundle a corner for a discount, and put your inventory in front of collectors from across the 940 and Southern Oklahoma.",
  },
];

const breadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: "Card Show near Bowie, TX", item: `${SITE_URL}${PATH}` },
  ],
};

export default function Page() {
  return (
    <>
      <FaqJsonLd faqs={faqs} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <LocalLanding
        eyebrow="Card Show · Near Bowie, TX"
        h1="Card Show Near Bowie, Texas"
        lede="The closest card and collectibles show to Bowie is the 940 Collector's Expo in Wichita Falls — a short drive up US-287, with dozens of vendors for Pokémon, sports cards, Funko, comics, and more."
        find={["Pokémon", "Sports cards", "Magic", "Yu-Gi-Oh!", "Funko Pop", "Comics", "Graded slabs", "Sealed"]}
        sections={[...narrative, ...faqs.map((f) => ({ heading: f.q, body: f.a }))]}
        nearby="Serving Bowie, Nocona, Montague County, and Henrietta — plus Wichita Falls, Iowa Park, Burkburnett, and Vernon."
      />
    </>
  );
}
