// Shared client-side types for the transaction flow editors.

export interface PickableCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface PickableAsset {
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
}

/** An OUT line the user is building (something given up / sold). */
export interface GivenDraft {
  key: string;
  assetId: string;
  quantity: number;
  unitValueDollars: string; // sale/trade value per unit
}

/** An IN line the user is building (something received / bought). */
export interface ReceivedDraft {
  key: string;
  /** When set, this line matches an existing inventory asset (reprice mode)
   *  rather than creating a new one — prevents duplicates when logging late. */
  existingAssetId?: string;
  name: string;
  game: string;
  assetType: string;
  set: string;
  cardNumber: string;
  variant: string;
  grade: string;
  condition: string;
  quantity: number;
  unitMarketValueDollars: string;
  unitBasisOverrideDollars: string; // optional; blank = let allocation decide
}

export function newReceivedDraft(key: string): ReceivedDraft {
  return {
    key,
    name: "",
    game: "Pokemon",
    assetType: "RawCard",
    set: "",
    cardNumber: "",
    variant: "",
    grade: "Ungraded",
    condition: "Near Mint",
    quantity: 1,
    unitMarketValueDollars: "",
    unitBasisOverrideDollars: "",
  };
}

export function marketOf(a: PickableAsset): number {
  return a.priceOverrideCents ?? a.marketValueCents;
}

export function assetLabel(a: PickableAsset): string {
  const bits = [a.name];
  const sub = [a.set, a.cardNumber ? `#${a.cardNumber}` : null, a.grade && a.grade !== "Ungraded" ? a.grade : null]
    .filter(Boolean)
    .join(" · ");
  return sub ? `${bits[0]} — ${sub}` : bits[0];
}
