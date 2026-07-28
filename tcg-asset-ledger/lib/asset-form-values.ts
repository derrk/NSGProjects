// Plain (non-client) helpers for the asset form, so server components (the edit
// page) can build form values without importing a "use client" module.
import { toDollars } from "@/lib/money";

export interface AssetFormValues {
  id?: string;
  name: string;
  game: string;
  assetType: string;
  set: string;
  cardNumber: string;
  rarity: string;
  variant: string;
  grade: string;
  condition: string;
  location: string;
  source: string;
  notes: string;
  status: string;
  quantity: number;
  costBasisDollars: string;
  marketValueDollars: string;
  isPersonal: boolean;
}

export const EMPTY_ASSET_FORM: AssetFormValues = {
  name: "",
  game: "Pokemon",
  assetType: "RawCard",
  set: "",
  cardNumber: "",
  rarity: "",
  variant: "",
  grade: "Ungraded",
  condition: "Near Mint",
  location: "",
  source: "",
  notes: "",
  status: "InStock",
  quantity: 1,
  costBasisDollars: "0",
  marketValueDollars: "0",
  isPersonal: false,
};

export function assetToFormValues(a: {
  id: string;
  name: string;
  game: string;
  assetType: string;
  set: string | null;
  cardNumber: string | null;
  rarity: string | null;
  variant: string | null;
  grade: string | null;
  condition: string | null;
  location: string | null;
  source: string | null;
  notes: string | null;
  status: string;
  quantity: number;
  costBasisCents: number;
  marketValueCents: number;
  isPersonal: boolean;
}): AssetFormValues {
  return {
    id: a.id,
    name: a.name,
    game: a.game,
    assetType: a.assetType,
    set: a.set ?? "",
    cardNumber: a.cardNumber ?? "",
    rarity: a.rarity ?? "",
    variant: a.variant ?? "",
    grade: a.grade ?? "Ungraded",
    condition: a.condition ?? "Near Mint",
    location: a.location ?? "",
    source: a.source ?? "",
    notes: a.notes ?? "",
    status: a.status,
    quantity: a.quantity,
    costBasisDollars: String(toDollars(a.costBasisCents)),
    marketValueDollars: String(toDollars(a.marketValueCents)),
    isPersonal: a.isPersonal,
  };
}
