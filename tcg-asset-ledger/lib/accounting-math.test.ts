import { describe, it, expect } from "vitest";
import {
  ACCOUNT,
  DEFAULT_ACCOUNTS,
  isBalanced,
  sumDebits,
  sumCredits,
  ownerContributionLines,
  ownerDrawLines,
  dueFromOwnerLines,
  ownerRepaymentLines,
  businessExpenseLines,
  transferLines,
  businessPaidPersonallyLines,
  ownerReimbursementLines,
  reconciliationLines,
  ageOutstanding,
  transactionToJournalLines,
  MIRROR_CASH,
  type LineSpec,
} from "./accounting-math";

describe("isBalanced", () => {
  it("accepts equal debits and credits", () => {
    expect(isBalanced([
      { accountCode: "a", debitCents: 100, creditCents: 0 },
      { accountCode: "b", debitCents: 0, creditCents: 100 },
    ])).toBe(true);
  });
  it("rejects unbalanced entries", () => {
    expect(isBalanced([
      { accountCode: "a", debitCents: 100, creditCents: 0 },
      { accountCode: "b", debitCents: 0, creditCents: 90 },
    ])).toBe(false);
  });
  it("rejects empty and zero-total entries", () => {
    expect(isBalanced([])).toBe(false);
    expect(isBalanced([{ accountCode: "a", debitCents: 0, creditCents: 0 }])).toBe(false);
  });
  it("rejects a line with both a debit and a credit", () => {
    expect(isBalanced([{ accountCode: "a", debitCents: 50, creditCents: 50 }])).toBe(false);
  });
});

describe("chart of accounts", () => {
  it("has unique codes and every referenced ACCOUNT code is seeded", () => {
    const codes = DEFAULT_ACCOUNTS.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of Object.values(ACCOUNT)) {
      expect(codes).toContain(code);
    }
  });
  it("marks exactly the four spending accounts as cash", () => {
    const cash = DEFAULT_ACCOUNTS.filter((a) => a.isCash).map((a) => a.code);
    expect(cash.sort()).toEqual(
      [ACCOUNT.CASH_ON_HAND, ACCOUNT.CHECKING, ACCOUNT.CASH_APP, ACCOUNT.PAYPAL].sort(),
    );
  });
});

// Every template must produce a balanced entry. (Acceptance scenarios A/B/E/F.)
describe("template line builders are balanced", () => {
  const cases: [string, LineSpec[]][] = [
    ["owner contribution", ownerContributionLines(ACCOUNT.CHECKING, 4000_00)],
    ["owner draw", ownerDrawLines(ACCOUNT.CASH_ON_HAND, 300_00)],
    ["due from owner", dueFromOwnerLines(ACCOUNT.CHECKING, 300_00)],
    ["owner repayment", ownerRepaymentLines(ACCOUNT.CHECKING, 300_00)],
    ["business expense", businessExpenseLines(ACCOUNT.CASH_ON_HAND, "show_table_fees", 250_00)],
    ["transfer", transferLines(ACCOUNT.CHECKING, ACCOUNT.CASH_APP, 500_00)],
    ["paid personally", businessPaidPersonallyLines("equipment_expense", 120_00)],
    ["owner reimbursement", ownerReimbursementLines(ACCOUNT.CHECKING, 120_00)],
  ];
  for (const [name, lines] of cases) {
    it(name, () => {
      expect(isBalanced(lines)).toBe(true);
      expect(sumDebits(lines)).toBe(sumCredits(lines));
    });
  }

  it("owner contribution debits cash and credits Owner Contributions (Scenario A)", () => {
    const lines = ownerContributionLines(ACCOUNT.CHECKING, 4000_00);
    expect(lines.find((l) => l.accountCode === ACCOUNT.CHECKING)?.debitCents).toBe(4000_00);
    expect(lines.find((l) => l.accountCode === ACCOUNT.OWNER_CONTRIB)?.creditCents).toBe(4000_00);
  });

  it("due-from-owner moves cash to a receivable, not an expense (Scenario E)", () => {
    const lines = dueFromOwnerLines(ACCOUNT.CHECKING, 300_00);
    expect(lines.find((l) => l.accountCode === ACCOUNT.DUE_FROM_OWNER)?.debitCents).toBe(300_00);
    // no expense account touched
    expect(lines.some((l) => l.accountCode?.includes("expense"))).toBe(false);
  });
});

describe("reconciliationLines", () => {
  it("found money: debit cash, credit over/short", () => {
    const lines = reconciliationLines(ACCOUNT.CASH_APP, 5_00); // actual $5 over
    expect(isBalanced(lines)).toBe(true);
    expect(lines.find((l) => l.accountCode === ACCOUNT.CASH_APP)?.debitCents).toBe(5_00);
    expect(lines.find((l) => l.accountCode === ACCOUNT.CASH_OVER_SHORT)?.creditCents).toBe(5_00);
  });
  it("missing money: credit cash, debit over/short", () => {
    const lines = reconciliationLines(ACCOUNT.CASH_ON_HAND, -20_00); // actual $20 short
    expect(isBalanced(lines)).toBe(true);
    expect(lines.find((l) => l.accountCode === ACCOUNT.CASH_ON_HAND)?.creditCents).toBe(20_00);
    expect(lines.find((l) => l.accountCode === ACCOUNT.CASH_OVER_SHORT)?.debitCents).toBe(20_00);
  });
});

describe("transactionToJournalLines (inventory → journal mirror)", () => {
  const cents = (lines: LineSpec[] | null) => (lines ? { d: sumDebits(lines), c: sumCredits(lines) } : null);

  it("every mapping that produces lines is balanced", () => {
    const cases = [
      { type: "BUY", cashDeltaCents: -300_00, outBasisCents: 0 },
      { type: "SALE", cashDeltaCents: 275_00, outBasisCents: 150_00 },
      { type: "TRADE", cashDeltaCents: -100_00, outBasisCents: 150_00 },
      { type: "TRADE", cashDeltaCents: 40_00, outBasisCents: 0 },
      { type: "GRADING_SUBMIT", cashDeltaCents: -92_00, outBasisCents: 0 },
      { type: "WHEEL_REVENUE", cashDeltaCents: 40_00, outBasisCents: 0 },
      { type: "WHEEL_PRIZE", cashDeltaCents: 0, outBasisCents: 12_00 },
      { type: "PRIZE", cashDeltaCents: 0, outBasisCents: 20_00 },
      { type: "ADJUSTMENT", cashDeltaCents: -15_00, outBasisCents: 0 },
    ];
    for (const c of cases) {
      const lines = transactionToJournalLines(c);
      expect(lines, JSON.stringify(c)).not.toBeNull();
      const t = cents(lines)!;
      expect(t.d, JSON.stringify(c)).toBe(t.c);
    }
  });

  it("a buy debits inventory and credits cash by the cash paid", () => {
    const lines = transactionToJournalLines({ type: "BUY", cashDeltaCents: -300_00, outBasisCents: 0 })!;
    expect(lines.find((l) => l.accountCode === ACCOUNT.INVENTORY_BASIS)?.debitCents).toBe(300_00);
    expect(lines.find((l) => l.accountCode === MIRROR_CASH)?.creditCents).toBe(300_00);
  });

  it("a sale books proceeds to revenue and basis through COGS", () => {
    const lines = transactionToJournalLines({ type: "SALE", cashDeltaCents: 275_00, outBasisCents: 150_00 })!;
    expect(lines.find((l) => l.accountCode === MIRROR_CASH)?.debitCents).toBe(275_00);
    expect(lines.find((l) => l.accountCode === ACCOUNT.SALES_REVENUE)?.creditCents).toBe(275_00);
    expect(lines.find((l) => l.accountCode === ACCOUNT.COGS)?.debitCents).toBe(150_00);
    expect(lines.find((l) => l.accountCode === ACCOUNT.INVENTORY_BASIS)?.creditCents).toBe(150_00);
  });

  it("the cash leg always equals the transaction's cash delta", () => {
    for (const [type, cash] of [["SALE", 275_00], ["BUY", -300_00], ["TRADE", 40_00], ["WHEEL_REVENUE", 40_00]] as const) {
      const lines = transactionToJournalLines({ type, cashDeltaCents: cash, outBasisCents: 0 }) ?? [];
      const cashLine = lines.find((l) => l.accountCode === MIRROR_CASH);
      const net = (cashLine?.debitCents ?? 0) - (cashLine?.creditCents ?? 0);
      expect(net, type).toBe(cash);
    }
  });

  it("returns null for cashless, basis-less events (break, grading return, even trade)", () => {
    expect(transactionToJournalLines({ type: "BREAK", cashDeltaCents: 0, outBasisCents: 0 })).toBeNull();
    expect(transactionToJournalLines({ type: "GRADING_RETURN", cashDeltaCents: 0, outBasisCents: 0 })).toBeNull();
    expect(transactionToJournalLines({ type: "TRADE", cashDeltaCents: 0, outBasisCents: 50_00 })).toBeNull();
  });

  it("a prize/giveaway expenses the basis out of inventory", () => {
    const lines = transactionToJournalLines({ type: "WHEEL_PRIZE", cashDeltaCents: 0, outBasisCents: 12_00 })!;
    expect(lines.find((l) => l.accountCode === ACCOUNT.PROMO)?.debitCents).toBe(12_00);
    expect(lines.find((l) => l.accountCode === ACCOUNT.INVENTORY_BASIS)?.creditCents).toBe(12_00);
  });
});

describe("ageOutstanding (Due From Owner aging)", () => {
  const now = new Date("2026-07-23T00:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  it("buckets unpaid advances by age", () => {
    const aging = ageOutstanding(
      [
        { date: daysAgo(10), cents: 100_00 }, // 0–30
        { date: daysAgo(45), cents: 50_00 }, // 31–60
        { date: daysAgo(200), cents: 25_00 }, // 90+
      ],
      0,
      now,
    );
    expect(aging.d0_30).toBe(100_00);
    expect(aging.d31_60).toBe(50_00);
    expect(aging.d90plus).toBe(25_00);
    expect(aging.total).toBe(175_00);
  });

  it("applies repayments FIFO to the oldest advances first", () => {
    // $175 owed across 3 advances; $120 repaid clears the two oldest and part of the newest.
    const aging = ageOutstanding(
      [
        { date: daysAgo(200), cents: 25_00 },
        { date: daysAgo(45), cents: 50_00 },
        { date: daysAgo(10), cents: 100_00 },
      ],
      120_00,
      now,
    );
    // 25 + 50 = 75 cleared, then 45 of the newest → 55 remains, all in 0–30.
    expect(aging.total).toBe(55_00);
    expect(aging.d0_30).toBe(55_00);
    expect(aging.d90plus).toBe(0);
    expect(aging.d31_60).toBe(0);
  });

  it("full repayment leaves nothing owed", () => {
    const aging = ageOutstanding([{ date: daysAgo(5), cents: 300_00 }], 300_00, now);
    expect(aging.total).toBe(0);
  });
});
