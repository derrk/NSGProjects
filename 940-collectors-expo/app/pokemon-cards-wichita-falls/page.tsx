import type { Metadata } from "next";
import LocalLanding from "../components/LocalLanding";
import FaqJsonLd from "../components/FaqJsonLd";
import { SITE_URL, type Faq } from "../lib/site";

const PATH = "/pokemon-cards-wichita-falls";

export const metadata: Metadata = {
  title: "Pokémon Cards in Wichita Falls — Buy, Sell & Trade",
  description:
    "Looking for Pokémon cards in Wichita Falls, TX? Buy, sell, and trade Pokémon TCG — singles, sealed, ETBs, booster boxes, and graded slabs — with dozens of vendors at the 940 Collector's Expo. Serving Iowa Park, Burkburnett, Bowie, Vernon and Lawton, OK.",
  alternates: { canonical: PATH },
  openGraph: {
    title: "Pokémon Cards in Wichita Falls | 940 Collector's Expo",
    description:
      "Buy, sell & trade Pokémon TCG — singles, sealed, graded slabs & vintage — at North Texas's collectibles show.",
    url: `${SITE_URL}${PATH}`,
    images: ["/hero-backdrop.jpg"],
  },
};

const pokemonFaqs: Faq[] = [
  {
    q: "Where can I buy Pokémon cards in Wichita Falls?",
    a: "At the 940 Collector's Expo — a recurring collectibles show at the Delta Hotel by Marriott in Wichita Falls, TX, with multiple Pokémon vendors selling singles, sealed product, and graded slabs all in one room.",
  },
  {
    q: "Can I sell or trade my Pokémon cards there?",
    a: "Yes. Many vendors buy singles and entire collections on the spot, and collectors trade on the floor all day — bring your binder and anything you want to move.",
  },
  {
    q: "Is there graded and sealed Pokémon product?",
    a: "Expect PSA and CGC graded slabs, sealed Elite Trainer Boxes and booster boxes, Japanese exclusives, and singles spanning modern sets to vintage WOTC-era chase cards, depending on the vendors at each show.",
  },
  {
    q: "When is the next Pokémon card show near me?",
    a: "Follow the 940 Collector's Expo for the next date. It's centrally located for collectors across North Texas and Southern Oklahoma, so it's a short drive from most of the region.",
  },
];

const narrative = [
  {
    heading: "The Pokémon card destination for the 940",
    body: "Whether you collect to play, to invest, or just love the artwork, the 940 Collector's Expo is the easiest place in the Wichita Falls area to find Pokémon cards. Instead of driving to Dallas or Oklahoma City, you can shop dozens of dealers in a single afternoon — tables stacked with everything from $1 bulk commons to graded vintage grails.",
  },
  {
    heading: "Buy, sell, and trade — all in one room",
    body: "Bring your binder. Vendors buy singles and full collections on the spot, trades happen all over the floor, and you can finally move those extras. It's the friendliest way to grow your collection and meet other Pokémon collectors in North Texas.",
  },
  {
    heading: "From the newest sets to vintage grails",
    body: "Look for the latest releases and Elite Trainer Boxes, sealed booster boxes, Japanese exclusives, PSA and CGC slabs, and vintage Base Set and WOTC-era cards. New collectors and seasoned investors alike will find something worth taking home.",
  },
];

const breadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: "Pokémon Cards in Wichita Falls", item: `${SITE_URL}${PATH}` },
  ],
};

export default function Page() {
  return (
    <>
      <FaqJsonLd faqs={pokemonFaqs} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <LocalLanding
        eyebrow="Pokémon TCG · Wichita Falls, TX"
        h1="Pokémon Cards in Wichita Falls"
        lede="Hunting for Pokémon cards in Wichita Falls? The 940 Collector's Expo brings dozens of vendors under one roof at the Delta Hotel by Marriott — the easiest place in North Texas to buy, sell, and trade Pokémon TCG, from bulk commons to graded vintage grails."
        find={[
          "Singles",
          "Sealed & ETBs",
          "Booster boxes",
          "Graded slabs",
          "Vintage / WOTC",
          "Japanese",
          "Promos",
          "Bulk lots",
        ]}
        sections={[...narrative, ...pokemonFaqs.map((f) => ({ heading: f.q, body: f.a }))]}
        nearby="Centrally located for the whole region — an easy drive for Pokémon collectors from Iowa Park, Burkburnett, Electra, Henrietta, Archer City, Holliday, Bowie, Nocona, Vernon, and Lawton & Duncan, Oklahoma."
      />
    </>
  );
}
