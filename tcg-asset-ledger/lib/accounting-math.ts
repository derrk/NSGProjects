// Pure double-entry helpers for the capital/money layer — NO database. All money
// is integer cents. These functions are the testable core: balance validation,
// the default chart of accounts, template line builders for each workflow, and
// FIFO aging for money owed. lib/accounting.ts wraps these with Prisma.

export type AccountType = "Asset" | "Liability" | "Equity" | "Income" | "Expense";

// Stable codes for the accounts the engine references directly.
export const ACCOUNT = {
  CASH_ON_HAND: "cash_on_hand",
  CHECKING: "business_checking",
  CASH_APP: "cash_app",
  PAYPAL: "paypal",
  DUE_FROM_OWNER: "due_from_owner",
  EQUIPMENT: "equipment",
  INVENTORY_BASIS: "inventory_basis",
  WHATNOT_RECEIVABLE: "whatnot_receivable",
  TCGPLAYER_RECEIVABLE: "tcgplayer_receivable",
  PREPAID_SHOW: "prepaid_show_fees",
  PREPAID_GRADING: "prepaid_grading",
  DUE_TO_OWNER: "due_to_owner",
  OWNER_CONTRIB: "owner_contributions",
  OWNER_DRAW: "owner_draws",
  OPENING_EQUITY: "opening_balance_equity",
  RETAINED: "retained_earnings",
  CASH_OVER_SHORT: "cash_over_short",
  // Accounts the inventory→journal mirror posts against.
  SALES_REVENUE: "sales_revenue",
  COGS: "cogs",
  PROMO: "promo_giveaway",
  WHEEL_REVENUE: "break_wheel_revenue",
  MISC_EXPENSE: "misc_expense",
  OTHER_REVENUE: "other_revenue",
} as const;

/** Default cash account the inventory mirror routes operational cash through. */
export const MIRROR_CASH = ACCOUNT.CASH_ON_HAND;

export interface SeedAccount {
  code: string;
  name: string;
  type: AccountType;
  subtype?: string;
  isCash?: boolean;
  isRestricted?: boolean;
  sortOrder: number;
}

// The default chart of accounts seeded on first setup. Users can add their own;
// these system accounts are what the workflows post against.
export const DEFAULT_ACCOUNTS: SeedAccount[] = [
  // ── Cash (liquid business money) ──
  { code: ACCOUNT.CASH_ON_HAND, name: "Cash on Hand", type: "Asset", subtype: "Cash", isCash: true, sortOrder: 10 },
  { code: ACCOUNT.CHECKING, name: "Business Checking", type: "Asset", subtype: "Cash", isCash: true, sortOrder: 11 },
  { code: ACCOUNT.CASH_APP, name: "Cash App", type: "Asset", subtype: "Cash", isCash: true, sortOrder: 12 },
  { code: ACCOUNT.PAYPAL, name: "PayPal", type: "Asset", subtype: "Cash", isCash: true, sortOrder: 13 },
  // ── Other assets ──
  { code: ACCOUNT.DUE_FROM_OWNER, name: "Due From Owner", type: "Asset", subtype: "Receivable", sortOrder: 20 },
  { code: ACCOUNT.EQUIPMENT, name: "Equipment / Fixed Assets", type: "Asset", subtype: "Equipment", sortOrder: 21 },
  { code: ACCOUNT.INVENTORY_BASIS, name: "Inventory Cost Basis", type: "Asset", subtype: "Inventory", sortOrder: 22 },
  { code: ACCOUNT.WHATNOT_RECEIVABLE, name: "Whatnot Pending Payout", type: "Asset", subtype: "Receivable", sortOrder: 23 },
  { code: ACCOUNT.TCGPLAYER_RECEIVABLE, name: "TCGplayer Pending Payout", type: "Asset", subtype: "Receivable", sortOrder: 24 },
  { code: ACCOUNT.PREPAID_SHOW, name: "Prepaid Show Fees", type: "Asset", subtype: "Prepaid", sortOrder: 25 },
  { code: ACCOUNT.PREPAID_GRADING, name: "Prepaid Grading", type: "Asset", subtype: "Prepaid", sortOrder: 26 },
  // ── Liabilities ──
  { code: ACCOUNT.DUE_TO_OWNER, name: "Due to Owner", type: "Liability", sortOrder: 30 },
  { code: "credit_card", name: "Credit Card Payable", type: "Liability", sortOrder: 31 },
  { code: "business_liabilities", name: "Other Business Liabilities", type: "Liability", sortOrder: 32 },
  // ── Equity ──
  { code: ACCOUNT.OWNER_CONTRIB, name: "Owner Contributions", type: "Equity", subtype: "OwnerEquity", sortOrder: 40 },
  { code: ACCOUNT.OWNER_DRAW, name: "Owner Draws", type: "Equity", subtype: "OwnerEquity", sortOrder: 41 },
  { code: ACCOUNT.OPENING_EQUITY, name: "Opening Balance Equity", type: "Equity", sortOrder: 42 },
  { code: ACCOUNT.RETAINED, name: "Retained Earnings", type: "Equity", sortOrder: 43 },
  // ── Income ──
  { code: ACCOUNT.SALES_REVENUE, name: "Inventory Sales", type: "Income", sortOrder: 50 },
  { code: "break_wheel_revenue", name: "Break / Wheel Revenue", type: "Income", sortOrder: 53 },
  { code: "other_revenue", name: "Other Revenue", type: "Income", sortOrder: 54 },
  // ── Cost of goods sold ──
  { code: ACCOUNT.COGS, name: "Cost of Goods Sold", type: "Expense", subtype: "COGS", sortOrder: 55 },
  // ── Expenses ──
  { code: "grading_fees", name: "Grading Fees", type: "Expense", sortOrder: 60 },
  { code: "show_table_fees", name: "Show Table Fees", type: "Expense", sortOrder: 61 },
  { code: "travel_hotel", name: "Travel — Hotel", type: "Expense", sortOrder: 62 },
  { code: "travel_fuel", name: "Travel — Fuel / Charging", type: "Expense", sortOrder: 63 },
  { code: "travel_meals", name: "Travel — Meals", type: "Expense", sortOrder: 64 },
  { code: "marketplace_fees", name: "Marketplace Fees", type: "Expense", sortOrder: 65 },
  { code: "shipping_expense", name: "Shipping Expense", type: "Expense", sortOrder: 66 },
  { code: "packaging_supplies", name: "Packaging Supplies", type: "Expense", sortOrder: 67 },
  { code: "marketing", name: "Marketing / Advertising", type: "Expense", sortOrder: 68 },
  { code: "software_subscriptions", name: "Software / Subscriptions", type: "Expense", sortOrder: 69 },
  { code: "equipment_expense", name: "Content / Equipment Expense", type: "Expense", sortOrder: 70 },
  { code: "misc_expense", name: "Miscellaneous Business Expense", type: "Expense", sortOrder: 71 },
  { code: ACCOUNT.PROMO, name: "Promo / Giveaways", type: "Expense", sortOrder: 73 },
  { code: ACCOUNT.CASH_OVER_SHORT, name: "Cash Over / Short", type: "Expense", sortOrder: 72 },
];

/** Codes that are posted only by automation (mirror/reconcile) — hidden from the
 *  manual "business expense" category picker. */
export const AUTO_ONLY_EXPENSE_CODES = new Set<string>([ACCOUNT.COGS, ACCOUNT.CASH_OVER_SHORT, ACCOUNT.PROMO]);

/** A line before posting — references an account by code (templates) or id (posting). */
export interface LineSpec {
  accountCode?: string;
  accountId?: string;
  debitCents: number;
  creditCents: number;
  memo?: string;
}

export const sumDebits = (lines: LineSpec[]): number =>
  lines.reduce((a, l) => a + (l.debitCents || 0), 0);
export const sumCredits = (lines: LineSpec[]): number =>
  lines.reduce((a, l) => a + (l.creditCents || 0), 0);

/** A postable entry has ≥1 line, sums to a positive total, and debits == credits. */
export function isBalanced(lines: LineSpec[]): boolean {
  if (lines.length === 0) return false;
  const d = sumDebits(lines);
  const c = sumCredits(lines);
  if (d <= 0 || c <= 0) return false;
  // No line may carry both a debit and a credit.
  if (lines.some((l) => (l.debitCents || 0) > 0 && (l.creditCents || 0) > 0)) return false;
  return d === c;
}

// ── Template line builders (pure) ─────────────────────────────────────────────
// Debit increases assets & expenses; credit increases liabilities, equity & income.

/** Owner adds personal money to the business. */
export const ownerContributionLines = (cashCode: string, cents: number): LineSpec[] => [
  { accountCode: cashCode, debitCents: cents, creditCents: 0 },
  { accountCode: ACCOUNT.OWNER_CONTRIB, debitCents: 0, creditCents: cents },
];

/** Owner permanently removes business money for personal use (not an expense). */
export const ownerDrawLines = (cashCode: string, cents: number): LineSpec[] => [
  { accountCode: ACCOUNT.OWNER_DRAW, debitCents: cents, creditCents: 0 },
  { accountCode: cashCode, debitCents: 0, creditCents: cents },
];

/** Business money used for a personal bill the owner will pay back. */
export const dueFromOwnerLines = (cashCode: string, cents: number): LineSpec[] => [
  { accountCode: ACCOUNT.DUE_FROM_OWNER, debitCents: cents, creditCents: 0 },
  { accountCode: cashCode, debitCents: 0, creditCents: cents },
];

/** Owner repays money they owed the business. */
export const ownerRepaymentLines = (cashCode: string, cents: number): LineSpec[] => [
  { accountCode: cashCode, debitCents: cents, creditCents: 0 },
  { accountCode: ACCOUNT.DUE_FROM_OWNER, debitCents: 0, creditCents: cents },
];

/** A real operating expense paid from a business cash account. */
export const businessExpenseLines = (cashCode: string, expenseCode: string, cents: number): LineSpec[] => [
  { accountCode: expenseCode, debitCents: cents, creditCents: 0 },
  { accountCode: cashCode, debitCents: 0, creditCents: cents },
];

/** Move money between two cash accounts — never revenue or expense. */
export const transferLines = (fromCode: string, toCode: string, cents: number): LineSpec[] => [
  { accountCode: toCode, debitCents: cents, creditCents: 0 },
  { accountCode: fromCode, debitCents: 0, creditCents: cents },
];

/** Owner paid a business expense with personal money and will be reimbursed. */
export const businessPaidPersonallyLines = (expenseCode: string, cents: number): LineSpec[] => [
  { accountCode: expenseCode, debitCents: cents, creditCents: 0 },
  { accountCode: ACCOUNT.DUE_TO_OWNER, debitCents: 0, creditCents: cents },
];

/** Business reimburses the owner. */
export const ownerReimbursementLines = (cashCode: string, cents: number): LineSpec[] => [
  { accountCode: ACCOUNT.DUE_TO_OWNER, debitCents: cents, creditCents: 0 },
  { accountCode: cashCode, debitCents: 0, creditCents: cents },
];

/**
 * Adjust a cash account to a counted actual, offsetting the difference to Cash
 * Over / Short. deltaCents = actual − expected (positive = found money).
 */
export const reconciliationLines = (cashCode: string, deltaCents: number): LineSpec[] =>
  deltaCents >= 0
    ? [
        { accountCode: cashCode, debitCents: deltaCents, creditCents: 0 },
        { accountCode: ACCOUNT.CASH_OVER_SHORT, debitCents: 0, creditCents: deltaCents },
      ]
    : [
        { accountCode: ACCOUNT.CASH_OVER_SHORT, debitCents: -deltaCents, creditCents: 0 },
        { accountCode: cashCode, debitCents: 0, creditCents: -deltaCents },
      ];

// ── FIFO aging for money owed (Due From / To Owner) ───────────────────────────

export interface DatedAmount {
  date: Date;
  cents: number;
}

export interface Aging {
  d0_30: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
  total: number;
}

// ── Inventory → journal mirror (Phase 2a) ─────────────────────────────────────
// Map ONE existing inventory transaction to balanced journal lines. The cash leg
// is always exactly the transaction's cash delta (so business cash stays exact);
// the offset is decomposed into revenue / COGS / inventory / expense so the
// journal supports P&L and cash-flow reports. Inventory basis figures shown on
// screen still come from the authoritative inventory engine — the journal's
// inventory account here is a balancing counterweight. Returns null when there
// is no money event to record.
export interface TxnForMirror {
  type: string;
  cashDeltaCents: number; // signed: negative = paid out, positive = received
  outBasisCents: number; // Σ (OUT line unitBasis × qty) — basis leaving inventory
}

export function transactionToJournalLines(t: TxnForMirror): LineSpec[] | null {
  const cash = t.cashDeltaCents;
  const outBasis = Math.max(0, t.outBasisCents);
  const dr = (accountCode: string, cents: number, memo?: string): LineSpec => ({ accountCode, debitCents: cents, creditCents: 0, memo });
  const cr = (accountCode: string, cents: number, memo?: string): LineSpec => ({ accountCode, debitCents: 0, creditCents: cents, memo });

  switch (t.type) {
    case "BUY":
    case "GRADING_SUBMIT":
      // Cash out becomes inventory basis (grading fees capitalize into the card).
      if (cash >= 0) return null;
      return [dr(ACCOUNT.INVENTORY_BASIS, -cash), cr(MIRROR_CASH, -cash)];

    case "SALE": {
      const proceeds = cash > 0 ? cash : 0;
      const lines: LineSpec[] = [];
      if (proceeds > 0) {
        lines.push(dr(MIRROR_CASH, proceeds));
        lines.push(cr(ACCOUNT.SALES_REVENUE, proceeds));
      }
      if (outBasis > 0) {
        lines.push(dr(ACCOUNT.COGS, outBasis));
        lines.push(cr(ACCOUNT.INVENTORY_BASIS, outBasis));
      }
      return lines.length ? lines : null;
    }

    case "TRADE":
      // Basis rolls over (no realized profit); only the cash leg moves money.
      if (cash === 0) return null;
      return cash < 0
        ? [dr(ACCOUNT.INVENTORY_BASIS, -cash), cr(MIRROR_CASH, -cash)]
        : [dr(MIRROR_CASH, cash), cr(ACCOUNT.INVENTORY_BASIS, cash)];

    case "PRIZE":
    case "WHEEL_PRIZE":
      // Inventory given away — expense the basis, no cash.
      if (outBasis <= 0) return null;
      return [dr(ACCOUNT.PROMO, outBasis), cr(ACCOUNT.INVENTORY_BASIS, outBasis)];

    case "WHEEL_REVENUE":
    case "WHEEL_SPIN":
      if (cash <= 0) return null;
      return [dr(MIRROR_CASH, cash), cr(ACCOUNT.WHEEL_REVENUE, cash)];

    case "BREAK":
    case "GRADING_RETURN":
      // No money event (pack opened / card returned). Park a stray cash delta.
      if (cash === 0) return null;
      return cash < 0
        ? [dr(ACCOUNT.MISC_EXPENSE, -cash), cr(MIRROR_CASH, -cash)]
        : [dr(MIRROR_CASH, cash), cr(ACCOUNT.OTHER_REVENUE, cash)];

    case "ADJUSTMENT":
    default:
      if (cash === 0) return null;
      return cash < 0
        ? [dr(ACCOUNT.MISC_EXPENSE, -cash), cr(MIRROR_CASH, -cash)]
        : [dr(MIRROR_CASH, cash), cr(ACCOUNT.OTHER_REVENUE, cash)];
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Age the still-outstanding portion of advances. Repayments pay off the OLDEST
 * advances first (FIFO); whatever remains is bucketed by how long ago it was
 * advanced (measured against `now`). Pure — pass `now` in.
 */
export function ageOutstanding(
  advances: DatedAmount[],
  repaymentTotalCents: number,
  now: Date,
): Aging {
  const sorted = [...advances].sort((a, b) => a.date.getTime() - b.date.getTime());
  let remainingRepayment = Math.max(0, repaymentTotalCents);
  const buckets: Aging = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 };

  for (const adv of sorted) {
    let open = adv.cents;
    if (remainingRepayment > 0) {
      const applied = Math.min(open, remainingRepayment);
      open -= applied;
      remainingRepayment -= applied;
    }
    if (open <= 0) continue;
    const ageDays = Math.floor((now.getTime() - adv.date.getTime()) / DAY_MS);
    if (ageDays <= 30) buckets.d0_30 += open;
    else if (ageDays <= 60) buckets.d31_60 += open;
    else if (ageDays <= 90) buckets.d61_90 += open;
    else buckets.d90plus += open;
    buckets.total += open;
  }
  return buckets;
}
