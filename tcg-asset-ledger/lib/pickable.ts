import type { PickableAsset } from "@/components/flows/types";

/** Trim a DB asset down to the fields the flow editors need (serializable). */
export function toPickable(a: {
  id: string;
  name: string;
  game: string;
  set: string | null;
  cardNumber: string | null;
  grade: string | null;
  variant: string | null;
  quantity: number;
  costBasisCents: number;
  marketValueCents: number;
  priceOverrideCents: number | null;
}): PickableAsset {
  return {
    id: a.id,
    name: a.name,
    game: a.game,
    set: a.set,
    cardNumber: a.cardNumber,
    grade: a.grade,
    variant: a.variant,
    quantity: a.quantity,
    costBasisCents: a.costBasisCents,
    marketValueCents: a.marketValueCents,
    priceOverrideCents: a.priceOverrideCents,
  };
}
