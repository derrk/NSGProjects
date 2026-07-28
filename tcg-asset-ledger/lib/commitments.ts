// Upcoming commitments (pre-orders, reserved fees, subscriptions, tax). The
// REMAINING balance (total − deposit already paid) is money spoken for; it gets
// reserved out of safe-to-spend buying power. Pure summary helpers below are
// unit-tested; the DB helpers wrap them with Prisma.

import { prisma } from "./db";

export const COMMITMENT_CATEGORIES = [
  "PreOrder",
  "TableFee",
  "Hotel",
  "Subscription",
  "Grading",
  "Tax",
  "Other",
] as const;
export type CommitmentCategory = (typeof COMMITMENT_CATEGORIES)[number];

export const COMMITMENT_CATEGORY_LABELS: Record<string, string> = {
  PreOrder: "Pre-order",
  TableFee: "Table fee",
  Hotel: "Hotel / travel",
  Subscription: "Subscription",
  Grading: "Grading",
  Tax: "Tax",
  Other: "Other",
};

export interface CommitmentLike {
  totalCents: number;
  depositPaidCents: number;
  dueDate: Date | null;
  status: string;
}

/** What you still owe on a commitment — never negative. */
export function commitmentRemaining(c: { totalCents: number; depositPaidCents: number }): number {
  return Math.max(0, c.totalCents - c.depositPaidCents);
}

export interface CommitmentSummary {
  openCount: number;
  totalRemaining: number;
  dueSoon: number; // remaining due within the soon window (not yet overdue)
  dueSoonCount: number;
  overdue: number; // remaining already past due
  overdueCount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Roll up open commitments: total still owed, plus due-soon / overdue slices. */
export function summarizeCommitments(rows: CommitmentLike[], now: Date, soonDays = 14): CommitmentSummary {
  const s: CommitmentSummary = { openCount: 0, totalRemaining: 0, dueSoon: 0, dueSoonCount: 0, overdue: 0, overdueCount: 0 };
  for (const c of rows) {
    if (c.status !== "Open") continue;
    const rem = commitmentRemaining(c);
    if (rem <= 0) continue;
    s.openCount++;
    s.totalRemaining += rem;
    if (c.dueDate) {
      const days = Math.floor((c.dueDate.getTime() - now.getTime()) / DAY_MS);
      if (days < 0) {
        s.overdue += rem;
        s.overdueCount++;
      } else if (days <= soonDays) {
        s.dueSoon += rem;
        s.dueSoonCount++;
      }
    }
  }
  return s;
}

export async function listCommitments(includeClosed = false) {
  return prisma.commitment.findMany({
    where: includeClosed ? {} : { status: "Open" },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });
}

export async function getCommitmentSummary(now: Date): Promise<CommitmentSummary> {
  const rows = await prisma.commitment.findMany({
    where: { status: "Open" },
    select: { totalCents: true, depositPaidCents: true, dueDate: true, status: true },
  });
  return summarizeCommitments(rows, now);
}
