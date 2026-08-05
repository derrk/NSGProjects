// Central SEO / site config. Safe to import from server or client (no secrets).

// Production URL — set NEXT_PUBLIC_SITE_URL in Vercel to your real domain.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://940collectorsexpo.com"
).replace(/\/$/, "");

export const SITE_NAME = "940 Collector's Expo";

export const VENUE = {
  name: "Delta Hotel by Marriott",
  room: "Shawnee Room",
  city: "Wichita Falls",
  region: "TX",
  country: "US",
  // Fill the street address once confirmed (improves local SEO / map accuracy):
  streetAddress: "",
  postalCode: "",
};

// Event date in ISO (e.g. "2026-03-14T10:00:00-05:00"). Leave "" until set —
// when present it unlocks Event rich-results structured data.
export const EVENT_DATE_ISO = "";

// Cities/areas we serve — used in copy + structured-data areaServed for local SEO.
export const CITIES = [
  "Wichita Falls",
  "Iowa Park",
  "Burkburnett",
  "Electra",
  "Henrietta",
  "Archer City",
  "Holliday",
  "Bowie",
  "Nocona",
  "Vernon",
  "Graham",
  "Decatur",
  "Sheppard AFB",
  "Lawton, OK",
  "Duncan, OK",
];

// Broad-intent search terms we want to be relevant for.
export const SEO_KEYWORDS = [
  "940 Collectors Expo",
  "card show Wichita Falls",
  "trading card show near me",
  "collectibles show Wichita Falls",
  "Pokemon card show near me",
  "sports card show Texas",
  "comic con Wichita Falls",
  "Funko Pop show",
  "trading cards near me",
  "Pokemon near me",
  "card show North Texas",
  "collector convention Texoma",
  "Iowa Park card show",
  "Burkburnett collectibles",
  "Lawton card show",
  "Bowie TX collectibles",
  "anime figures",
  "LEGO show",
  "vendor tables card show",
];

export const SITE_DESCRIPTION =
  "The 940 Collector's Expo is North Texas & Texoma's premier collectibles show in Wichita Falls, TX — serving Iowa Park, Burkburnett, Bowie, Lawton and surrounding areas. Buy, sell & trade trading cards, Pokémon, sports cards, Funko Pops, comics, LEGO, action figures, video games, anime figures & memorabilia.";

// Local SEO landing pages (each is a real, unique-content page in app/<slug>/page.tsx).
// Listed here so the sitemap and footer links stay in sync.
export const LOCAL_PAGES: { slug: string; label: string }[] = [
  { slug: "pokemon-cards-wichita-falls", label: "Pokémon Cards in Wichita Falls" },
  { slug: "sports-cards-wichita-falls", label: "Sports Cards in Wichita Falls" },
  { slug: "trading-card-show-wichita-falls", label: "Trading Card Show in Wichita Falls" },
  { slug: "comic-books-wichita-falls", label: "Comic Books in Wichita Falls" },
  { slug: "funko-pops-wichita-falls", label: "Funko Pops in Wichita Falls" },
  { slug: "card-show-lawton-ok", label: "Card Show near Lawton, OK" },
  { slug: "card-show-bowie-tx", label: "Card Show near Bowie, TX" },
];

export interface Faq {
  q: string;
  a: string;
}

export const FAQS: Faq[] = [
  {
    q: "What kinds of collectibles are welcome?",
    a: "All of them. The 940 Collector's Expo is a full collectibles event — trading cards (sports, Pokémon, Magic, One Piece, Yu-Gi-Oh!), Funko Pops, comics, LEGO, action figures, video games, anime figures, memorabilia, and pretty much anything else worth collecting.",
  },
  {
    q: "Where is the 940 Collector's Expo held?",
    a: "The show is in Wichita Falls, Texas at the Delta Hotel by Marriott (Shawnee Room), easy to reach from Iowa Park, Burkburnett, Electra, Henrietta, Bowie, Nocona, Vernon, and Lawton, Oklahoma.",
  },
  {
    q: "Can I trade or sell as an attendee?",
    a: "Trading with other collectors on the floor is always welcome. If you want to sell as a vendor, just reserve a table — easy to do right here through the table map and reservation page.",
  },
  {
    q: "Can vendors reserve multiple tables?",
    a: "Yes! Vendors can reserve multiple tables right on the interactive floor map. Bundle a 6-foot corner table with its adjacent 8-foot table for a discount.",
  },
  {
    q: "Are kids allowed?",
    a: "Absolutely — the 940 Collector's Expo is completely family friendly. Kids are welcome and admission will be affordable for families. We encourage young collectors to come and discover the hobby.",
  },
  {
    q: "Is parking free?",
    a: "Yes. Free parking is available for all attendees and vendors at the event venue. Vendor load-in areas will be designated to make setup easy.",
  },
  {
    q: "How do I become a vendor?",
    a: "Head to the reservation page, pick your table(s) on the floor map, and check out. Tables start at $99.99, with an early-bird discount code available for the first vendors.",
  },
];
