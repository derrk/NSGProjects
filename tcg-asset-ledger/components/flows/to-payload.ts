import { toCents } from "@/lib/money";
import type { ReceivedDraft } from "./types";

/** A received draft is usable if it matches an existing asset OR names a new one. */
export function receivedIsFilled(r: ReceivedDraft): boolean {
  return Boolean(r.existingAssetId) || r.name.trim().length > 0;
}

/** A new-mode row that has data entered but no name — should block submit
 *  rather than being silently dropped. */
export function receivedIsPartial(r: ReceivedDraft): boolean {
  if (r.existingAssetId !== undefined) return false; // existing-match handled elsewhere
  if (r.name.trim() !== "") return false;
  return (
    (Number(r.quantity) || 0) > 1 ||
    r.unitMarketValueDollars.trim() !== "" ||
    r.unitBasisOverrideDollars.trim() !== ""
  );
}

/** Convert a received-line draft into the server payload shape. */
export function receivedToPayload(r: ReceivedDraft) {
  const base = {
    quantity: Number(r.quantity) || 1,
    unitMarketValueCents: toCents(r.unitMarketValueDollars),
  };
  if (r.existingAssetId) {
    return { ...base, assetId: r.existingAssetId, matchMode: "reprice" as const };
  }
  return {
    ...base,
    name: r.name.trim(),
    game: r.game,
    assetType: r.assetType,
    set: r.set || null,
    cardNumber: r.cardNumber || null,
    variant: r.variant || null,
    grade: r.grade || null,
    condition: r.condition || null,
    unitBasisCentsOverride:
      r.unitBasisOverrideDollars.trim() !== "" ? toCents(r.unitBasisOverrideDollars) : undefined,
  };
}
