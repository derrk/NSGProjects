import { z } from "zod";

// Checkout — customer contact + shipping address (everything a label needs) +
// the requested lines. The server re-prices and re-checks stock; never trust
// prices or availability coming from the client.
export const checkoutSchema = z.object({
  customerName: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().trim().optional().default(""),
  shipName: z.string().trim().min(1, "Recipient name is required"),
  shipStreet1: z.string().trim().min(1, "Street address is required"),
  shipStreet2: z.string().trim().optional().default(""),
  shipCity: z.string().trim().min(1, "City is required"),
  shipState: z.string().trim().min(1, "State is required"),
  shipZip: z.string().trim().min(3, "ZIP is required"),
  shipCountry: z.string().trim().default("US"),
  customerNote: z.string().trim().optional().default(""),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1, "Your cart is empty"),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

// Product — the shape the admin form produces AFTER dollars are converted to
// cents. Kept permissive on optional text fields; strict on money + counts.
export const PRODUCT_TYPES = [
  "RAW_CARD",
  "GRADED_SLAB",
  "SEALED",
  "APPAREL",
  "ART",
  "COLLECTIBLE",
] as const;

// One permissive schema for every product type — type-specific fields are all
// optional at the DB level, and the admin form only shows the ones that apply.
export const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  sku: z.string().trim().min(2, "SKU is required"),
  slug: z.string().trim().optional().default(""),
  productType: z.enum(PRODUCT_TYPES).default("COLLECTIBLE"),
  brand: z.string().trim().optional().default(""),
  categoryId: z.string().trim().optional().default(""),
  subcategory: z.string().trim().optional().default(""),
  description: z.string().trim().optional().default(""),
  tags: z.array(z.string()).default([]),
  costCents: z.number().int().nonnegative().default(0),
  priceCents: z.number().int().nonnegative(),
  compareAtCents: z.number().int().nonnegative().optional(),
  quantity: z.number().int().nonnegative().default(0),
  trackInventory: z.boolean().default(true),
  isUnique: z.boolean().default(false),
  lowStockAt: z.number().int().nonnegative().default(2),
  published: z.boolean().default(false),
  featured: z.boolean().default(false),
  weightOz: z.number().int().nonnegative().optional(),
  // Type-specific — all optional.
  game: z.string().trim().optional().default(""),
  setName: z.string().trim().optional().default(""),
  setCode: z.string().trim().optional().default(""),
  cardNumber: z.string().trim().optional().default(""),
  year: z.number().int().optional(),
  rarity: z.string().trim().optional().default(""),
  language: z.string().trim().optional().default(""),
  condition: z.string().trim().optional().default(""),
  gradingCompany: z.string().trim().optional().default(""),
  grade: z.string().trim().optional().default(""),
  certNumber: z.string().trim().optional().default(""),
  sealedType: z.string().trim().optional().default(""),
  releaseDate: z.string().trim().optional().default(""),
  size: z.string().trim().optional().default(""),
  color: z.string().trim().optional().default(""),
  // Original art + prints — Secret Stock carries these, ESU does not.
  medium: z.string().trim().optional().default(""),
  dimensions: z.string().trim().optional().default(""),
  artist: z.string().trim().optional().default(""),
  /** Collectr catalog id, for the inventory/price sync in a later phase. */
  collectrId: z.string().trim().optional().default(""),
  // Optional, not defaulted: an absent value must stay undefined so a CSV
  // re-import that mentions no images leaves existing photos untouched.
  images: z.array(z.string().url()).optional(),
});
export type ProductInput = z.infer<typeof productSchema>;

// ── Sell your collection ─────────────────────────────────────────────────────

// What the public form offers. Stored as free text in CollectionOffer.categories
// so adding a line here never needs a migration.
export const COLLECTION_CATEGORIES = [
  "Pokémon Singles",
  "Pokémon Sealed Products",
  "One Piece Singles",
  "One Piece Sealed Products",
  "Sports Cards",
  "Graded Slabs",
  "Vintage Cards",
  "Entire Collection",
  "Other",
] as const;

export const CONTACT_METHODS = ["email", "phone", "text"] as const;

// The seller's side of the form. Anyone on the internet can post this, so it is
// stricter than the admin schemas: lengths are capped so a bot can't write a
// novel into the database, and every field a seller might reasonably leave
// blank is optional. Only a name, an email and some idea of what they have.
export const collectionOfferSchema = z.object({
  name: z.string().trim().min(1, "Please tell us your name").max(120),
  email: z.string().trim().email("Enter a valid email").max(200),
  phone: z.string().trim().max(40).optional().default(""),
  preferredContact: z.enum(CONTACT_METHODS).default("email"),
  categories: z.array(z.string().trim().max(60)).max(20).default([]),
  description: z.string().trim().max(5000).optional().default(""),
  itemCountEstimate: z.string().trim().max(80).optional().default(""),
  askingPrice: z.string().trim().max(80).optional().default(""),
  // A link to photos they've already put somewhere (Drive, Imgur, a phone
  // album). Deliberately not an upload endpoint open to the public internet.
  photosUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .default("")
    .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), {
      message: "Paste a full link starting with http:// or https://",
    }),
});
export type CollectionOfferInput = z.infer<typeof collectionOfferSchema>;

// The shop's side. Free text in the database (see the model comment) but fixed
// here so the admin UI and any future reporting agree on the vocabulary.
export const OFFER_STATUSES = [
  "new",
  "contacted",
  "scheduled",
  "purchased",
  "declined",
] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

// Contact messages. Free text in the database for the same reason offer status
// is — adding a step needs no migration — but fixed here so the admin and any
// later reporting agree on the vocabulary.
export const MESSAGE_STATUSES = ["new", "replied", "archived"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];
