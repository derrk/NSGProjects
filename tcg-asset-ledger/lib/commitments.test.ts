import { describe, it, expect } from "vitest";
import { commitmentRemaining, summarizeCommitments, type CommitmentLike } from "./commitments";

const now = new Date("2026-07-23T12:00:00Z");
const inDays = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

describe("commitmentRemaining", () => {
  it("is total minus deposit, floored at 0", () => {
    expect(commitmentRemaining({ totalCents: 100_00, depositPaidCents: 50_00 })).toBe(50_00); // GameStop half down
    expect(commitmentRemaining({ totalCents: 80_00, depositPaidCents: 0 })).toBe(80_00); // Pokémon Center, no charge yet
    expect(commitmentRemaining({ totalCents: 40_00, depositPaidCents: 60_00 })).toBe(0); // overpaid → never negative
  });
});

describe("summarizeCommitments", () => {
  const rows: CommitmentLike[] = [
    { totalCents: 120_00, depositPaidCents: 60_00, dueDate: inDays(40), status: "Open" }, // GameStop: $60 remaining, far out
    { totalCents: 80_00, depositPaidCents: 0, dueDate: inDays(7), status: "Open" }, // Pokémon Center: $80 remaining, due soon
    { totalCents: 50_00, depositPaidCents: 0, dueDate: inDays(-3), status: "Open" }, // overdue $50
    { totalCents: 30_00, depositPaidCents: 30_00, dueDate: inDays(5), status: "Open" }, // fully paid → excluded
    { totalCents: 999_00, depositPaidCents: 0, dueDate: inDays(2), status: "Fulfilled" }, // not open → excluded
  ];

  it("totals only open, unpaid remaining balances", () => {
    const s = summarizeCommitments(rows, now);
    expect(s.openCount).toBe(3); // the three with remaining > 0 and status Open
    expect(s.totalRemaining).toBe(60_00 + 80_00 + 50_00);
  });

  it("splits due-soon and overdue by due date", () => {
    const s = summarizeCommitments(rows, now);
    expect(s.dueSoon).toBe(80_00); // Pokémon Center, 7 days out
    expect(s.dueSoonCount).toBe(1);
    expect(s.overdue).toBe(50_00);
    expect(s.overdueCount).toBe(1);
  });

  it("ignores fulfilled/cancelled and zero-remaining", () => {
    const s = summarizeCommitments(
      [
        { totalCents: 100_00, depositPaidCents: 0, dueDate: null, status: "Cancelled" },
        { totalCents: 100_00, depositPaidCents: 100_00, dueDate: null, status: "Open" },
      ],
      now,
    );
    expect(s.openCount).toBe(0);
    expect(s.totalRemaining).toBe(0);
  });

  it("undated commitments still count toward total but not due-soon/overdue", () => {
    const s = summarizeCommitments([{ totalCents: 200_00, depositPaidCents: 0, dueDate: null, status: "Open" }], now);
    expect(s.totalRemaining).toBe(200_00);
    expect(s.dueSoon).toBe(0);
    expect(s.overdue).toBe(0);
  });
});
