// 940 Collector Expo — vendor table layout, pricing config, and pricing engine.
// Layout + adjacency are authoritative spec data (do NOT infer from coordinates).
// Coordinates are percentages of the 1098 x 1092 floor-plan reference, so the
// map stays responsive.

export type TableType = "standard" | "endcap";
export type TableStatus = "available" | "selected" | "held" | "reserved" | "blocked";

// A reservation is "pending" once submitted (held awaiting Zelle payment) and
// "confirmed" once the organizer verifies payment and locks in the table(s).
export type ReservationStatus = "pending" | "confirmed";

// A vendor's public profile, captured at checkout and shown on the map.
export interface VendorProfile {
  resId: string; // groups all tables in one reservation
  status: ReservationStatus;
  business: string;
  instagram?: string; // optional
  bio?: string; // short description for vendor highlights
  email: string; // confirmation + future updates
  photo?: string; // downscaled data URL shown on the map in place of the number
  firstName?: string;
  lastName?: string;
  phone?: string;
  category?: string;
  amountCents?: number; // amount owed via Zelle for this reservation
}

export interface TableDef {
  id: number;
  zone: string;
  x: number; // % of canvas width
  y: number; // % of canvas height
  w: number;
  h: number;
  orientation: "horizontal" | "vertical";
  lengthFt: number;
  depthFt: number;
  tableType: TableType;
  bundleEligible: boolean;
  adjacentTableIds: number[];
}

export const CANVAS = { w: 1098, h: 1092 };

// ---------------------------------------------------------------------------
// Admin-configurable event settings (edit here until an admin UI/DB exists).
// ---------------------------------------------------------------------------
export const EVENT = {
  name: "940 Collector Expo",
  venueName: "Shawnee Room",
  roomFt: { w: 90, h: 42 },
  standardPriceCents: 9999, // $99.99 per 8' table (intro price)
  endcapPriceCents: 9999, // $99.99 per 6' end-cap table
  bundle: {
    enabled: true,
    type: "fixed" as "fixed" | "percent",
    value: 1000, // $10 off when a 6' corner is bundled with its adjacent 8' table
  },
  holdMinutes: 10,
  maxTablesPerReservation: 0, // 0 = no limit
  // Payment: online processor not live yet — collect via Zelle, hold the table,
  // organizer confirms once payment lands. EDIT these with the real Zelle details.
  zelle: {
    name: "Dustin Maberry",
    phone: "(940) 704-9931",
  },
};

export interface PromoCode {
  code: string;
  // fixed = $ off order · percent = % off order · table_price = sets each table's price
  type: "fixed" | "percent" | "table_price";
  value: number; // cents (fixed / table_price) or whole percent (percent)
  label: string;
  maxUses?: number; // total redemptions allowed (enforced server-side)
}

// Discount codes (admin-editable). Add real codes here.
export const PROMO_CODES: PromoCode[] = [
  {
    code: "9FORTY25",
    type: "table_price",
    value: 8500, // every table becomes $85.00
    label: "Early bird — $85 per table",
    maxUses: 25,
  },
];

// Organizer HQ tables — reserved for the founders (vending, info, tickets,
// central speaker). Never bookable by the public.
export const FOUNDER_TABLES = [31, 32, 33, 34];

// Optional demo seeds (only used in the localStorage fallback, not with Supabase).
export const SEED_RESERVED: number[] = [];
export const SEED_BLOCKED: number[] = [];

export const ENDCAP_IDS = [41, 50, 59, 68, 77, 86, 95, 104];

// ---------------------------------------------------------------------------
// Authoritative table layout (spec source of truth).
// ---------------------------------------------------------------------------
export const TABLE_LAYOUT: TableDef[] = [
  { id: 1, zone: "Top Wall", x: 17.8506, y: 7.0513, w: 7.6503, h: 1.7399, orientation: "horizontal", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 2, zone: "Top Wall", x: 25.7741, y: 7.0513, w: 7.6503, h: 1.7399, orientation: "horizontal", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 3, zone: "Top Wall", x: 33.6976, y: 7.0513, w: 7.6503, h: 1.7399, orientation: "horizontal", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 4, zone: "Top Wall", x: 41.6211, y: 7.0513, w: 7.6503, h: 1.7399, orientation: "horizontal", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 5, zone: "Top Wall", x: 51.4572, y: 7.0513, w: 7.6503, h: 1.7399, orientation: "horizontal", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 6, zone: "Top Wall", x: 59.3807, y: 7.0513, w: 7.6503, h: 1.7399, orientation: "horizontal", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 7, zone: "Top Wall", x: 67.3042, y: 7.0513, w: 7.6503, h: 1.7399, orientation: "horizontal", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 8, zone: "Top Wall", x: 75.2277, y: 7.0513, w: 7.6503, h: 1.7399, orientation: "horizontal", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 9, zone: "Left Wall", x: 11.9308, y: 6.044, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 10, zone: "Left Wall", x: 11.9308, y: 14.011, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 11, zone: "Left Wall", x: 11.9308, y: 21.978, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 12, zone: "Left Wall", x: 11.9308, y: 29.9451, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 13, zone: "Left Wall", x: 11.9308, y: 37.9121, w: 1.7304, h: 7.6007, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 14, zone: "Left Wall", x: 11.9308, y: 48.8095, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 15, zone: "Left Wall", x: 11.9308, y: 56.7766, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 16, zone: "Left Wall", x: 11.9308, y: 64.7436, w: 1.7304, h: 7.6007, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 17, zone: "Left Wall", x: 11.9308, y: 72.619, w: 1.7304, h: 7.7839, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 18, zone: "Left Wall", x: 11.9308, y: 80.5861, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 19, zone: "Right Wall", x: 87.0674, y: 6.044, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 20, zone: "Right Wall", x: 87.0674, y: 14.011, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 21, zone: "Right Wall", x: 87.0674, y: 21.978, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 22, zone: "Right Wall", x: 87.0674, y: 29.9451, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 23, zone: "Right Wall", x: 87.0674, y: 37.9121, w: 1.7304, h: 7.6007, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 24, zone: "Right Wall", x: 87.0674, y: 48.8095, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 25, zone: "Right Wall", x: 87.0674, y: 56.7766, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 26, zone: "Right Wall", x: 87.0674, y: 64.7436, w: 1.7304, h: 7.6007, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 27, zone: "Right Wall", x: 87.0674, y: 72.619, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 28, zone: "Right Wall", x: 87.0674, y: 80.5861, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 29, zone: "Bottom Wall", x: 11.9308, y: 88.5531, w: 7.6503, h: 1.7399, orientation: "horizontal", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 30, zone: "Bottom Wall", x: 19.8543, y: 88.5531, w: 7.6503, h: 1.7399, orientation: "horizontal", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 31, zone: "Bottom Wall", x: 35.7013, y: 88.5531, w: 7.6503, h: 1.7399, orientation: "horizontal", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 32, zone: "Bottom Wall", x: 43.6248, y: 88.5531, w: 7.5592, h: 1.7399, orientation: "horizontal", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 33, zone: "Bottom Wall", x: 51.4572, y: 88.5531, w: 7.6503, h: 1.7399, orientation: "horizontal", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 34, zone: "Bottom Wall", x: 59.3807, y: 88.5531, w: 7.6503, h: 1.7399, orientation: "horizontal", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 35, zone: "Bottom Wall", x: 73.224, y: 88.5531, w: 7.6503, h: 1.7399, orientation: "horizontal", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 36, zone: "Bottom Wall", x: 81.1475, y: 88.5531, w: 7.6503, h: 1.7399, orientation: "horizontal", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 37, zone: "Top Island 1", x: 20.8561, y: 14.011, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 38, zone: "Top Island 1", x: 20.8561, y: 21.978, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 39, zone: "Top Island 1", x: 20.8561, y: 29.9451, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 40, zone: "Top Island 1", x: 20.8561, y: 37.9121, w: 1.7304, h: 7.6007, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 41, zone: "Top Island 1", x: 22.8597, y: 14.011, w: 5.6466, h: 1.7399, orientation: "horizontal", lengthFt: 6, depthFt: 4, tableType: "endcap", bundleEligible: true, adjacentTableIds: [37, 42] },
  { id: 42, zone: "Top Island 1", x: 28.7796, y: 14.011, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 43, zone: "Top Island 1", x: 28.7796, y: 21.978, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 44, zone: "Top Island 1", x: 28.7796, y: 29.9451, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 45, zone: "Top Island 1", x: 28.7796, y: 37.9121, w: 1.7304, h: 7.6007, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 46, zone: "Top Island 2", x: 37.7049, y: 14.011, w: 1.6393, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 47, zone: "Top Island 2", x: 37.7049, y: 21.978, w: 1.6393, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 48, zone: "Top Island 2", x: 37.7049, y: 29.9451, w: 1.6393, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 49, zone: "Top Island 2", x: 37.7049, y: 37.9121, w: 1.6393, h: 7.6007, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 50, zone: "Top Island 2", x: 39.6175, y: 14.011, w: 5.6466, h: 1.7399, orientation: "horizontal", lengthFt: 6, depthFt: 4, tableType: "endcap", bundleEligible: true, adjacentTableIds: [46, 51] },
  { id: 51, zone: "Top Island 2", x: 45.5373, y: 14.011, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 52, zone: "Top Island 2", x: 45.5373, y: 21.978, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 53, zone: "Top Island 2", x: 45.5373, y: 29.9451, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 54, zone: "Top Island 2", x: 45.5373, y: 37.9121, w: 1.7304, h: 7.6007, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 55, zone: "Top Island 3", x: 53.5519, y: 14.011, w: 1.6393, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 56, zone: "Top Island 3", x: 53.5519, y: 21.978, w: 1.6393, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 57, zone: "Top Island 3", x: 53.5519, y: 29.9451, w: 1.6393, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 58, zone: "Top Island 3", x: 53.5519, y: 37.9121, w: 1.6393, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 59, zone: "Top Island 3", x: 55.4645, y: 14.011, w: 5.6466, h: 1.7399, orientation: "horizontal", lengthFt: 6, depthFt: 4, tableType: "endcap", bundleEligible: true, adjacentTableIds: [55, 60] },
  { id: 60, zone: "Top Island 3", x: 61.3843, y: 14.011, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 61, zone: "Top Island 3", x: 61.3843, y: 21.978, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 62, zone: "Top Island 3", x: 61.3843, y: 29.9451, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 63, zone: "Top Island 3", x: 61.3843, y: 37.9121, w: 1.7304, h: 7.6007, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 64, zone: "Top Island 4", x: 70.3097, y: 14.011, w: 1.6393, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 65, zone: "Top Island 4", x: 70.3097, y: 21.978, w: 1.6393, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 66, zone: "Top Island 4", x: 70.3097, y: 29.9451, w: 1.6393, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 67, zone: "Top Island 4", x: 70.3097, y: 37.9121, w: 1.6393, h: 7.6007, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 68, zone: "Top Island 4", x: 72.2222, y: 14.011, w: 5.7377, h: 1.7399, orientation: "horizontal", lengthFt: 6, depthFt: 4, tableType: "endcap", bundleEligible: true, adjacentTableIds: [64, 69] },
  { id: 69, zone: "Top Island 4", x: 78.2332, y: 14.011, w: 1.6393, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 70, zone: "Top Island 4", x: 78.2332, y: 21.978, w: 1.6393, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 71, zone: "Top Island 4", x: 78.2332, y: 29.9451, w: 1.6393, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 72, zone: "Top Island 4", x: 78.2332, y: 37.9121, w: 1.6393, h: 7.6007, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 73, zone: "Bottom Island 1", x: 20.8561, y: 49.8168, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 74, zone: "Bottom Island 1", x: 20.8561, y: 57.7839, w: 1.7304, h: 7.6007, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 75, zone: "Bottom Island 1", x: 20.8561, y: 65.6593, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 76, zone: "Bottom Island 1", x: 20.8561, y: 73.6264, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 77, zone: "Bottom Island 1", x: 22.8597, y: 79.5788, w: 5.6466, h: 1.7399, orientation: "horizontal", lengthFt: 6, depthFt: 4, tableType: "endcap", bundleEligible: true, adjacentTableIds: [76, 81] },
  { id: 78, zone: "Bottom Island 1", x: 28.7796, y: 49.8168, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 79, zone: "Bottom Island 1", x: 28.7796, y: 57.7839, w: 1.7304, h: 7.6007, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 80, zone: "Bottom Island 1", x: 28.7796, y: 65.6593, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 81, zone: "Bottom Island 1", x: 28.7796, y: 73.6264, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 82, zone: "Bottom Island 2", x: 37.7049, y: 49.8168, w: 1.6393, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 83, zone: "Bottom Island 2", x: 37.7049, y: 57.7839, w: 1.6393, h: 7.6007, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 84, zone: "Bottom Island 2", x: 37.7049, y: 65.6593, w: 1.6393, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 85, zone: "Bottom Island 2", x: 37.7049, y: 73.6264, w: 1.6393, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 86, zone: "Bottom Island 2", x: 39.6175, y: 79.5788, w: 5.6466, h: 1.7399, orientation: "horizontal", lengthFt: 6, depthFt: 4, tableType: "endcap", bundleEligible: true, adjacentTableIds: [85, 90] },
  { id: 87, zone: "Bottom Island 2", x: 45.5373, y: 49.8168, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 88, zone: "Bottom Island 2", x: 45.5373, y: 57.7839, w: 1.7304, h: 7.6007, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 89, zone: "Bottom Island 2", x: 45.5373, y: 65.6593, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 90, zone: "Bottom Island 2", x: 45.5373, y: 73.6264, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 91, zone: "Bottom Island 3", x: 53.4608, y: 49.8168, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 92, zone: "Bottom Island 3", x: 53.4608, y: 57.7839, w: 1.7304, h: 7.6007, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 93, zone: "Bottom Island 3", x: 53.4608, y: 65.6593, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 94, zone: "Bottom Island 3", x: 53.4608, y: 73.6264, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 95, zone: "Bottom Island 3", x: 55.4645, y: 79.5788, w: 5.6466, h: 1.7399, orientation: "horizontal", lengthFt: 6, depthFt: 4, tableType: "endcap", bundleEligible: true, adjacentTableIds: [94, 99] },
  { id: 96, zone: "Bottom Island 3", x: 61.3843, y: 49.8168, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 97, zone: "Bottom Island 3", x: 61.3843, y: 57.7839, w: 1.7304, h: 7.6007, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 98, zone: "Bottom Island 3", x: 61.3843, y: 65.6593, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 99, zone: "Bottom Island 3", x: 61.3843, y: 73.6264, w: 1.7304, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 100, zone: "Bottom Island 4", x: 70.3097, y: 49.8168, w: 1.6393, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 101, zone: "Bottom Island 4", x: 70.3097, y: 57.7839, w: 1.6393, h: 7.6007, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 102, zone: "Bottom Island 4", x: 70.3097, y: 65.6593, w: 1.6393, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 103, zone: "Bottom Island 4", x: 70.3097, y: 73.6264, w: 1.6393, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 104, zone: "Bottom Island 4", x: 72.2222, y: 79.5788, w: 5.7377, h: 1.7399, orientation: "horizontal", lengthFt: 6, depthFt: 4, tableType: "endcap", bundleEligible: true, adjacentTableIds: [103, 108] },
  { id: 105, zone: "Bottom Island 4", x: 78.2332, y: 49.8168, w: 1.6393, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 106, zone: "Bottom Island 4", x: 78.2332, y: 57.7839, w: 1.6393, h: 7.6007, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 107, zone: "Bottom Island 4", x: 78.2332, y: 65.6593, w: 1.6393, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
  { id: 108, zone: "Bottom Island 4", x: 78.2332, y: 73.6264, w: 1.6393, h: 7.6923, orientation: "vertical", lengthFt: 8, depthFt: 4, tableType: "standard", bundleEligible: false, adjacentTableIds: [] },
];

export const TABLE_BY_ID: Record<number, TableDef> = Object.fromEntries(
  TABLE_LAYOUT.map((t) => [t.id, t])
);

export function getTable(id: number): TableDef | undefined {
  return TABLE_BY_ID[id];
}

export function basePriceCents(t: TableDef): number {
  return t.tableType === "endcap" ? EVENT.endcapPriceCents : EVENT.standardPriceCents;
}

export function resolvePromo(input?: string | null): PromoCode | null {
  if (!input) return null;
  const norm = input.trim().toUpperCase();
  return PROMO_CODES.find((p) => p.code.toUpperCase() === norm) ?? null;
}

export function formatUSD(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export interface CartLine {
  id: number;
  table: TableDef;
  baseCents: number;
  bundledWith: number | null; // partner 8' table id, if this end cap is bundled
}

export interface Pricing {
  lines: CartLine[];
  bundleCount: number;
  bundleDiscountCents: number;
  baseSubtotalCents: number;
  subtotalAfterBundleCents: number;
  promo: PromoCode | null;
  promoInvalid: boolean;
  promoDiscountCents: number;
  totalCents: number;
}

// Pure pricing engine — used by the cart, checkout, and the server.
// Order of operations: full base price → corner bundle (−$10 each) → discount code.
// A `table_price` code (early bird) resets every table's price; the difference
// from the full price is surfaced as the code's savings so the cart stays clear.
export function computePricing(cartIds: number[], promoInput?: string | null): Pricing {
  const cartSet = new Set(cartIds);
  const promo = resolvePromo(promoInput);
  const promoInvalid = !!promoInput && promoInput.trim().length > 0 && !promo;

  const lines: CartLine[] = [];
  let bundleDiscountCents = 0;
  let bundleCount = 0;

  for (const id of cartIds) {
    const table = getTable(id);
    if (!table) continue;
    const baseCents = basePriceCents(table); // full price (shown before discounts)
    let bundledWith: number | null = null;

    if (table.tableType === "endcap" && EVENT.bundle.enabled) {
      const partner = table.adjacentTableIds.find((a) => cartSet.has(a));
      if (partner != null) {
        bundledWith = partner;
        bundleCount += 1;
        bundleDiscountCents +=
          EVENT.bundle.type === "percent"
            ? Math.round((baseCents * EVENT.bundle.value) / 100)
            : EVENT.bundle.value;
      }
    }
    lines.push({ id, table, baseCents, bundledWith });
  }

  const baseSubtotalCents = lines.reduce((s, l) => s + l.baseCents, 0);
  const afterBundle = baseSubtotalCents - bundleDiscountCents;

  let promoDiscountCents = 0;
  if (promo) {
    if (promo.type === "table_price") {
      // Sum the per-table savings (full price minus the flat code price).
      promoDiscountCents = lines.reduce((s, l) => s + Math.max(0, l.baseCents - promo.value), 0);
    } else if (promo.type === "percent") {
      promoDiscountCents = Math.round((afterBundle * promo.value) / 100);
    } else {
      promoDiscountCents = Math.min(promo.value, afterBundle);
    }
  }

  const totalCents = Math.max(0, baseSubtotalCents - bundleDiscountCents - promoDiscountCents);

  return {
    lines,
    bundleCount,
    bundleDiscountCents,
    baseSubtotalCents,
    subtotalAfterBundleCents: afterBundle,
    promo,
    promoInvalid,
    promoDiscountCents,
    totalCents,
  };
}
