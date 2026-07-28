// Accounting reports derived from the journal (+ the inventory engine for the
// balance sheet). All money in integer cents. Date range filters on entry date.

import { prisma } from "./db";
import { ACCOUNT } from "./accounting-math";
import { getCapitalSnapshot } from "./accounting";
import { getDashboardMetrics } from "./queries";

export interface DateRange {
  from?: Date | null;
  to?: Date | null;
}

interface AccountTotal {
  id: string;
  name: string;
  code: string | null;
  type: string;
  subtype: string | null;
  sortOrder: number;
  debit: number;
  credit: number;
}

function entryWhere(range: DateRange) {
  const date: { gte?: Date; lte?: Date } = {};
  if (range.from) date.gte = range.from;
  if (range.to) date.lte = range.to;
  return {
    status: { in: ["posted", "reversed"] as string[] },
    ...(range.from || range.to ? { date } : {}),
  };
}

async function accountTotals(range: DateRange): Promise<AccountTotal[]> {
  const lines = await prisma.journalLine.findMany({
    where: { entry: entryWhere(range) },
    select: {
      debitCents: true,
      creditCents: true,
      account: { select: { id: true, name: true, code: true, type: true, subtype: true, sortOrder: true } },
    },
  });
  const map = new Map<string, AccountTotal>();
  for (const l of lines) {
    const a = l.account;
    const cur = map.get(a.id) ?? {
      id: a.id, name: a.name, code: a.code, type: a.type, subtype: a.subtype, sortOrder: a.sortOrder, debit: 0, credit: 0,
    };
    cur.debit += l.debitCents;
    cur.credit += l.creditCents;
    map.set(a.id, cur);
  }
  return [...map.values()].sort((x, y) => x.sortOrder - y.sortOrder);
}

export interface LineItem { name: string; cents: number }

export interface ProfitAndLoss {
  income: LineItem[];
  revenueTotal: number;
  cogs: LineItem[];
  cogsTotal: number;
  grossProfit: number;
  expenses: LineItem[];
  expenseTotal: number;
  netProfit: number;
}

/** Profit & Loss over a range — income − COGS − operating expenses. */
export async function getProfitAndLoss(range: DateRange): Promise<ProfitAndLoss> {
  const totals = await accountTotals(range);
  const income = totals
    .filter((t) => t.type === "Income")
    .map((t) => ({ name: t.name, cents: t.credit - t.debit }))
    .filter((x) => x.cents !== 0);
  const cogs = totals
    .filter((t) => t.type === "Expense" && t.subtype === "COGS")
    .map((t) => ({ name: t.name, cents: t.debit - t.credit }))
    .filter((x) => x.cents !== 0);
  const expenses = totals
    .filter((t) => t.type === "Expense" && t.subtype !== "COGS")
    .map((t) => ({ name: t.name, cents: t.debit - t.credit }))
    .filter((x) => x.cents !== 0);

  const revenueTotal = income.reduce((s, x) => s + x.cents, 0);
  const cogsTotal = cogs.reduce((s, x) => s + x.cents, 0);
  const expenseTotal = expenses.reduce((s, x) => s + x.cents, 0);
  return {
    income, revenueTotal, cogs, cogsTotal,
    grossProfit: revenueTotal - cogsTotal,
    expenses, expenseTotal,
    netProfit: revenueTotal - cogsTotal - expenseTotal,
  };
}

export interface StatementOfPosition {
  assets: LineItem[];
  assetsTotal: number;
  liabilities: LineItem[];
  liabilitiesTotal: number;
  equity: number;
}

/** Balance sheet AS OF now — cash + inventory (engine) + equipment + due-from, less liabilities. */
export async function getStatementOfPosition(now: Date): Promise<StatementOfPosition> {
  const [snap, metrics] = await Promise.all([getCapitalSnapshot(now), getDashboardMetrics()]);
  const assets: LineItem[] = [
    { name: "Cash", cents: snap.cashTotal },
    { name: "Inventory (cost basis)", cents: metrics.inventoryCostCents },
    ...snap.otherAssets, // equipment, due-from, receivables, prepaid, …
  ].filter((x) => x.cents !== 0);
  const assetsTotal = assets.reduce((s, x) => s + x.cents, 0);
  const liabilities: LineItem[] = [
    { name: "Due to owner", cents: snap.dueToOwner },
    { name: "Other liabilities", cents: snap.liabilities - snap.dueToOwner },
  ].filter((x) => x.cents !== 0);
  const liabilitiesTotal = snap.liabilities;
  return { assets, assetsTotal, liabilities, liabilitiesTotal, equity: assetsTotal - liabilitiesTotal };
}

export interface CashFlow {
  inflows: LineItem[];
  outflows: LineItem[];
  net: number;
}

/** Cash flow over a range — net cash change grouped by journal entry type. */
export async function getCashFlow(range: DateRange): Promise<CashFlow> {
  const cashAccts = await prisma.account.findMany({ where: { isCash: true }, select: { id: true } });
  const cashIds = new Set(cashAccts.map((a) => a.id));
  const lines = await prisma.journalLine.findMany({
    where: { entry: entryWhere(range), accountId: { in: [...cashIds] } },
    select: { debitCents: true, creditCents: true, entry: { select: { type: true } } },
  });
  const byType = new Map<string, number>();
  for (const l of lines) {
    byType.set(l.entry.type, (byType.get(l.entry.type) ?? 0) + l.debitCents - l.creditCents);
  }
  const label = (t: string) => CASH_TYPE_LABELS[t] ?? t;
  const inflows: LineItem[] = [];
  const outflows: LineItem[] = [];
  let net = 0;
  for (const [type, cents] of byType) {
    net += cents;
    if (cents > 0) inflows.push({ name: label(type), cents });
    else if (cents < 0) outflows.push({ name: label(type), cents: -cents });
  }
  inflows.sort((a, b) => b.cents - a.cents);
  outflows.sort((a, b) => b.cents - a.cents);
  return { inflows, outflows, net };
}

const CASH_TYPE_LABELS: Record<string, string> = {
  OpeningBalance: "Opening balance", OwnerContribution: "Owner contributions",
  OwnerDraw: "Owner draws", DueFromOwner: "Personal (owed back)", OwnerRepayment: "Owner repayments",
  OwnerReimbursement: "Owner reimbursements", BusinessExpense: "Operating expenses",
  Transfer: "Transfers", Reconciliation: "Reconciliation adjustments", Reversal: "Reversals",
  BUY: "Inventory purchases", SALE: "Sales collections", TRADE: "Trades",
  GRADING_SUBMIT: "Grading fees", WHEEL_REVENUE: "Wheel revenue", WHEEL_SPIN: "Wheel spins",
  ADJUSTMENT: "Adjustments",
};

export interface OwnerActivity {
  contributions: number;
  draws: number;
  dueFromOwner: number;
  dueFromAdvances: number;
  dueFromRepayments: number;
  dueToOwner: number;
}

/** Owner-facing totals over a range. */
export async function getOwnerActivity(range: DateRange): Promise<OwnerActivity> {
  const totals = await accountTotals(range);
  const byCode = (code: string) => totals.find((t) => t.code === code);
  const contrib = byCode(ACCOUNT.OWNER_CONTRIB);
  const draw = byCode(ACCOUNT.OWNER_DRAW);
  const dueFrom = byCode(ACCOUNT.DUE_FROM_OWNER);
  const dueTo = byCode(ACCOUNT.DUE_TO_OWNER);
  return {
    contributions: contrib ? contrib.credit - contrib.debit : 0,
    draws: draw ? draw.debit - draw.credit : 0,
    dueFromOwner: dueFrom ? dueFrom.debit - dueFrom.credit : 0,
    dueFromAdvances: dueFrom ? dueFrom.debit : 0,
    dueFromRepayments: dueFrom ? dueFrom.credit : 0,
    dueToOwner: dueTo ? dueTo.credit - dueTo.debit : 0,
  };
}

/** Operating expenses by category over a range (excludes COGS). */
export async function getExpenseReport(range: DateRange): Promise<{ rows: LineItem[]; total: number }> {
  const totals = await accountTotals(range);
  const rows = totals
    .filter((t) => t.type === "Expense" && t.subtype !== "COGS")
    .map((t) => ({ name: t.name, cents: t.debit - t.credit }))
    .filter((x) => x.cents !== 0)
    .sort((a, b) => b.cents - a.cents);
  return { rows, total: rows.reduce((s, x) => s + x.cents, 0) };
}

export interface EquityWaterfall {
  openingEquity: number;
  contributions: number;
  draws: number;
  netProfit: number;
  capitalAtRisk: number;
  reinvestedProfit: number;
  netEquity: number;
}

/**
 * The equity waterfall (books view, journal-consistent):
 *   Opening equity + Owner contributions − Owner draws + Net profit = Net equity.
 * Capital-at-risk = original owner money still in; reinvested profit = earnings kept.
 * This is the accounting/books equity; it can differ slightly from the dashboard's
 * live net equity, which values inventory at current cost basis from the engine.
 */
export async function getEquityWaterfall(now: Date): Promise<EquityWaterfall> {
  const [snap, pnl] = await Promise.all([getCapitalSnapshot(now), getProfitAndLoss({})]);
  const originalCapital = snap.openingEquity + snap.ownerContributions;
  const capitalAtRisk = originalCapital - snap.ownerDraws;
  const reinvestedProfit = pnl.netProfit;
  return {
    openingEquity: snap.openingEquity,
    contributions: snap.ownerContributions,
    draws: snap.ownerDraws,
    netProfit: pnl.netProfit,
    capitalAtRisk,
    reinvestedProfit,
    netEquity: capitalAtRisk + reinvestedProfit,
  };
}

export interface AllocationRow { name: string; cents: number; pct: number }

/** Where the business's capital currently sits (as % of total assets). */
export async function getCapitalAllocation(now: Date): Promise<{ rows: AllocationRow[]; total: number }> {
  const [snap, metrics] = await Promise.all([getCapitalSnapshot(now), getDashboardMetrics()]);
  const raw = [
    { name: "Cash", cents: snap.cashTotal },
    { name: "Inventory (cost basis)", cents: metrics.inventoryCostCents },
    ...snap.otherAssets, // equipment, due-from, receivables, prepaid, …
  ].filter((x) => x.cents > 0);
  const total = raw.reduce((s, x) => s + x.cents, 0);
  const rows = raw
    .map((x) => ({ ...x, pct: total > 0 ? (x.cents / total) * 100 : 0 }))
    .sort((a, b) => b.cents - a.cents);
  return { rows, total };
}
