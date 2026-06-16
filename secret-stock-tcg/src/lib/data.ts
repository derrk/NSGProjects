import { Product } from './types';

// ─── IMAGE FILENAME GUIDE ────────────────────────────────────────────────────
// Save your product photos to: /public/images/
// Use the exact filenames listed next to each product below.
// ─────────────────────────────────────────────────────────────────────────────

export const products: Product[] = [

  // ── SEALED PRODUCTS ────────────────────────────────────────────────────────

  {
    id: 'seal-151-etb-snorlax',
    name: 'Pokémon 151 Elite Trainer Box — Snorlax',
    category: 'sealed-products',
    type: 'sealed-product',
    productType: 'ETB',
    releaseDate: '2023-10-06',
    price: 0,
    quantity: 1,
    image: '/images/etb-151-snorlax.jpg',         // ← save as: etb-151-snorlax.jpg
    featured: true,
    description:
      'Factory sealed Pokémon 151 Elite Trainer Box featuring Snorlax. ' +
      'Displayed in a premium acrylic case. One of the most popular ETBs from the Scarlet & Violet era.',
  },
  {
    id: 'seal-pokemon-day-2026',
    name: '2026 Pokémon Day Box — 30th Anniversary',
    category: 'sealed-products',
    type: 'sealed-product',
    productType: 'Promo Box',
    releaseDate: '2026-02-27',
    price: 0,
    quantity: 1,
    image: '/images/pokemon-day-2026-box.jpg',    // ← save as: pokemon-day-2026-box.jpg
    featured: true,
    description:
      'Limited 2026 Pokémon Day 30th Anniversary box. Includes exclusive Pikachu promo card, ' +
      'commemorative coin, and 3 Mega Evolution: Phantasmal Flames booster packs.',
  },
  {
    id: 'seal-evolving-skies-etb',
    name: 'Evolving Skies Elite Trainer Box',
    category: 'sealed-products',
    type: 'sealed-product',
    productType: 'ETB',
    releaseDate: '2021-08-27',
    price: 0,
    quantity: 1,
    image: '/images/etb-evolving-skies.jpg',      // ← save as: etb-evolving-skies.jpg
    featured: true,
    description:
      'Sealed Pokémon Sword & Shield — Evolving Skies Elite Trainer Box featuring Sylveon, ' +
      'Espeon, Glaceon, and Vaporeon. One of the most sought-after ETBs from the Sword & Shield era. ' +
      'Stored in a premium acrylic display case.',
  },

  // ── GRADED SLABS ───────────────────────────────────────────────────────────

  {
    id: 'slab-cj-stroud-sgc9',
    name: 'C.J. Stroud — 2023 Panini National VIP Gold Prizm RC',
    category: 'sports-cards',
    type: 'graded-slab',
    set: '2023 Panini The National VIP',
    grade: '9',
    certNumber: '2156473',
    gradingCompany: 'SGC',
    price: 0,
    quantity: 1,
    image: '/images/slab-cj-stroud-sgc9.jpg',    // ← save as: slab-cj-stroud-sgc9.jpg
    featured: true,
    description:
      'SGC MT 9 — C.J. Stroud RC2 Material Gold Prizm numbered 3/10. ' +
      'One of only 3 copies in existence with a game-worn jersey patch window. ' +
      'One of the most exclusive Stroud rookie cards available.',
  },
  {
    id: 'slab-op-ace-psa10',
    name: 'Portgas D. Ace — OP13-119 Manga Alt Art PSA 10',
    category: 'one-piece',
    type: 'graded-slab',
    set: '2025 One Piece OP13 EN',
    grade: '10',
    certNumber: '150161355',
    gradingCompany: 'PSA',
    price: 0,
    quantity: 1,
    image: '/images/slab-op-ace-psa10.jpg',       // ← save as: slab-op-ace-psa10.jpg
    featured: true,
    description:
      'PSA GEM MT 10 — Portgas D. Ace Manga Alternate Art from One Piece OP13 (English). ' +
      'Card #119, Whitebeard Pirates. Stunning manga-panel art with holographic finish. ' +
      'Perfect grade on one of the most iconic One Piece cards.',
  },

  // ── ONE PIECE RAW SINGLES ──────────────────────────────────────────────────

  {
    id: 'op-ace-raw-op13',
    name: 'Portgas D. Ace — OP13 Character Card (Raw)',
    category: 'one-piece',
    type: 'raw-single',
    set: 'One Piece OP13',
    cardNumber: 'OP13',
    condition: 'Near Mint',
    language: 'English',
    price: 0,
    quantity: 1,
    image: '/images/op-ace-raw-op13.jpg',         // ← save as: op-ace-raw-op13.jpg
    featured: true,
    description:
      'Portgas D. Ace character card from One Piece OP13. 6000 power, Counter +1000, ' +
      'Whitebeard Pirates. On Play / On KO ability to search for Luffy or Whitebeard Pirates. ' +
      'Raw Near Mint copy in a toploader.',
  },

  // ── ORIGINAL ARTWORK ───────────────────────────────────────────────────────

  {
    id: 'art-mew-mewtwo',
    name: 'Mew & Mewtwo — Original Canvas Painting',
    category: 'art',
    type: 'artwork',
    medium: 'Original Canvas',
    price: 75,
    quantity: 1,
    image: '/images/art-mew-mewtwo.jpg',          // ← save as: art-mew-mewtwo.jpg
    featured: true,
    description:
      'Original hand-painted canvas featuring Mew and Mewtwo in a swirling cosmic energy background. ' +
      'Striking pink and purple tones on black. A collector piece for any Pokémon fan.',
  },
  {
    id: 'art-charizard',
    name: 'Charizard — Original Canvas Painting',
    category: 'art',
    type: 'artwork',
    medium: 'Original Canvas',
    price: 45,
    quantity: 1,
    image: '/images/art-charizard.jpg',           // ← save as: art-charizard.jpg
    featured: true,
    description:
      'Original hand-painted canvas of Charizard in a dramatic close-up roaring pose. ' +
      'Warm orange, red, and yellow tones with bold line work.',
  },
  {
    id: 'art-pancham',
    name: 'Pancham — Original Canvas Painting',
    category: 'art',
    type: 'artwork',
    medium: 'Original Canvas',
    price: 35,
    quantity: 1,
    image: '/images/art-pancham.jpg',             // ← save as: art-pancham.jpg
    featured: false,
    description:
      'Original hand-painted canvas of Pancham in a bamboo forest. ' +
      'Cool tones with detailed bamboo background and the classic Pancham leaf pose.',
  },
  {
    id: 'art-charmander',
    name: 'Charmander — Original Canvas Painting',
    category: 'art',
    type: 'artwork',
    medium: 'Original Canvas',
    price: 25,
    quantity: 1,
    image: '/images/art-charmander.jpg',          // ← save as: art-charmander.jpg
    featured: false,
    description:
      'Original hand-painted canvas of Charmander surrounded by fire and flame. ' +
      'Bold red and orange color palette. A great entry-level piece for any Pokémon art collection.',
  },

  // ── APPAREL ────────────────────────────────────────────────────────────────

  {
    id: 'shirt-embroidered-tees',
    name: 'Pokémon Embroidered T-Shirts — Multiple Designs',
    category: 'apparel',
    type: 'apparel-item',
    apparelType: 'T-Shirt',
    sizes: ['S', 'M', 'L'],
    color: 'Blue / Gray / Yellow',
    design: 'Embroidered Pokémon chest logo',
    price: 0,
    quantity: 3,
    image: '/images/shirts-embroidered-group.jpg', // ← save as: shirts-embroidered-group.jpg
    featured: true,
    description:
      'Comfort Colors heavyweight tees with embroidered Pokémon chest designs. ' +
      'Available in blue, gray, and yellow/mustard colorways with different Pokémon embroidery on each. ' +
      'Contact us for available designs, sizes, and pricing.',
  },
  {
    id: 'shirt-gengar-black',
    name: 'Gengar Embroidered T-Shirt — Black',
    category: 'apparel',
    type: 'apparel-item',
    apparelType: 'T-Shirt',
    sizes: ['S'],
    color: 'Black',
    design: 'Gengar chest embroidery — purple outline, red eyes',
    price: 0,
    quantity: 1,
    image: '/images/shirt-gengar-black.jpg',      // ← save as: shirt-gengar-black.jpg
    featured: true,
    description:
      'Black heavyweight tee with embroidered Gengar chest design. ' +
      'Purple outline with red eyes — subtle and clean. Perfect for Gengar fans.',
  },
];

// ── CATEGORIES ────────────────────────────────────────────────────────────────

export const categories = [
  {
    id: 'pokemon',
    name: 'Pokémon',
    description: 'Singles, sealed products, slabs, and collectibles.',
    icon: '⚡',
    color: 'from-yellow-600 to-yellow-800',
  },
  {
    id: 'one-piece',
    name: 'One Piece',
    description: 'Raw singles, graded slabs, and sealed products.',
    icon: '⚓',
    color: 'from-red-700 to-red-900',
  },
  {
    id: 'sports-cards',
    name: 'Sports Cards',
    description: 'Rookie cards, graded slabs, patches, and autos.',
    icon: '🏆',
    color: 'from-blue-700 to-blue-900',
  },
  {
    id: 'sealed-products',
    name: 'Sealed Products',
    description: 'Booster boxes, ETBs, and sealed collectibles.',
    icon: '📦',
    color: 'from-green-700 to-green-900',
  },
  {
    id: 'art',
    name: 'Original Art',
    description: 'Hand-painted Pokémon canvas art by local artists.',
    icon: '🎨',
    color: 'from-pink-700 to-pink-900',
  },
  {
    id: 'apparel',
    name: 'Apparel',
    description: 'Embroidered Pokémon tees and collector merch.',
    icon: '👕',
    color: 'from-indigo-700 to-indigo-900',
  },
  {
    id: 'collections-wanted',
    name: 'Collections Wanted',
    description: 'Sell your collection — we buy singles, slabs, and bulk.',
    icon: '💰',
    color: 'from-amber-700 to-amber-900',
  },
];

// ── EVENTS ────────────────────────────────────────────────────────────────────
// Hidden in inventory-showcase version — preserved for future use

export const events = [
  {
    id: 'e1',
    name: 'Collect-A-Con Dallas',
    date: '2026-07-12',
    location: 'Kay Bailey Hutchison Convention Center',
    city: 'Dallas, TX',
    time: '9:00 AM - 6:00 PM',
    boothInfo: 'Booth #247 - Hall B',
    description:
      'One of the largest trading card conventions in Texas. Find us at Booth #247 in Hall B with our full inventory.',
    type: 'card-show' as const,
  },
  {
    id: 'e2',
    name: 'Wichita Falls Card Show',
    date: '2026-06-28',
    location: 'MPEC - Multipurpose Events Center',
    city: 'Wichita Falls, TX',
    time: '10:00 AM - 4:00 PM',
    boothInfo: 'Main Floor - Table 12',
    description:
      'Local card show right here in Wichita Falls. Shop Pokémon, sports cards, One Piece, and more.',
    type: 'local-event' as const,
  },
  {
    id: 'e3',
    name: 'Regional Pokémon League Cup',
    date: '2026-07-19',
    location: "Sike's Senter Mall",
    city: 'Wichita Falls, TX',
    time: '11:00 AM - 5:00 PM',
    boothInfo: 'Vendor Area - Table 3',
    description:
      "Official Pokémon League Cup event. We'll be vending with singles, sealed products, and accessories.",
    type: 'league-cup' as const,
  },
  {
    id: 'e4',
    name: 'North Texas Sports Card Expo',
    date: '2026-08-02',
    location: 'Lone Star Park',
    city: 'Grand Prairie, TX',
    time: '9:00 AM - 5:00 PM',
    boothInfo: 'Booth #88',
    description:
      'Major sports card expo featuring dealers from across Texas and Oklahoma.',
    type: 'expo' as const,
  },
];
