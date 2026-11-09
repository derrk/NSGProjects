import { prisma } from "@/lib/db";

/**
 * Operational settings the owner can change from the admin, rather than
 * needing a developer to edit environment variables and redeploy.
 *
 * Resolution order is deliberate: the stored row wins, and the environment
 * variables that previously drove these values act as the seed, so switching
 * this on changes nothing until someone actually edits a field.
 */

export type StoreConfig = {
  flatShippingCents: number;
  freeShippingOverCents: number;
  parcelLengthIn: number;
  parcelWidthIn: number;
  parcelHeightIn: number;
  lowStockAt: number;
  includeShippingInPrice: boolean;
  shipBaseCents: number;
  shipPerOzCents: number;
  shipMarkupPercent: number;
  coverStripeFees: boolean;
};

/** Values used when neither the database nor the environment says otherwise. */
export const DEFAULTS: StoreConfig = {
  flatShippingCents: 500,
  freeShippingOverCents: 0,
  parcelLengthIn: 9,
  parcelWidthIn: 6,
  parcelHeightIn: 3,
  lowStockAt: 3,
  includeShippingInPrice: false,
  shipBaseCents: 400,
  shipPerOzCents: 10,
  shipMarkupPercent: 15,
  coverStripeFees: true,
};

const SINGLETON = "singleton";

function envInt(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function envFloat(value: string | undefined, fallback: number): number {
  const n = Number.parseFloat(value ?? "");
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** What the environment currently says — the seed for a first-time save. */
export function configFromEnv(): StoreConfig {
  const e = process.env;
  return {
    flatShippingCents: envInt(
      e.NEXT_PUBLIC_DEFAULT_SHIPPING_CENTS,
      DEFAULTS.flatShippingCents,
    ),
    freeShippingOverCents: envInt(
      e.NEXT_PUBLIC_FREE_SHIPPING_OVER_CENTS,
      DEFAULTS.freeShippingOverCents,
    ),
    parcelLengthIn: envFloat(e.DEFAULT_PARCEL_LENGTH_IN, DEFAULTS.parcelLengthIn),
    parcelWidthIn: envFloat(e.DEFAULT_PARCEL_WIDTH_IN, DEFAULTS.parcelWidthIn),
    parcelHeightIn: envFloat(e.DEFAULT_PARCEL_HEIGHT_IN, DEFAULTS.parcelHeightIn),
    lowStockAt: DEFAULTS.lowStockAt,
    includeShippingInPrice: DEFAULTS.includeShippingInPrice,
    shipBaseCents: DEFAULTS.shipBaseCents,
    shipPerOzCents: DEFAULTS.shipPerOzCents,
    shipMarkupPercent: DEFAULTS.shipMarkupPercent,
    coverStripeFees: DEFAULTS.coverStripeFees,
  };
}

/**
 * The live configuration. Never throws: a settings read failing must not take
 * the storefront down, so a database problem falls back to the environment.
 */
export async function getStoreConfig(): Promise<StoreConfig> {
  try {
    const row = await prisma.storeSettings.findUnique({ where: { id: SINGLETON } });
    if (!row) return configFromEnv();
    return {
      flatShippingCents: row.flatShippingCents,
      freeShippingOverCents: row.freeShippingOverCents,
      parcelLengthIn: row.parcelLengthIn,
      parcelWidthIn: row.parcelWidthIn,
      parcelHeightIn: row.parcelHeightIn,
      lowStockAt: row.lowStockAt,
      includeShippingInPrice: row.includeShippingInPrice,
      shipBaseCents: row.shipBaseCents,
      shipPerOzCents: row.shipPerOzCents,
      shipMarkupPercent: row.shipMarkupPercent,
      coverStripeFees: row.coverStripeFees,
    };
  } catch (err) {
    console.error("settings: falling back to env", err);
    return configFromEnv();
  }
}

/** True once a row exists, i.e. the owner has saved at least once. */
export async function isConfigured(): Promise<boolean> {
  try {
    return (await prisma.storeSettings.count({ where: { id: SINGLETON } })) > 0;
  } catch {
    return false;
  }
}

export async function saveStoreConfig(config: StoreConfig): Promise<void> {
  await prisma.storeSettings.upsert({
    where: { id: SINGLETON },
    create: { id: SINGLETON, ...config },
    update: config,
  });
}
