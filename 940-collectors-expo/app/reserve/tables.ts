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
  shape?: "rect" | "round";
  category?: "vendor";
}

export const CANVAS = { w: 760, h: 1460 };

// ---------------------------------------------------------------------------
// Admin-configurable event settings (edit here until an admin UI/DB exists).
// ---------------------------------------------------------------------------
export const EVENT = {
  name: "940 Collector Expo",
  venueName: "Ray Clymer Exhibit Hall",
  roomFt: { w: 90, h: 42 },
  standardPriceCents: 10000, // $100 per 8' table
  endcapPriceCents: 10000, // $100 (no end-cap tables this show)
  bundle: {
    enabled: false, // no 6' end-cap bundles this show — all tables are uniform 8'
    type: "fixed" as "fixed" | "percent",
    value: 1000,
  },
  holdMinutes: 10, // client-side checkout countdown (UX only)
  zelleHoldHours: 12, // server-side deadline to complete a Zelle payment before the hold is released
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
// 9FORTY25 was retired 2026-08 — no active codes right now. To add one later,
// add an entry here; a `maxUses` cap is enforced server-side in createHold.
export const PROMO_CODES: PromoCode[] = [
  // Early bird: sets each table to $85 (from $99.99). Capped at 25 total
  // redemptions — enforced server-side in createHold (counts non-released
  // reservations with this code, then throws PromoExhaustedError).
  { code: "EARLYBIRD940", type: "table_price", value: 8500, label: "Early bird — $85 per table", maxUses: 25 },
];

// All 98 tables are sellable 8' x 2.5' vendor tables. No ticketing / HQ / seating
// / reserved tiles in this room — any table can be held for a vendor from /admin.
export const FOUNDER_TABLES: number[] = [];
export const TICKET_TABLES: number[] = [];
export const SEATING_TABLES: number[] = [];
export const RESERVED_TABLES: number[] = [];

export const SEED_RESERVED: number[] = [];
export const SEED_BLOCKED: number[] = [];
export const ENDCAP_IDS: number[] = [];

// Two entrances = the openings in the perimeter wall (top + right wall).
export const ENTRANCES: { side: "top" | "right" | "bottom" | "left"; a: number; b: number }[] = [
  { side: "top", a: 14, b: 26 },
  { side: "right", a: 46, b: 53 },
];

// ---------------------------------------------------------------------------
// Authoritative table layout — updated venue layout (Oct 2026). 98 uniform
// 8' x 2.5' vendor tables numbered 1-98. Coordinates are percentages of a
// 760 x 1460 portrait canvas. THIS is the single source of truth.
// ---------------------------------------------------------------------------
export const TABLE_LAYOUT: TableDef[] = [
  { id: 1, zone: "Vendor", x: 32.4, y: 2.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 2, zone: "Vendor", x: 70.4, y: 3.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 3, zone: "Vendor", x: 78.4, y: 3.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 4, zone: "Vendor", x: 4.8, y: 5.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 5, zone: "Vendor", x: 4.8, y: 10.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 6, zone: "Vendor", x: 4.8, y: 15.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 7, zone: "Vendor", x: 4.8, y: 20.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 8, zone: "Vendor", x: 4.8, y: 27.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 9, zone: "Vendor", x: 4.8, y: 32.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 10, zone: "Vendor", x: 4.8, y: 37.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 11, zone: "Vendor", x: 4.8, y: 42.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 12, zone: "Vendor", x: 4.8, y: 49.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 13, zone: "Vendor", x: 4.8, y: 54.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 14, zone: "Vendor", x: 4.8, y: 59.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 15, zone: "Vendor", x: 4.8, y: 64.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 16, zone: "Vendor", x: 4.8, y: 71.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 17, zone: "Vendor", x: 4.8, y: 75.8, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 18, zone: "Vendor", x: 4.8, y: 80.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 19, zone: "Vendor", x: 4.8, y: 84.8, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 20, zone: "Vendor", x: 4.8, y: 89.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 21, zone: "Vendor", x: 26.8, y: 13.7, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 22, zone: "Vendor", x: 32.4, y: 11.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 23, zone: "Vendor", x: 42.4, y: 11.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 24, zone: "Vendor", x: 52.4, y: 11.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 25, zone: "Vendor", x: 62.4, y: 11.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 26, zone: "Vendor", x: 72.8, y: 13.7, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 27, zone: "Vendor", x: 32.4, y: 18.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 28, zone: "Vendor", x: 42.4, y: 18.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 29, zone: "Vendor", x: 52.4, y: 18.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 30, zone: "Vendor", x: 62.4, y: 18.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 31, zone: "Vendor", x: 26.8, y: 26.7, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 32, zone: "Vendor", x: 32.4, y: 24.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 33, zone: "Vendor", x: 42.4, y: 24.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 34, zone: "Vendor", x: 52.4, y: 24.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 35, zone: "Vendor", x: 62.4, y: 24.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 36, zone: "Vendor", x: 72.8, y: 26.7, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 37, zone: "Vendor", x: 32.4, y: 31.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 38, zone: "Vendor", x: 42.4, y: 31.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 39, zone: "Vendor", x: 52.4, y: 31.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 40, zone: "Vendor", x: 62.4, y: 31.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 41, zone: "Vendor", x: 26.8, y: 39.7, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 42, zone: "Vendor", x: 32.4, y: 37.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 43, zone: "Vendor", x: 42.4, y: 37.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 44, zone: "Vendor", x: 52.4, y: 37.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 45, zone: "Vendor", x: 62.4, y: 37.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 46, zone: "Vendor", x: 72.8, y: 39.7, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 47, zone: "Vendor", x: 32.4, y: 44.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 48, zone: "Vendor", x: 42.4, y: 44.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 49, zone: "Vendor", x: 52.4, y: 44.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 50, zone: "Vendor", x: 62.4, y: 44.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 51, zone: "Vendor", x: 26.8, y: 52.7, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 52, zone: "Vendor", x: 32.4, y: 50.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 53, zone: "Vendor", x: 42.4, y: 50.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 54, zone: "Vendor", x: 52.4, y: 50.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 55, zone: "Vendor", x: 62.4, y: 50.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 56, zone: "Vendor", x: 72.8, y: 52.7, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 57, zone: "Vendor", x: 32.4, y: 57.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 58, zone: "Vendor", x: 42.4, y: 57.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 59, zone: "Vendor", x: 52.4, y: 57.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 60, zone: "Vendor", x: 62.4, y: 57.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 61, zone: "Vendor", x: 26.8, y: 65.7, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 62, zone: "Vendor", x: 32.4, y: 63.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 63, zone: "Vendor", x: 42.4, y: 63.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 64, zone: "Vendor", x: 52.4, y: 63.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 65, zone: "Vendor", x: 62.4, y: 63.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 66, zone: "Vendor", x: 72.8, y: 65.7, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 67, zone: "Vendor", x: 32.4, y: 70.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 68, zone: "Vendor", x: 42.4, y: 70.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 69, zone: "Vendor", x: 52.4, y: 70.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 70, zone: "Vendor", x: 62.4, y: 70.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 71, zone: "Vendor", x: 26.8, y: 78.7, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 72, zone: "Vendor", x: 32.4, y: 76.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 73, zone: "Vendor", x: 42.4, y: 76.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 74, zone: "Vendor", x: 52.4, y: 76.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 75, zone: "Vendor", x: 62.4, y: 76.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 76, zone: "Vendor", x: 72.8, y: 78.7, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 77, zone: "Vendor", x: 32.4, y: 83.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 78, zone: "Vendor", x: 42.4, y: 83.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 79, zone: "Vendor", x: 52.4, y: 83.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 80, zone: "Vendor", x: 62.4, y: 83.75, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 81, zone: "Vendor", x: 88.8, y: 8.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 82, zone: "Vendor", x: 88.8, y: 14.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 83, zone: "Vendor", x: 88.8, y: 20.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 84, zone: "Vendor", x: 88.8, y: 26.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 85, zone: "Vendor", x: 88.8, y: 32.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 86, zone: "Vendor", x: 88.8, y: 38.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 87, zone: "Vendor", x: 88.8, y: 55.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 88, zone: "Vendor", x: 88.8, y: 60.8, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 89, zone: "Vendor", x: 88.8, y: 66.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 90, zone: "Vendor", x: 88.8, y: 71.8, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 91, zone: "Vendor", x: 88.8, y: 77.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 92, zone: "Vendor", x: 88.8, y: 82.8, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 93, zone: "Vendor", x: 88.8, y: 88.3, w: 2.4, h: 5.4, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 94, zone: "Vendor", x: 16.4, y: 92.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 95, zone: "Vendor", x: 24.4, y: 92.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 96, zone: "Vendor", x: 55.4, y: 92.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 97, zone: "Vendor", x: 68.4, y: 92.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 98, zone: "Vendor", x: 75.9, y: 92.95, w: 7.2, h: 2.1, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
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
