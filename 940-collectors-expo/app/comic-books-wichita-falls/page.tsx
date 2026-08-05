import type { Metadata } from "next";
import LocalLanding from "../components/LocalLanding";
import FaqJsonLd from "../components/FaqJsonLd";
import { SITE_URL, type Faq } from "../lib/site";

const PATH = "/comic-books-wichita-falls";

export const metadata: Metadata = {
  title: "Comic Books in Wichita Falls — Back Issues, Keys & Graded",
  description:
    "Buy, sell, and trade comic books in Wichita Falls, TX — back issues, key issues, CGC/CBCS graded, Silver & Bronze Age, modern variants and manga — at the 940 Collector's Expo. Serving Iowa Park, Burkburnett, Bowie & Lawton, OK.",
  alternates: { canonical: PATH },
  openGraph: {
    title: "Comic Books in Wichita Falls | 940 Collector's Expo",
    description: "Back issues, keys, graded slabs, variants & manga — buy, sell & trade at the collectibles show.",
    url: `${SITE_URL}${PATH}`,
    images: ["/hero-backdrop.jpg"],
  },
};

const faqs: Faq[] = [
  {
    q: "Where can I find comic books in Wichita Falls?",
    a: "At the 940 Collector's Expo — a recurring collectibles show at the Delta Hotel by Marriott in Wichita Falls, TX, with vendors selling back-issue bins, key issues, graded slabs, and modern comics.",
  },
  {
    q: "Can I sell or trade my comics?",
    a: "Yes. Dealers buy collections and key issues, and collectors trade throughout the day. Bring your long boxes and your want list.",
  },
  {
    q: "Are there graded comics and keys?",
    a: "Expect CGC and CBCS graded books, first appearances and other key issues, Silver and Bronze Age back issues, modern variants, and manga, depending on the vendors at each show.",
  },
];

const narrative = [
  {
    heading: "Back-issue bins to blue-chip keys",
    body: "The 940 Collector's Expo gives Wichita Falls comic fans a room full of long boxes to dig through — Silver, Bronze, Copper, and Modern Age, plus the first appearances and key issues collectors chase. It's a comic-con-style hunt without the trip to the big city.",
  },
  {
    heading: "Sell, trade, and complete your run",
    body: "Bring your want list and your extras. Vendors buy collections and individual keys, and trades happen all over the floor. Whether you're finishing a run or hunting a grail, you'll find friendly dealers ready to deal.",
  },
  {
    heading: "Graded slabs and more than comics",
    body: "Look for CGC and CBCS graded books alongside variants, trade paperbacks, and manga — and since it's a full collectibles show, you can browse Funko, toys, and cards at the same tables.",
  },
];

const breadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: "Comic Books in Wichita Falls", item: `${SITE_URL}${PATH}` },
  ],
};

export default function Page() {
  return (
    <>
      <FaqJsonLd faqs={faqs} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <LocalLanding
        eyebrow="Comics · Wichita Falls, TX"
        h1="Comic Books in Wichita Falls"
        lede="Dig through back-issue bins, hunt key issues, and grab graded slabs — the 940 Collector's Expo brings comic vendors to Wichita Falls so you can buy, sell, and trade without the drive to a big-city con."
        find={["Back issues", "Key issues", "Graded (CGC/CBCS)", "Silver & Bronze Age", "Modern", "Variants", "Manga", "Trade paperbacks"]}
        sections={[...narrative, ...faqs.map((f) => ({ heading: f.q, body: f.a }))]}
        nearby="Welcoming comic collectors from Iowa Park, Burkburnett, Electra, Henrietta, Archer City, Holliday, Bowie, Nocona, Vernon, and Lawton & Duncan, Oklahoma."
      />
    </>
  );
}
