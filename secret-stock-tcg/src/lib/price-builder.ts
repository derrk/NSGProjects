/**
 * Working out what to charge when shipping is built into the sticker price.
 *
 * The shop wants "free shipping" on the storefront, with the cost folded into
 * the item price — and folded in slightly heavy, so postage and the card fee
 * are covered rather than quietly eaten on every sale.
 *
 * Every function here is pure and in integer cents.
 */

/** Stripe's standard US card rate. Theirs, not the shop's, so not a setting. */
export const STRIPE_PERCENT = 2.9;
export const STRIPE_FIXED_CENTS = 30;

export type ShippingBuildConfig = {
  /** Postage floor — what the cheapest parcel costs to send. */
  shipBaseCents: number;
  /** Added per ounce on top of the base. */
  shipPerOzCents: number;
  /** Padding over estimated postage, as a percentage. */
  shipMarkupPercent: number;
  /** Gross the price up so the card fee doesn't come out of the margin. */
  coverStripeFees: boolean;
};

export const DEFAULT_BUILD: ShippingBuildConfig = {
  shipBaseCents: 400,
  shipPerOzCents: 10,
  shipMarkupPercent: 15,
  coverStripeFees: true,
};

/** Default assumed weight when a product has none recorded. */
export const FALLBACK_WEIGHT_OZ = 4;

/**
 * Estimated postage for a parcel of this weight, before any padding.
 * Linear rather than banded: carriers are banded, but a shop pricing a shelf
 * wants a number that moves smoothly with weight, not one that jumps a dollar
 * because an item crossed 8oz.
 */
export function estimatePostageCents(
  weightOz: number,
  config: ShippingBuildConfig,
): number {
  const oz = Number.isFinite(weightOz) && weightOz > 0 ? weightOz : FALLBACK_WEIGHT_OZ;
  return Math.round(config.shipBaseCents + config.shipPerOzCents * oz);
}

/** Postage plus the shop's padding — what gets folded into the price. */
export function shippingComponentCents(
  weightOz: number,
  config: ShippingBuildConfig,
): number {
  const postage = estimatePostageCents(weightOz, config);
  const markup = Math.max(0, config.shipMarkupPercent) / 100;
  return Math.round(postage * (1 + markup));
}

/**
 * Gross a target up so that after Stripe takes its cut, the target is what
 * lands.
 *
 * The naive version adds 2.9% to the target, which under-recovers: the fee is
 * charged on the grossed-up total, not on the target. Solving
 * `charge - (charge * rate + fixed) = target` gives the form used here.
 */
export function grossUpForStripe(targetCents: number): number {
  if (targetCents <= 0) return 0;
  const rate = STRIPE_PERCENT / 100;
  return Math.ceil((targetCents + STRIPE_FIXED_CENTS) / (1 - rate));
}

export type BuiltPrice = {
  /** What the owner wants for the item itself. */
  baseCents: number;
  /** Estimated postage before padding. */
  postageCents: number;
  /** Postage plus padding. */
  shippingCents: number;
  /** The fee absorbed by grossing up; 0 when that's switched off. */
  stripeFeeCents: number;
  /** What to put on the shelf. */
  listPriceCents: number;
};

/**
 * Build a shelf price from what the owner wants to clear on the item.
 *
 * Order matters: shipping is folded in first, then the whole thing is grossed
 * up for the card fee. Grossing up only the item would leave the fee on the
 * shipping portion unrecovered.
 */
export function buildListPrice(
  baseCents: number,
  weightOz: number,
  config: ShippingBuildConfig,
): BuiltPrice {
  const base = Math.max(0, Math.round(baseCents));
  const postageCents = estimatePostageCents(weightOz, config);
  const shippingCents = shippingComponentCents(weightOz, config);
  const subtotal = base + shippingCents;

  const listPriceCents = config.coverStripeFees ? grossUpForStripe(subtotal) : subtotal;

  return {
    baseCents: base,
    postageCents,
    shippingCents,
    stripeFeeCents: listPriceCents - subtotal,
    listPriceCents,
  };
}

/**
 * What the shop actually keeps on a sale at this price, after postage and the
 * card fee. The number that says whether the padding is doing its job.
 */
export function netAfterCosts(
  listPriceCents: number,
  weightOz: number,
  config: ShippingBuildConfig,
): number {
  const fee = Math.round((listPriceCents * STRIPE_PERCENT) / 100) + STRIPE_FIXED_CENTS;
  return listPriceCents - fee - estimatePostageCents(weightOz, config);
}
