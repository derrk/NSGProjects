import type { Metadata } from "next";
import LocalLanding from "../components/LocalLanding";
import FaqJsonLd from "../components/FaqJsonLd";
import { SITE_URL, type Faq } from "../lib/site";

const PATH = "/sports-cards-wichita-falls";

export const metadata: Metadata = {
  title: "Sports Cards in Wichita Falls — Buy, Sell & Trade",
  description:
    "Buy, sell, and trade sports cards in Wichita Falls, TX — baseball, football, basketball, vintage, rookies, autos, and PSA/BGS/SGC graded slabs — with dozens of vendors at the 940 Collector's Expo. Serving Iowa Park, Burkburnett, Bowie & Lawton, OK.",
  alternates: { canonical: PATH },
  openGraph: {
    title: "Sports Cards in Wichita Falls | 940 Collector's Expo",
    description: "Baseball, football, basketball, vintage, rookies, autos & graded slabs — buy, sell & trade.",
    url: `${SITE_URL}${PATH}`,
    images: ["/hero-backdrop.jpg"],
  },
};

const faqs: Faq[] = [
  {
    q: "Where can I buy sports cards in Wichita Falls?",
    a: "At the 940 Collector's Expo — a recurring show at the Delta Hotel by Marriott in Wichita Falls, TX, with multiple dealers selling baseball, football, basketball and more, from bargain boxes to graded slabs.",
  },
  {
    q: "Can I sell my sports card collection?",
    a: "Yes. Many vendors buy singles, sets, and entire collections on the spot — bring your cards and get offers from several buyers in one trip instead of shipping them off.",
  },
  {
    q: "Do vendors carry vintage and graded cards?",
    a: "Expect everything from vintage Topps and Bowman to modern Prizm and Optic, plus PSA, BGS and SGC graded rookies, autographs, and relic/patch cards, depending on the vendors at each show.",
  },
];

const narrative = [
  {
    heading: "Every sport, every era, one room",
    body: "From vintage Topps and Bowman to the newest Prizm, Select, and Optic, the 940 Collector's Expo puts dozens of sports-card dealers under one roof in Wichita Falls. Hunt rookies, autographs, numbered parallels, and patch cards across baseball, football, basketball, and beyond — no all-day drive to Dallas required.",
  },
  {
    heading: "Sell your collection or find your grail",
    body: "Bring the shoebox in the closet. Vendors actively buy singles, complete sets, and full collections, and you can compare offers from several buyers in one afternoon. It's the easiest way in the region to turn cards into cash — or finally land that PC card you've been chasing.",
  },
  {
    heading: "Graded slabs, wax, and breaks",
    body: "Look for PSA, BGS, and SGC graded cards, sealed wax and hobby boxes, and — at some shows — live group breaks. Whether you're a set builder, a condition-sensitive investor, or just love the hobby, there's a table for you.",
  },
];

const breadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: "Sports Cards in Wichita Falls", item: `${SITE_URL}${PATH}` },
  ],
};

export default function Page() {
  return (
    <>
      <FaqJsonLd faqs={faqs} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <LocalLanding
        eyebrow="Sports Cards · Wichita Falls, TX"
        h1="Sports Cards in Wichita Falls"
        lede="Baseball, football, basketball, and every era in between — the 940 Collector's Expo is the easiest place in North Texas to buy, sell, and trade sports cards, from bargain-bin commons to graded rookies and autos."
        find={["Baseball", "Football", "Basketball", "Vintage", "Rookies", "Autos & relics", "Graded slabs", "Wax & boxes"]}
        sections={[...narrative, ...faqs.map((f) => ({ heading: f.q, body: f.a }))]}
        nearby="An easy drive for collectors from Iowa Park, Burkburnett, Electra, Henrietta, Archer City, Holliday, Bowie, Nocona, Vernon, and Lawton & Duncan, Oklahoma."
      />
    </>
  );
}
