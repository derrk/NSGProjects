import { TXN_TYPE_LABELS, type TransactionType } from "./domain";

export interface TxnLineLike {
  direction: string;
  quantity: number;
  asset: { name: string } | null;
}

/** A short human summary of what a transaction did, for lists. */
export function summarizeTransaction(txn: {
  type: string;
  lines: TxnLineLike[];
}): string {
  const inLines = txn.lines.filter((l) => l.direction === "IN");
  const outLines = txn.lines.filter((l) => l.direction === "OUT");
  const label = (l: TxnLineLike) =>
    `${l.quantity > 1 ? l.quantity + "× " : ""}${l.asset?.name ?? "item"}`;

  switch (txn.type) {
    case "BUY":
      return inLines.map(label).join(", ") || "Purchase";
    case "SALE":
      return outLines.map(label).join(", ") || "Sale";
    case "TRADE": {
      const gave = outLines.map(label).join(", ") || "—";
      const got = inLines.map(label).join(", ") || "—";
      return `Gave ${gave} → Got ${got}`;
    }
    case "BREAK":
      return `${outLines.map(label).join(", ")} → ${inLines.length} item(s)`;
    case "PRIZE":
    case "WHEEL_PRIZE":
      return outLines.map(label).join(", ") || "Prize";
    case "ADJUSTMENT":
      return [...outLines, ...inLines].map(label).join(", ") || "Adjustment";
    case "GRADING_SUBMIT":
      return outLines.map(label).join(", ") || "Grading submission";
    case "GRADING_RETURN":
      return inLines.map(label).join(", ") || "Grading return";
    case "WHEEL_REVENUE":
      return "Wheel revenue";
    case "WHEEL_SPIN":
      return "Wheel spin";
    default:
      return "";
  }
}

export function txnTypeLabel(type: string): string {
  return TXN_TYPE_LABELS[type as TransactionType] ?? type;
}

export interface AnalysisLine {
  direction: string;
  quantity: number;
  unitValueCents: number;
  unitBasisCents: number;
}

export interface TxnAnalysis {
  valueInCents: number; // market value of what came in
  valueOutCents: number; // market value of what went out
  marketDeltaCents: number; // inventory market-value change (in − out)
  cashDeltaCents: number;
  netWithCashCents: number; // marketDelta + cash
  realizedProfitCents: number | null; // sales only
}

/** Value math for a transaction, used by trade analysis + ledger displays. */
export function analyzeTransaction(txn: {
  type: string;
  cashDeltaCents: number;
  lines: AnalysisLine[];
}): TxnAnalysis {
  let valueInCents = 0;
  let valueOutCents = 0;
  let cogsOutCents = 0;
  for (const l of txn.lines) {
    const value = l.unitValueCents * l.quantity;
    if (l.direction === "IN") valueInCents += value;
    else {
      valueOutCents += value;
      cogsOutCents += l.unitBasisCents * l.quantity;
    }
  }
  const marketDeltaCents = valueInCents - valueOutCents;
  return {
    valueInCents,
    valueOutCents,
    marketDeltaCents,
    cashDeltaCents: txn.cashDeltaCents,
    netWithCashCents: marketDeltaCents + txn.cashDeltaCents,
    // Realized profit uses the sale's actual cash in (authoritative) minus COGS.
    realizedProfitCents: txn.type === "SALE" ? txn.cashDeltaCents - cogsOutCents : null,
  };
}
