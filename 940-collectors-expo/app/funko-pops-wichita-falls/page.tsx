import type { Metadata } from "next";
import LocalLanding from "../components/LocalLanding";
import FaqJsonLd from "../components/FaqJsonLd";
import { SITE_URL, type Faq } from "../lib/site";

const PATH = "/funko-pops-wichita-falls";

export const metadata: Metadata = {
  title: "Funko Pops in Wichita Falls — Exclusives, Grails & Vaulted",
  description:
    "Find Funko Pops in Wichita Falls, TX — exclusives, chases, vaulted grails, and commons — buy, sell, and trade with vendors at the 940 Collector's Expo. Serving Iowa Park, Burkburnett, Bowie & Lawton, OK.",
  alternates: { canonical: PATH },
  openGraph: {
    title: "Funko Pops in Wichita Falls | 940 Collector's Expo",
    description: "Exclusives, chases, vaulted grails & commons — buy, sell & trade at the collectibles show.",
    url: `${SITE_URL}${PATH}`,
    images: ["/hero-backdrop.jpg"],
  },
};

const faqs: Faq[] = [
  {
    q: "Where can I buy Funko Pops in Wichita Falls?",
    a: "At the 940 Collector's Expo — a recurring collectibles show at the Delta Hotel by Marriott in Wichita Falls, TX, with vendors carrying exclusives, chases, vaulted figures, and common Pops.",
  },
  {
    q: "Can I sell or trade my Funko collection?",
    a: "Yes. Vendors buy collections and grails, and Funko collectors trade on the floor all day — a great way to move duplicates and complete a set.",
  },
  {
    q: "Will there be vaulted and exclusive Pops?",
    a: "Expect convention and store exclusives, chase variants, and hard-to-find vaulted figures alongside affordable commons and protectors, depending on the vendors at each show.",
  },
];

const narrative = [
  {
    heading: "Grails, exclusives, and everyday Pops",
    body: "The 940 Collector's Expo brings Funko vendors to Wichita Falls with everything from $5 commons to vaulted grails and convention exclusives. Fill gaps in your collection, chase that elusive variant, and find deals you won't get paying resale online.",
  },
  {
    heading: "Buy, sell, and trade your collection",
    body: "Bring your doubles and your want list. Dealers buy collections and single grails, and Funko fans trade all over the room. It's the friendliest place in the region to level up your shelf.",
  },
  {
    heading: "A full fandom under one roof",
    body: "Because it's a complete collectibles show, you can grab protectors, browse anime figures, comics, and cards, and meet other collectors — all in one afternoon close to home.",
  },
];

const breadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: "Funko Pops in Wichita Falls", item: `${SITE_URL}${PATH}` },
  ],
};

export default function Page() {
  return (
    <>
      <FaqJsonLd faqs={faqs} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <LocalLanding
        eyebrow="Funko Pop · Wichita Falls, TX"
        h1="Funko Pops in Wichita Falls"
        lede="Exclusives, chases, vaulted grails, and everyday commons — the 940 Collector's Expo brings Funko vendors to Wichita Falls so you can buy, sell, and trade Pops close to home."
        find={["Vaulted", "Exclusives", "Chases", "Grails", "Common Pops", "Protectors", "Anime & more"]}
        sections={[...narrative, ...faqs.map((f) => ({ heading: f.q, body: f.a }))]}
        nearby="A short drive for collectors from Iowa Park, Burkburnett, Electra, Henrietta, Archer City, Holliday, Bowie, Nocona, Vernon, and Lawton & Duncan, Oklahoma."
      />
    </>
  );
}
