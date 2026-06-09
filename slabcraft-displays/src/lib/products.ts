export interface Product {
  id: string;
  name: string;
  price: number;
  priceLabel: string;
  description: string;
  longDescription: string;
  category: string;
  slug: string;
  image: string;
  finishes: string[];
  features: string[];
}

export const products: Product[] = [
  {
    id: "1",
    name: "Single Card Slab Stand",
    price: 24.99,
    priceLabel: "From $24.99",
    description: "A clean wooden stand made to display one graded card slab.",
    longDescription:
      "Showcase your prized graded card in style. This minimalist single slab stand is precision-crafted to hold one PSA, BGS, CGC, or SGC slab securely upright. The low-profile design keeps the focus entirely on your card while adding a warm, premium wood aesthetic to any shelf or desk.",
    category: "Slab Displays",
    slug: "single-card-slab-stand",
    image: "",
    finishes: ["Natural", "Dark Stain", "Walnut", "Black"],
    features: [
      "Fits all standard graded slabs (PSA, BGS, CGC, SGC)",
      "Non-slip felt bottom pads included",
      "Available in 4 wood finishes",
      "Optional name or card title engraving",
    ],
  },
  {
    id: "2",
    name: "Triple Slab Display",
    price: 49.99,
    priceLabel: "From $49.99",
    description:
      "A handcrafted display for showcasing three of your favorite graded cards.",
    longDescription:
      "Perfect for featuring your top three slabs together. The triple slab display keeps your collection organized and elegantly presented. Each slot is precisely routed to hold standard graded cases with a snug, secure fit. A great piece for showcasing a set, a favorite team, or your rarest pulls.",
    category: "Slab Displays",
    slug: "triple-slab-display",
    image: "",
    finishes: ["Natural", "Dark Stain", "Walnut", "Black"],
    features: [
      "Holds 3 standard graded slabs side-by-side",
      "Adjustable slot spacing available",
      "Optional divider engraving between slots",
      "Available in 4 wood finishes",
    ],
  },
  {
    id: "3",
    name: "Wall-Mounted Card Display",
    price: 79.99,
    priceLabel: "From $79.99",
    description:
      "A premium wall display for collectors who want their cards on full display.",
    longDescription:
      "Turn your wall into a gallery. This wall-mounted display is built for collectors who want to show off multiple slabs or raw cards in a clean, framed arrangement. Comes pre-drilled with keyhole mounts for easy hanging and a flush wall look. Perfect for game rooms, offices, or display spaces.",
    category: "Wall Displays",
    slug: "wall-mounted-card-display",
    image: "",
    finishes: ["Natural", "Dark Stain", "Walnut", "Black"],
    features: [
      "Holds up to 6 slabs in a 2x3 grid layout",
      "Keyhole mounts for easy wall installation",
      "Customizable grid size on request",
      "Optional acrylic cover available",
    ],
  },
  {
    id: "4",
    name: "Custom Logo Display",
    price: 99.99,
    priceLabel: "From $99.99",
    description:
      "Personalized wooden display featuring a logo, name, or custom engraving.",
    longDescription:
      "Make it yours. The custom logo display is fully personalized with your name, brand, team, or any logo of your choice laser-engraved directly into the wood. Ideal as a gift, a personal piece, or a branded showcase for content creators and shops. Each one is built to order and one of a kind.",
    category: "Custom",
    slug: "custom-logo-display",
    image: "",
    finishes: ["Natural", "Dark Stain", "Walnut", "Black"],
    features: [
      "Laser-engraved logo or name",
      "Custom size and card capacity",
      "Artwork review before production",
      "Ideal for gifts and content creators",
    ],
  },
  {
    id: "5",
    name: "Sports Card Showcase",
    price: 59.99,
    priceLabel: "From $59.99",
    description:
      "A display designed for graded sports cards, slabs, and memorabilia.",
    longDescription:
      "Built specifically with sports collectors in mind. The sports card showcase is designed to hold graded football, basketball, baseball, and hockey cards with a clean, trophy-like presentation. The slightly angled display base gives each card a natural viewing angle and makes any shelf look sharp.",
    category: "Sports Cards",
    slug: "sports-card-showcase",
    image: "",
    finishes: ["Natural", "Dark Stain", "Walnut", "Black"],
    features: [
      "Angled base for optimal viewing",
      "Holds 1–4 graded sports cards",
      "Compatible with PSA, BGS, and SGC slabs",
      "Optional team name or year engraving",
    ],
  },
  {
    id: "6",
    name: "TCG Collector Shelf",
    price: 89.99,
    priceLabel: "From $89.99",
    description:
      "A wider display shelf for Pokémon, One Piece, Magic, and other TCG collections.",
    longDescription:
      "Designed for the TCG collector. This wider shelf accommodates multiple raw cards, slabs, sealed packs, booster boxes, and figurines in one cohesive display. Features tiered rows so everything is visible at once. Perfect for Pokémon, Magic: The Gathering, One Piece, Dragon Ball, and Lorcana collectors.",
    category: "TCG",
    slug: "tcg-collector-shelf",
    image: "",
    finishes: ["Natural", "Dark Stain", "Walnut", "Black"],
    features: [
      "Multi-tier display with varied row depths",
      "Fits slabs, raw cards, and small collectibles",
      "Customizable number of tiers",
      "Optional Pokémon, MTG, or game logo engraving",
    ],
  },
];

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}
