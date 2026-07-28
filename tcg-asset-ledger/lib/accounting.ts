// Database layer for the capital/money double-entry journal. Wraps the pure
// helpers in lib/accounting-math.ts with Prisma. Every posted entry is validated
// to balance and is immutable — corrections post a reversal.

import { prisma } from "./db";
import {
  ACCOUNT,
  DEFAULT_ACCOUNTS,
  isBalanced,
  ageOutstanding,
  transactionToJournalLines,
  type LineSpec,
  type Aging,
} from "./accounting-math";

/** Create/refresh the seeded chart of accounts. Idempotent (keyed on code). */
export async function ensureChartOfAccounts(): Promise<void> {
  for (const a of DEFAULT_ACCOUNTS) {
    await prisma.account.upsert({
      where: { code: a.code },
      create: {
        code: a.code,
        name: a.name,
        type: a.type,
        subtype: a.subtype ?? null,
        isCash: a.isCash ?? false,
        isRestricted: a.isRestricted ?? false,
        isSystem: true,
        sortOrder: a.sortOrder,
      },
      update: {
        name: a.name,
        type: a.type,
        subtype: a.subtype ?? null,
        isCash: a.isCash ?? false,
        isSystem: true,
        sortOrder: a.sortOrder,
      },
    });
  }
}

/** Active accounts (for form dropdowns). */
export async function listActiveAccounts() {
  return prisma.account.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, code: true, name: true, type: true, subtype: true, isCash: true },
  });
}

/** Recent journal entries with their lines + account names (for the ledger view). */
export async function listJournalEntries(limit = 25) {
  return prisma.journalEntry.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      lines: { include: { account: { select: { name: true, type: true } } } },
    },
  });
}

/** Capital reserve targets (for buying-power alerts). */
export async function getCapitalSettings(): Promise<{ minCashReserveCents: number | null; buyingPowerTargetCents: number | null }> {
  const s = await prisma.appState.findUnique({
    where: { id: 1 },
    select: { minCashReserveCents: true, buyingPowerTargetCents: true },
  });
  return {
    minCashReserveCents: s?.minCashReserveCents ?? null,
    buyingPowerTargetCents: s?.buyingPowerTargetCents ?? null,
  };
}

/** Whether the Capital Setup Wizard has run (an opening-balance entry exists). */
export async function isCapitalSetUp(): Promise<boolean> {
  const n = await prisma.journalEntry.count({ where: { type: "OpeningBalance" } });
  return n > 0;
}

async function resolveLineAccountIds(lines: LineSpec[]): Promise<{ accountId: string; debitCents: number; creditCents: number; memo: string | null }[]> {
  const codes = Array.from(new Set(lines.map((l) => l.accountCode).filter(Boolean))) as string[];
  let byCode = new Map<string, string>();
  if (codes.length) {
    let accts = await prisma.account.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
    // A code we expect but don't have yet → seed the chart and retry once.
    if (accts.length < codes.length) {
      await ensureChartOfAccounts();
      accts = await prisma.account.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
    }
    byCode = new Map(accts.map((a) => [a.code as string, a.id]));
  }
  return lines.map((l) => {
    const accountId = l.accountId ?? (l.accountCode ? byCode.get(l.accountCode) : undefined);
    if (!accountId) throw new Error(`Unknown account: ${l.accountCode ?? "(no code/id)"}`);
    return {
      accountId,
      debitCents: l.debitCents || 0,
      creditCents: l.creditCents || 0,
      memo: l.memo ?? null,
    };
  });
}

export interface PostEntryInput {
  type: string;
  lines: LineSpec[];
  date?: Date | null;
  description?: string | null;
  reference?: string | null;
  showId?: string | null;
  sourceTransactionId?: string | null;
}

/** Post a balanced journal entry. Throws if debits ≠ credits. */
export async function postEntry(input: PostEntryInput): Promise<{ id: string }> {
  if (!isBalanced(input.lines)) {
    throw new Error("Journal entry is not balanced (debits must equal credits).");
  }
  const lines = await resolveLineAccountIds(input.lines);
  const entry = await prisma.journalEntry.create({
    data: {
      type: input.type,
      description: input.description ?? null,
      reference: input.reference ?? null,
      showId: input.showId ?? null,
      status: "posted",
      date: input.date ?? undefined,
      postedAt: new Date(),
      sourceTransactionId: input.sourceTransactionId ?? null,
      lines: { create: lines },
    },
  });
  return { id: entry.id };
}

/** Reverse a posted entry: mirror its lines (debit↔credit) and mark it reversed. */
export async function reverseEntry(entryId: string, opts?: { description?: string }): Promise<{ id: string }> {
  const original = await prisma.journalEntry.findUnique({
    where: { id: entryId },
    include: { lines: true },
  });
  if (!original) throw new Error("Entry not found.");
  if (original.status === "reversed") throw new Error("Entry is already reversed.");
  if (original.type === "Reversal") throw new Error("A reversal entry can't itself be reversed.");

  return prisma.$transaction(async (tx) => {
    const reversal = await tx.journalEntry.create({
      data: {
        type: "Reversal",
        description: opts?.description ?? `Reversal of ${original.description ?? original.type}`,
        status: "posted",
        postedAt: new Date(),
        reversalOfId: original.id,
        lines: {
          create: original.lines.map((l) => ({
            accountId: l.accountId,
            debitCents: l.creditCents,
            creditCents: l.debitCents,
            memo: l.memo,
          })),
        },
      },
    });
    await tx.journalEntry.update({ where: { id: original.id }, data: { status: "reversed" } });
    return { id: reversal.id };
  });
}

/** Signed balance (debit − credit) per accountId, over all non-draft entries. */
async function signedBalancesById(): Promise<Map<string, number>> {
  const lines = await prisma.journalLine.findMany({
    where: { entry: { status: { in: ["posted", "reversed"] } } },
    select: { accountId: true, debitCents: true, creditCents: true },
  });
  const m = new Map<string, number>();
  for (const l of lines) {
    m.set(l.accountId, (m.get(l.accountId) ?? 0) + l.debitCents - l.creditCents);
  }
  return m;
}

/**
 * Idempotently mirror inventory-ledger transactions into the journal (Phase 2a),
 * so cash and P&L stay live without touching the existing buy/sell flows. Only
 * transactions RECORDED after the books were opened are mirrored (earlier ones
 * are baked into the opening balance); each is keyed by sourceTransactionId, so
 * re-running never doubles. Never edits or deletes anything in the inventory
 * ledger — it only reads it and creates journal entries.
 */
export async function syncInventoryToJournal(): Promise<{ created: number }> {
  const opening = await prisma.journalEntry.findFirst({
    where: { type: "OpeningBalance" },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  if (!opening) return { created: 0 }; // books not opened yet — nothing to mirror

  const txns = await prisma.transaction.findMany({
    where: { createdAt: { gt: opening.createdAt } },
    include: { lines: { select: { direction: true, quantity: true, unitBasisCents: true } } },
    orderBy: { date: "asc" },
  });
  if (txns.length === 0) return { created: 0 };

  const already = new Set(
    (
      await prisma.journalEntry.findMany({
        where: { sourceTransactionId: { in: txns.map((t) => t.id) } },
        select: { sourceTransactionId: true },
      })
    ).map((e) => e.sourceTransactionId as string),
  );

  let created = 0;
  for (const t of txns) {
    if (already.has(t.id)) continue;
    const outBasisCents = t.lines
      .filter((l) => l.direction === "OUT")
      .reduce((s, l) => s + l.unitBasisCents * l.quantity, 0);
    const lines = transactionToJournalLines({ type: t.type, cashDeltaCents: t.cashDeltaCents, outBasisCents });
    if (!lines) continue;
    try {
      await postEntry({
        type: t.type,
        description: `Inventory: ${t.type.toLowerCase().replace(/_/g, " ")}`,
        date: t.date,
        showId: t.showId ?? null,
        sourceTransactionId: t.id,
        lines,
      });
      created++;
    } catch {
      // Unique-constraint race or a bad row — skip; the next run retries cleanly.
    }
  }
  return { created };
}

/** Signed balance (debit − credit) of a single account by code. */
export async function accountSignedBalanceByCode(code: string): Promise<number> {
  const acct = await prisma.account.findUnique({ where: { code }, select: { id: true } });
  if (!acct) return 0;
  const agg = await prisma.journalLine.aggregate({
    where: { accountId: acct.id, entry: { status: { in: ["posted", "reversed"] } } },
    _sum: { debitCents: true, creditCents: true },
  });
  return (agg._sum.debitCents ?? 0) - (agg._sum.creditCents ?? 0);
}

export interface CashAccountBalance {
  id: string;
  name: string;
  code: string | null;
  isRestricted: boolean;
  cents: number;
}

export interface CapitalSnapshot {
  cashByAccount: CashAccountBalance[];
  cashTotal: number;
  restrictedCash: number;
  dueFromOwner: number;
  dueFromOwnerAging: Aging;
  dueToOwner: number;
  equipment: number;
  inventoryBasisOpening: number;
  /** All Asset accounts except cash and the inventory-basis counterweight
   *  (equipment, due-from-owner, receivables, prepaid, …) — auto-covers new ones. */
  otherAssets: { name: string; cents: number }[];
  otherAssetsTotal: number;
  liabilities: number;
  ownerContributions: number;
  ownerDraws: number;
  openingEquity: number;
  expensesTotal: number;
  /** Journal-side net (assets − liabilities) captured in the money layer. */
  journalNet: number;
  isSetUp: boolean;
}

/** All the money-layer figures the Capital Dashboard needs, derived from the journal. */
export async function getCapitalSnapshot(now: Date): Promise<CapitalSnapshot> {
  const [accounts, signed, dueFromLines, setUp] = await Promise.all([
    prisma.account.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    signedBalancesById(),
    prisma.journalLine.findMany({
      where: {
        account: { code: ACCOUNT.DUE_FROM_OWNER },
        entry: { status: { in: ["posted", "reversed"] } },
      },
      select: { debitCents: true, creditCents: true, entry: { select: { date: true } } },
    }),
    isCapitalSetUp(),
  ]);

  const bal = (code: string) => {
    const acct = accounts.find((a) => a.code === code);
    return acct ? signed.get(acct.id) ?? 0 : 0;
  };

  const cashAccts = accounts.filter((a) => a.isCash);
  const cashByAccount: CashAccountBalance[] = cashAccts.map((a) => ({
    id: a.id,
    name: a.name,
    code: a.code,
    isRestricted: a.isRestricted,
    cents: signed.get(a.id) ?? 0,
  }));
  const cashTotal = cashByAccount.reduce((s, c) => s + c.cents, 0);
  const restrictedCash = cashByAccount.filter((c) => c.isRestricted).reduce((s, c) => s + c.cents, 0);

  const expensesTotal = accounts
    .filter((a) => a.type === "Expense")
    .reduce((s, a) => s + (signed.get(a.id) ?? 0), 0);
  const liabilities = accounts
    .filter((a) => a.type === "Liability")
    .reduce((s, a) => s + -(signed.get(a.id) ?? 0), 0); // credit-normal → credit − debit

  // Due-from-owner aging: debit lines are advances, credit lines are repayments.
  const advances = dueFromLines
    .filter((l) => l.debitCents > 0)
    .map((l) => ({ date: l.entry.date, cents: l.debitCents }));
  const repaymentTotal = dueFromLines.reduce((s, l) => s + l.creditCents, 0);
  const dueFromOwnerAging = ageOutstanding(advances, repaymentTotal, now);

  const assetsTotal = accounts
    .filter((a) => a.type === "Asset")
    .reduce((s, a) => s + (signed.get(a.id) ?? 0), 0);

  // Every asset that isn't cash or the inventory-basis counterweight — equipment,
  // due-from-owner, marketplace receivables, prepaid, and any future asset account.
  const otherAssets = accounts
    .filter((a) => a.type === "Asset" && !a.isCash && a.code !== ACCOUNT.INVENTORY_BASIS)
    .map((a) => ({ name: a.name, cents: signed.get(a.id) ?? 0 }))
    .filter((x) => x.cents !== 0);
  const otherAssetsTotal = otherAssets.reduce((s, x) => s + x.cents, 0);

  return {
    cashByAccount,
    cashTotal,
    restrictedCash,
    dueFromOwner: bal(ACCOUNT.DUE_FROM_OWNER),
    dueFromOwnerAging,
    dueToOwner: -bal(ACCOUNT.DUE_TO_OWNER),
    equipment: bal(ACCOUNT.EQUIPMENT),
    inventoryBasisOpening: bal(ACCOUNT.INVENTORY_BASIS),
    otherAssets,
    otherAssetsTotal,
    liabilities,
    ownerContributions: -bal(ACCOUNT.OWNER_CONTRIB),
    ownerDraws: bal(ACCOUNT.OWNER_DRAW),
    openingEquity: -bal(ACCOUNT.OPENING_EQUITY),
    expensesTotal,
    journalNet: assetsTotal - liabilities,
    isSetUp: setUp,
  };
}
