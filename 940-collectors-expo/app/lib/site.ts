// Central SEO / site config. Safe to import from server or client (no secrets).

// Production URL — MUST match the host the site actually serves on so that the
// sitemap, canonical tags, and OpenGraph URLs don't point at a redirecting host
// (the apex 940collectorsexpo.com 308-redirects to www). Default is www; a
// NEXT_PUBLIC_SITE_URL env var (if set in Vercel) overrides — keep it on www too.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.940collectorsexpo.com"
).replace(/\/$/, "");

export const SITE_NAME = "940 Collector's Expo";

// Vendor tables are SOLD OUT — reservations are closed. When false, the /reserve
// page shows a sold-out notice and does NOT mount the interactive map or its
// polling (which is what drives DB egress). Online ticket sales are unaffected.
// Flip back to true to reopen booking.
export const RESERVATIONS_OPEN = false;

export const VENUE = {
  name: "Delta Hotel by Marriott",
  room: "Shawnee Room",
  city: "Wichita Falls",
  region: "TX",
  country: "US",
  streetAddress: "306 Travis St",
  postalCode: "76301",
};

// Full one-line address + Google Maps links (the embed needs no API key).
export const VENUE_ADDRESS = "306 Travis St, Wichita Falls, TX 76301";
const MAP_Q = encodeURIComponent(`${VENUE.name}, ${VENUE_ADDRESS}`);
export const MAP_EMBED_SRC = `https://www.google.com/maps?q=${MAP_Q}&output=embed`;
export const MAP_LINK = `https://www.google.com/maps/search/?api=1&query=${MAP_Q}`;

// --- Debut event (Vol. 1) --------------------------------------------------
// Wichita Falls is US Central (CDT in September = -05:00).
export const EVENT_DATE_ISO = "2026-09-05T09:00:00-05:00"; // set -> unlocks Event rich results
export const EVENT_END_ISO = "2026-09-05T18:00:00-05:00";
export const EVENT_DATE_LABEL = "September 5, 2026";
export const EVENT_DATE_SHORT = "Sept 5, 2026";
export const EVENT_HOURS_LABEL = "10 AM – 6 PM";
export const EVENT_VIP_LABEL = "VIP early access at 9 AM";
export const VENDOR_SETUP_LABEL = "7:30 AM – 10 AM";

// Admission (VIP online ticketing not live yet).
export const ADMISSION = {
  doorPrice: "5", // numeric string for structured-data offer
  doorLabel: "$5 at the door",
  vipLabel: "$10 VIP — early 9 AM entry",
  kidsLabel: "Kids under 12 free",
};

// Public "contact us" address shown on the site.
export const CONTACT_EMAIL = "hello@xeniilvrie.resend.app";

// Online attendee tickets. Prices in cents; the SERVER recomputes totals from
// this same config (never trusts client amounts). Giveaway entries are counted.
export const TICKETS = {
  vip: {
    key: "vip" as const,
    label: "VIP Ticket",
    priceCents: 1000,
    entries: 2,
    admission: "Early entry at 9:00 AM",
    blurb: "Get in an hour early at 9 AM + 2 giveaway entries.",
  },
  general: {
    key: "general" as const,
    label: "General Admission",
    priceCents: 500,
    entries: 1,
    admission: "Doors at 10:00 AM",
    blurb: "Doors at 10 AM + 1 giveaway entry.",
  },
  extra: {
    key: "extra" as const,
    label: "Extra giveaway entry",
    priceCents: 500,
    entries: 1,
    admission: "",
    blurb: "Add extra entries to the giveaways ($5 each = 1 entry).",
  },
};

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
    q: "When is the 940 Collector's Expo?",
    a: "Our debut show is Saturday, September 5, 2026. General admission runs 10 AM to 6 PM, with VIP early access starting at 9 AM.",
  },
  {
    q: "How much is admission?",
    a: "General admission is just $5 at the door. Kids under 12 get in free. A $10 VIP online ticket (coming soon) gets you early access at 9 AM, an hour before general admission.",
  },
  {
    q: "What kinds of collectibles are welcome?",
    a: "All of them. The 940 Collector's Expo is a full collectibles event — trading cards (sports, Pokémon, Magic, One Piece, Yu-Gi-Oh!), Funko Pops, comics, LEGO, action figures, video games, anime figures, memorabilia, and pretty much anything else worth collecting.",
  },
  {
    q: "Where is the 940 Collector's Expo held?",
    a: "The show is at the Delta Hotel by Marriott (Shawnee Room), 306 Travis St, Wichita Falls, TX 76301 — easy to reach from Iowa Park, Burkburnett, Electra, Henrietta, Bowie, Nocona, Vernon, and Lawton, Oklahoma.",
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
