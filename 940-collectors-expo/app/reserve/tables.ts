// 940 Collector Expo — vendor table layout, pricing config, and pricing engine.
// Layout + adjacency are authoritative spec data (do NOT infer from coordinates).
// Coordinates are percentages of the 1030 x 1690 floor-plan reference, so the
// map stays responsive.

export type TableType = "standard" | "endcap";

// Location groups on the floor plan. Numbering runs wall tables first (bottom
// to top, so #1 on each side is nearest the main entrance), then the corners,
// rear wall and private room, then the centre islands from the entrance back
// toward the private room.
export type TableGroup =
  | "left-wall"
  | "right-wall"
  | "front-wall"
  | "rear-wall"
  | "private-room"
  | "center-1"
  | "center-2"
  | "center-3"
  | "center-4"
  | "center-5";
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
  zone: string; // human label shown in the cart, e.g. "Center 3"
  group: TableGroup; // machine key used for the map legend + list view
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

// Matches the floor-plan reference image, so a percentage coordinate maps back
// to its exact source pixel.
export const CANVAS = { w: 1030, h: 1690 };

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

// Discount codes now live in the DB (promo_codes table) and are managed from the
// admin panel. This hardcoded list is just a fallback default for computePricing;
// the client and server pass the live DB codes in. EARLYBIRD940 was migrated to
// the DB (migration 0007).
export const PROMO_CODES: PromoCode[] = [];

// All 87 tables are sellable 8' x 2.5' vendor tables, private room included.
// The Ticketing Counter and the old plan's gray markers are NOT inventory —
// any table here can still be held for a vendor or blocked from /admin.
export const FOUNDER_TABLES: number[] = [];
export const TICKET_TABLES: number[] = [];
export const SEATING_TABLES: number[] = [];
export const RESERVED_TABLES: number[] = [];

export const SEED_RESERVED: number[] = [];
export const SEED_BLOCKED: number[] = [];
export const ENDCAP_IDS: number[] = [];

// One main entrance / roll-up at the bottom of the plan. Patrons come in here,
// hit the Ticketing Counter, then pass either side of it into the hall.
export const ENTRANCES: { side: "top" | "right" | "bottom" | "left"; a: number; b: number }[] = [
  { side: "bottom", a: 38, b: 62 },
];

// Fixed venue features — NOT bookable inventory. Percentages of the same canvas.
export const TICKETING_COUNTER = { cx: 50, cy: 90.5, r: 4.2, label: "TICKETING COUNTER" };

// The private room sits across the top of the plan and holds tables 31-34.
export const PRIVATE_ROOM = { l: 24, r: 60.5, t: 2.2, b: 6.5, label: "PRIVATE ROOM" };

// ---------------------------------------------------------------------------
// Authoritative table layout — new venue plan. 87 uniform 8' x 2.5' vendor
// tables numbered 1-87. Coordinates are percentages of the 1030 x 1690
// floor-plan reference. THIS is the single source of truth: the map, the list
// view and server-side validation all read from it.
//
// Ranges: Left wall 01-12 · Right wall 13-26 · Front corners 27-28 ·
// Rear wall 29-30 · Private room 31-34 · Center 1 35-44 · Center 2 45-56 ·
// Center 3 57-68 · Center 4 69-80 · Center 5 81-87.
//
// Consecutive numbers are NOT always physically adjacent — corners, island
// ends and gaps break the run. Don't infer neighbours from the number.
// ---------------------------------------------------------------------------
export const TABLE_LAYOUT: TableDef[] = [
  { id: 1, zone: "Left Wall", group: "left-wall", x: 7.8641, y: 85.9763, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 2, zone: "Left Wall", group: "left-wall", x: 7.8641, y: 80.2959, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 3, zone: "Left Wall", group: "left-wall", x: 7.8641, y: 74.6154, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 4, zone: "Left Wall", group: "left-wall", x: 7.8641, y: 68.9349, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 5, zone: "Left Wall", group: "left-wall", x: 7.8641, y: 63.2544, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 6, zone: "Left Wall", group: "left-wall", x: 7.8641, y: 57.574, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 7, zone: "Left Wall", group: "left-wall", x: 7.8641, y: 50.4734, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 8, zone: "Left Wall", group: "left-wall", x: 7.8641, y: 41.9527, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 9, zone: "Left Wall", group: "left-wall", x: 7.8641, y: 34.8521, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 10, zone: "Left Wall", group: "left-wall", x: 7.8641, y: 26.3314, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 11, zone: "Left Wall", group: "left-wall", x: 7.8641, y: 19.2308, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 12, zone: "Left Wall", group: "left-wall", x: 7.8641, y: 10.7692, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 13, zone: "Right Wall", group: "right-wall", x: 88.835, y: 85.858, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 14, zone: "Right Wall", group: "right-wall", x: 88.835, y: 80.1775, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 15, zone: "Right Wall", group: "right-wall", x: 88.835, y: 74.497, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 16, zone: "Right Wall", group: "right-wall", x: 88.835, y: 66.0947, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 17, zone: "Right Wall", group: "right-wall", x: 88.835, y: 60.4142, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 18, zone: "Right Wall", group: "right-wall", x: 88.835, y: 54.7337, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 19, zone: "Right Wall", group: "right-wall", x: 88.835, y: 49.0533, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 20, zone: "Right Wall", group: "right-wall", x: 88.835, y: 40.5325, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 21, zone: "Right Wall", group: "right-wall", x: 88.835, y: 34.8521, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 22, zone: "Right Wall", group: "right-wall", x: 88.835, y: 29.1716, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 23, zone: "Right Wall", group: "right-wall", x: 88.835, y: 23.4911, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 24, zone: "Right Wall", group: "right-wall", x: 88.835, y: 17.8107, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 25, zone: "Right Wall", group: "right-wall", x: 88.835, y: 10.7692, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 26, zone: "Right Wall", group: "right-wall", x: 88.835, y: 5.0296, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 27, zone: "Front Corner", group: "front-wall", x: 10.7767, y: 91.6568, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 28, zone: "Front Corner", group: "front-wall", x: 81.3592, y: 91.6568, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 29, zone: "Rear Wall", group: "rear-wall", x: 67.2816, y: 5.0296, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 30, zone: "Rear Wall", group: "rear-wall", x: 76.6019, y: 5.0296, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 31, zone: "Private Room", group: "private-room", x: 27.6699, y: 3.6095, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 32, zone: "Private Room", group: "private-room", x: 36.9903, y: 3.6095, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 33, zone: "Private Room", group: "private-room", x: 46.3107, y: 3.6095, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 34, zone: "Private Room", group: "private-room", x: 55.6311, y: 3.6095, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 35, zone: "Center 1", group: "center-1", x: 20.7767, y: 86.6864, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 36, zone: "Center 1", group: "center-1", x: 30.0971, y: 86.6864, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 37, zone: "Center 1", group: "center-1", x: 58.835, y: 86.6864, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 38, zone: "Center 1", group: "center-1", x: 68.1553, y: 86.6864, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 39, zone: "Center 1", group: "center-1", x: 20.7767, y: 78.8757, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 40, zone: "Center 1", group: "center-1", x: 74.9515, y: 78.5207, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 41, zone: "Center 1", group: "center-1", x: 26.5049, y: 77.7515, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 42, zone: "Center 1", group: "center-1", x: 43.4951, y: 77.7515, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 43, zone: "Center 1", group: "center-1", x: 52.8155, y: 77.7515, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 44, zone: "Center 1", group: "center-1", x: 62.1359, y: 77.7515, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 45, zone: "Center 2", group: "center-2", x: 23.301, y: 69.7633, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 46, zone: "Center 2", group: "center-2", x: 32.6214, y: 69.7633, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 47, zone: "Center 2", group: "center-2", x: 41.9417, y: 69.7633, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 48, zone: "Center 2", group: "center-2", x: 56.3107, y: 69.7633, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 49, zone: "Center 2", group: "center-2", x: 65.6311, y: 69.7633, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 50, zone: "Center 2", group: "center-2", x: 20.7767, y: 63.9645, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 51, zone: "Center 2", group: "center-2", x: 74.9515, y: 63.9645, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 52, zone: "Center 2", group: "center-2", x: 23.5922, y: 61.1834, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 53, zone: "Center 2", group: "center-2", x: 32.9126, y: 61.1834, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 54, zone: "Center 2", group: "center-2", x: 45.0485, y: 61.1834, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 55, zone: "Center 2", group: "center-2", x: 54.3689, y: 61.1834, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 56, zone: "Center 2", group: "center-2", x: 63.6893, y: 61.1834, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 57, zone: "Center 3", group: "center-3", x: 21.5534, y: 52.4852, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 58, zone: "Center 3", group: "center-3", x: 30.8738, y: 52.4852, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 59, zone: "Center 3", group: "center-3", x: 40.4854, y: 52.4852, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 60, zone: "Center 3", group: "center-3", x: 49.8058, y: 52.4852, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 61, zone: "Center 3", group: "center-3", x: 65.2427, y: 52.4852, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 62, zone: "Center 3", group: "center-3", x: 20.7767, y: 44.7929, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 63, zone: "Center 3", group: "center-3", x: 74.5631, y: 46.1538, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 64, zone: "Center 3", group: "center-3", x: 25.4369, y: 43.9645, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 65, zone: "Center 3", group: "center-3", x: 34.7573, y: 43.9645, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 66, zone: "Center 3", group: "center-3", x: 44.0777, y: 43.9645, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 67, zone: "Center 3", group: "center-3", x: 55.9223, y: 43.9645, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 68, zone: "Center 3", group: "center-3", x: 65.2427, y: 43.9645, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 69, zone: "Center 4", group: "center-4", x: 21.5534, y: 34.8521, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 70, zone: "Center 4", group: "center-4", x: 30.8738, y: 34.8521, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 71, zone: "Center 4", group: "center-4", x: 40.1942, y: 34.8521, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 72, zone: "Center 4", group: "center-4", x: 49.8058, y: 34.8521, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 73, zone: "Center 4", group: "center-4", x: 59.1262, y: 34.8521, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 74, zone: "Center 4", group: "center-4", x: 68.4466, y: 34.8521, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 75, zone: "Center 4", group: "center-4", x: 20.7767, y: 27.7515, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 76, zone: "Center 4", group: "center-4", x: 74.9515, y: 25.6213, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 77, zone: "Center 4", group: "center-4", x: 25.3398, y: 25.6213, w: 9.4175, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 78, zone: "Center 4", group: "center-4", x: 40.3883, y: 25.6213, w: 9.4175, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 79, zone: "Center 4", group: "center-4", x: 49.8058, y: 25.6213, w: 8.1553, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 80, zone: "Center 4", group: "center-4", x: 57.9612, y: 25.6213, w: 9.3204, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 81, zone: "Center 5", group: "center-5", x: 19.8058, y: 15.6805, w: 9.4175, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 82, zone: "Center 5", group: "center-5", x: 30.0971, y: 15.6805, w: 9.4175, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 83, zone: "Center 5", group: "center-5", x: 58.2524, y: 15.1479, w: 9.2233, h: 1.7751, orientation: "horizontal", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 84, zone: "Center 5", group: "center-5", x: 18.6408, y: 9.645, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 85, zone: "Center 5", group: "center-5", x: 39.8058, y: 10.7101, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 86, zone: "Center 5", group: "center-5", x: 54.9515, y: 11.2426, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
  { id: 87, zone: "Center 5", group: "center-5", x: 67.4757, y: 10.7101, w: 2.9126, h: 5.6805, orientation: "vertical", lengthFt: 8, depthFt: 2.5, tableType: "standard", bundleEligible: false, adjacentTableIds: [], category: "vendor", shape: "rect" },
];

export const TABLE_BY_ID: Record<number, TableDef> = Object.fromEntries(
  TABLE_LAYOUT.map((t) => [t.id, t])
);

export function getTable(id: number): TableDef | undefined {
  return TABLE_BY_ID[id];
}

// Display order for the legend and the grouped list view (entrance first,
// working back toward the private room).
export const GROUP_ORDER: TableGroup[] = [
  "left-wall",
  "right-wall",
  "front-wall",
  "rear-wall",
  "private-room",
  "center-1",
  "center-2",
  "center-3",
  "center-4",
  "center-5",
];

export const GROUP_LABELS: Record<TableGroup, string> = {
  "left-wall": "Left Wall",
  "right-wall": "Right Wall",
  "front-wall": "Front Corner",
  "rear-wall": "Rear Wall",
  "private-room": "Private Room",
  "center-1": "Center 1 — Entrance",
  "center-2": "Center 2",
  "center-3": "Center 3",
  "center-4": "Center 4",
  "center-5": "Center 5 — Rear",
};

export interface TableGroupSummary {
  group: TableGroup;
  label: string;
  tables: TableDef[];
  first: number;
  last: number;
  rangeLabel: string; // e.g. "57-68"
}

const pad2 = (n: number) => String(n).padStart(2, "0");

// Derived from TABLE_LAYOUT so the legend can never drift from the inventory.
export const TABLE_GROUPS: TableGroupSummary[] = GROUP_ORDER.map((group) => {
  const tables = TABLE_LAYOUT.filter((t) => t.group === group).sort((a, b) => a.id - b.id);
  const first = tables[0]?.id ?? 0;
  const last = tables[tables.length - 1]?.id ?? 0;
  return {
    group,
    label: GROUP_LABELS[group],
    tables,
    first,
    last,
    rangeLabel: first === last ? pad2(first) : `${pad2(first)}-${pad2(last)}`,
  };
}).filter((g) => g.tables.length > 0);

// Accessible name for a table on the map and in the list view.
export function tableAccessibleName(
  t: TableDef,
  state: "available" | "selected" | "held" | "booked" | "unavailable"
): string {
  return `Table ${pad2(t.id)}, ${GROUP_LABELS[t.group]}, ${t.lengthFt} by ${t.depthFt} feet, ${state}`;
}

export function basePriceCents(t: TableDef): number {
  return t.tableType === "endcap" ? EVENT.endcapPriceCents : EVENT.standardPriceCents;
}

export function resolvePromo(input?: string | null, codes: PromoCode[] = PROMO_CODES): PromoCode | null {
  if (!input) return null;
  const norm = input.trim().toUpperCase();
  return codes.find((p) => p.code.toUpperCase() === norm) ?? null;
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
export function computePricing(cartIds: number[], promoInput?: string | null, codes: PromoCode[] = PROMO_CODES): Pricing {
  const cartSet = new Set(cartIds);
  const promo = resolvePromo(promoInput, codes);
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
