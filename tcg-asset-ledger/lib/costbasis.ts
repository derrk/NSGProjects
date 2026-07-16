// Pure cost-basis math — no database, no framework. This is the core of the
// asset ledger and is unit-tested directly (see costbasis.test.ts).
//
// The governing rule from the product spec:
//
//   When you acquire assets, their combined cost basis is:
//     (sum of the cost basis of everything you gave up) + (cash you paid)
//   and that total is allocated across the assets you received, weighted by
//   each received asset's market value.
//
//   Worked example: buy Card A for $24, later trade Card A + $143 cash for
//   Card B (worth $240). Card B's basis = $24 + $143 = $167.

import { allocateByWeight } from "./money";

export interface AcquisitionInput {
  /** Sum of cost basis (cents) of all assets given up in the trade. */
  givenBasisCents: number;
  /**
   * Signed cash movement in cents.
   *   negative = money left your pocket (you paid cash)
   *   positive = money came in (you received cash / boot)
   */
  cashDeltaCents: number;
  /** Total market value (cents) of each received asset, in order. */
  receivedMarketValuesCents: number[];
}

/**
 * Total acquisition cost that must be spread across the received assets.
 *   acquisitionCost = givenBasis + cashPaid - cashReceived
 *                   = givenBasis - cashDelta   (cashDelta is negative when paying)
 * Never negative (if you received more cash than basis given, basis floors at 0).
 */
export function acquisitionCostCents(input: {
  givenBasisCents: number;
  cashDeltaCents: number;
}): number {
  return Math.max(0, input.givenBasisCents - input.cashDeltaCents);
}

/**
 * Allocate the acquisition cost across received assets by market-value weight.
 * Returns the total basis (cents) for each received asset, summing exactly to
 * the acquisition cost.
 */
export function allocateAcquisition(input: AcquisitionInput): number[] {
  const total = acquisitionCostCents(input);
  return allocateByWeight(total, input.receivedMarketValuesCents);
}

/**
 * Weighted-average per-unit basis when adding stock to an existing lot.
 * Keeps a single blended cost per unit (the model most vendors expect).
 */
export function blendUnitBasis(
  existingQty: number,
  existingUnitBasisCents: number,
  addedQty: number,
  addedTotalBasisCents: number,
): number {
  const totalQty = existingQty + addedQty;
  if (totalQty <= 0) return 0;
  const totalBasis = existingQty * existingUnitBasisCents + addedTotalBasisCents;
  return Math.round(totalBasis / totalQty);
}

export interface RealizedLine {
  proceedsCents: number;
  basisCents: number;
  profitCents: number;
}

/**
 * Realized profit for a sale line: what you received minus what it cost you.
 */
export function realizedProfit(
  proceedsCents: number,
  basisCents: number,
): RealizedLine {
  return {
    proceedsCents,
    basisCents,
    profitCents: proceedsCents - basisCents,
  };
}
