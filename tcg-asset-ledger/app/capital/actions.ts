"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  ensureChartOfAccounts,
  isCapitalSetUp,
  postEntry,
  reverseEntry,
  accountSignedBalanceByCode,
} from "@/lib/accounting";
import { COMMITMENT_CATEGORIES } from "@/lib/commitments";
import {
  ACCOUNT,
  ownerContributionLines,
  ownerDrawLines,
  dueFromOwnerLines,
  ownerRepaymentLines,
  transferLines,
  reconciliationLines,
  type LineSpec,
} from "@/lib/accounting-math";

type Result = { ok: true; id?: string; message?: string } | { ok: false; error: string };

/** Parse a date-only string (from <input type="date">) as LOCAL midnight. */
function toLocalDate(s: string | null | undefined): Date | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? undefined : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

const cents = z.number().int().nonnegative();
const posCents = z.number().int().positive();

function revalidate() {
  revalidatePath("/capital");
  revalidatePath("/capital/commitments");
  revalidatePath("/");
}

async function post(input: Parameters<typeof postEntry>[0]): Promise<Result> {
  try {
    const { id } = await postEntry(input);
    revalidate();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't record that entry." };
  }
}

// ── Setup wizard: opening balances ────────────────────────────────────────────
const setupSchema = z.object({
  effectiveDate: z.string().optional(),
  cash: z.record(z.string(), cents).default({}), // { accountCode: cents }
  inventoryBasisCents: cents.default(0),
  equipmentCents: cents.default(0),
  dueFromOwnerCents: cents.default(0),
  liabilitiesCents: cents.default(0),
  ownerContributionCents: cents.default(0),
});

export async function setupCapital(input: unknown): Promise<Result> {
  const parsed = setupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid setup data" };
  const d = parsed.data;

  try {
    if (await isCapitalSetUp()) {
      return { ok: false, error: "Capital is already set up. Use the entry forms to make changes." };
    }
    await ensureChartOfAccounts();

    const lines: LineSpec[] = [];
    // Asset debits
    for (const [code, amt] of Object.entries(d.cash)) {
      if (amt > 0) lines.push({ accountCode: code, debitCents: amt, creditCents: 0, memo: "Opening cash" });
    }
    if (d.inventoryBasisCents > 0)
      lines.push({ accountCode: ACCOUNT.INVENTORY_BASIS, debitCents: d.inventoryBasisCents, creditCents: 0, memo: "Opening inventory basis" });
    if (d.equipmentCents > 0)
      lines.push({ accountCode: ACCOUNT.EQUIPMENT, debitCents: d.equipmentCents, creditCents: 0, memo: "Opening equipment" });
    if (d.dueFromOwnerCents > 0)
      lines.push({ accountCode: ACCOUNT.DUE_FROM_OWNER, debitCents: d.dueFromOwnerCents, creditCents: 0, memo: "Opening due from owner" });
    // Liability credits
    if (d.liabilitiesCents > 0)
      lines.push({ accountCode: "business_liabilities", debitCents: 0, creditCents: d.liabilitiesCents, memo: "Opening liabilities" });

    const debits = lines.reduce((s, l) => s + l.debitCents, 0);
    const credits = lines.reduce((s, l) => s + l.creditCents, 0);
    const plug = debits - credits; // equity needed on the credit side

    if (plug > 0) {
      const contribution = Math.min(d.ownerContributionCents, plug);
      const opening = plug - contribution;
      if (contribution > 0)
        lines.push({ accountCode: ACCOUNT.OWNER_CONTRIB, debitCents: 0, creditCents: contribution, memo: "Starting owner capital" });
      if (opening > 0)
        lines.push({ accountCode: ACCOUNT.OPENING_EQUITY, debitCents: 0, creditCents: opening, memo: "Opening balance equity" });
    } else if (plug < 0) {
      lines.push({ accountCode: ACCOUNT.OPENING_EQUITY, debitCents: -plug, creditCents: 0, memo: "Opening balance equity" });
    }

    if (lines.length === 0) return { ok: false, error: "Enter at least one starting balance." };

    return await post({
      type: "OpeningBalance",
      description: "Opening balances",
      date: toLocalDate(d.effectiveDate) ?? null,
      lines,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Setup failed." };
  }
}

// ── Owner capital & cash workflows ────────────────────────────────────────────
const flow = z.object({
  cashCode: z.string().min(1),
  amountCents: posCents,
  date: z.string().optional(),
  note: z.string().optional(),
});

export async function addCapital(input: unknown): Promise<Result> {
  const p = flow.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid" };
  return post({
    type: "OwnerContribution",
    description: p.data.note || "Owner contribution",
    date: toLocalDate(p.data.date) ?? null,
    lines: ownerContributionLines(p.data.cashCode, p.data.amountCents),
  });
}

export async function recordOwnerDraw(input: unknown): Promise<Result> {
  const p = flow.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid" };
  return post({
    type: "OwnerDraw",
    description: p.data.note || "Owner draw (personal)",
    date: toLocalDate(p.data.date) ?? null,
    lines: ownerDrawLines(p.data.cashCode, p.data.amountCents),
  });
}

export async function recordDueFromOwner(input: unknown): Promise<Result> {
  const p = flow.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid" };
  return post({
    type: "DueFromOwner",
    description: p.data.note || "Personal use of business funds (to repay)",
    date: toLocalDate(p.data.date) ?? null,
    lines: dueFromOwnerLines(p.data.cashCode, p.data.amountCents),
  });
}

export async function recordOwnerRepayment(input: unknown): Promise<Result> {
  const p = flow.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid" };
  return post({
    type: "OwnerRepayment",
    description: p.data.note || "Owner repaid the business",
    date: toLocalDate(p.data.date) ?? null,
    lines: ownerRepaymentLines(p.data.cashCode, p.data.amountCents),
  });
}

const expenseSchema = flow.extend({ expenseAccountId: z.string().min(1), showId: z.string().optional() });

export async function recordBusinessExpense(input: unknown): Promise<Result> {
  const p = expenseSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid" };
  const { cashCode, expenseAccountId, amountCents, note, date, showId } = p.data;
  return post({
    type: "BusinessExpense",
    description: note || "Business expense",
    date: toLocalDate(date) ?? null,
    showId: showId ?? null,
    lines: [
      { accountId: expenseAccountId, debitCents: amountCents, creditCents: 0, memo: note },
      { accountCode: cashCode, debitCents: 0, creditCents: amountCents },
    ],
  });
}

const paidPersonallySchema = z.object({
  expenseAccountId: z.string().min(1),
  amountCents: posCents,
  date: z.string().optional(),
  note: z.string().optional(),
});

export async function recordBusinessPaidPersonally(input: unknown): Promise<Result> {
  const p = paidPersonallySchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid" };
  const { expenseAccountId, amountCents, note, date } = p.data;
  return post({
    type: "DueToOwner",
    description: note || "Business expense paid personally (reimbursable)",
    date: toLocalDate(date) ?? null,
    lines: [
      { accountId: expenseAccountId, debitCents: amountCents, creditCents: 0, memo: note },
      { accountCode: ACCOUNT.DUE_TO_OWNER, debitCents: 0, creditCents: amountCents },
    ],
  });
}

export async function recordOwnerReimbursement(input: unknown): Promise<Result> {
  const p = flow.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid" };
  return post({
    type: "OwnerReimbursement",
    description: p.data.note || "Reimbursed owner",
    date: toLocalDate(p.data.date) ?? null,
    lines: [
      { accountCode: ACCOUNT.DUE_TO_OWNER, debitCents: p.data.amountCents, creditCents: 0 },
      { accountCode: p.data.cashCode, debitCents: 0, creditCents: p.data.amountCents },
    ],
  });
}

const transferSchema = z.object({
  fromCode: z.string().min(1),
  toCode: z.string().min(1),
  amountCents: posCents,
  date: z.string().optional(),
  note: z.string().optional(),
});

export async function recordTransfer(input: unknown): Promise<Result> {
  const p = transferSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid" };
  if (p.data.fromCode === p.data.toCode) return { ok: false, error: "Pick two different accounts." };
  return post({
    type: "Transfer",
    description: p.data.note || "Transfer between accounts",
    date: toLocalDate(p.data.date) ?? null,
    lines: transferLines(p.data.fromCode, p.data.toCode, p.data.amountCents),
  });
}

const reconcileSchema = z.object({
  cashCode: z.string().min(1),
  actualCents: cents,
  note: z.string().min(1, "A reason is required for a reconciliation adjustment."),
  date: z.string().optional(),
});

export async function reconcileCash(input: unknown): Promise<Result> {
  const p = reconcileSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid" };
  const expected = await accountSignedBalanceByCode(p.data.cashCode);
  const delta = p.data.actualCents - expected;
  if (delta === 0) return { ok: true, message: "Already matches — no adjustment needed." };
  return post({
    type: "Reconciliation",
    description: `Cash reconciliation: ${p.data.note}`,
    date: toLocalDate(p.data.date) ?? null,
    lines: reconciliationLines(p.data.cashCode, delta),
  });
}

const equipmentSchema = z.object({
  cashCode: z.string().min(1),
  amountCents: posCents,
  date: z.string().optional(),
  note: z.string().optional(),
});

export async function recordEquipmentPurchase(input: unknown): Promise<Result> {
  const p = equipmentSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid" };
  return post({
    type: "EquipmentPurchase",
    description: p.data.note || "Bought equipment / gear",
    date: toLocalDate(p.data.date) ?? null,
    lines: [
      { accountCode: ACCOUNT.EQUIPMENT, debitCents: p.data.amountCents, creditCents: 0, memo: p.data.note },
      { accountCode: p.data.cashCode, debitCents: 0, creditCents: p.data.amountCents },
    ],
  });
}

const prepaySchema = z.object({
  cashCode: z.string().min(1),
  prepaidCode: z.enum([ACCOUNT.PREPAID_SHOW, ACCOUNT.PREPAID_GRADING]),
  amountCents: posCents,
  date: z.string().optional(),
  note: z.string().optional(),
});

export async function recordPrepay(input: unknown): Promise<Result> {
  const p = prepaySchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid" };
  return post({
    type: "Prepaid",
    description: p.data.note || "Prepaid a future cost",
    date: toLocalDate(p.data.date) ?? null,
    lines: [
      { accountCode: p.data.prepaidCode, debitCents: p.data.amountCents, creditCents: 0, memo: p.data.note },
      { accountCode: p.data.cashCode, debitCents: 0, creditCents: p.data.amountCents },
    ],
  });
}

const applyPrepaidSchema = z.object({
  prepaidCode: z.enum([ACCOUNT.PREPAID_SHOW, ACCOUNT.PREPAID_GRADING]),
  expenseAccountId: z.string().min(1),
  amountCents: posCents,
  date: z.string().optional(),
  note: z.string().optional(),
  showId: z.string().optional(),
});

export async function applyPrepaid(input: unknown): Promise<Result> {
  const p = applyPrepaidSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid" };
  return post({
    type: "PrepaidApplied",
    description: p.data.note || "Applied a prepaid cost",
    date: toLocalDate(p.data.date) ?? null,
    showId: p.data.showId ?? null,
    lines: [
      { accountId: p.data.expenseAccountId, debitCents: p.data.amountCents, creditCents: 0, memo: p.data.note },
      { accountCode: p.data.prepaidCode, debitCents: 0, creditCents: p.data.amountCents },
    ],
  });
}

const targetsSchema = z.object({
  minCashReserveCents: cents.nullish(),
  buyingPowerTargetCents: cents.nullish(),
});

export async function setCapitalTargets(input: unknown): Promise<Result> {
  const p = targetsSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid" };
  try {
    await prisma.appState.upsert({
      where: { id: 1 },
      create: { id: 1, minCashReserveCents: p.data.minCashReserveCents ?? null, buyingPowerTargetCents: p.data.buyingPowerTargetCents ?? null },
      update: { minCashReserveCents: p.data.minCashReserveCents ?? null, buyingPowerTargetCents: p.data.buyingPowerTargetCents ?? null },
    });
    revalidate();
    return { ok: true, message: "Targets saved." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save targets." };
  }
}

// ── Upcoming commitments (pre-orders, reserved fees, …) ───────────────────────
const commitmentSchema = z.object({
  name: z.string().min(1, "Give it a name."),
  category: z.enum(COMMITMENT_CATEGORIES),
  totalCents: posCents,
  depositPaidCents: cents.default(0),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

export async function addCommitment(input: unknown): Promise<Result> {
  const p = commitmentSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid" };
  try {
    const c = await prisma.commitment.create({
      data: {
        name: p.data.name.trim(),
        category: p.data.category,
        totalCents: p.data.totalCents,
        depositPaidCents: p.data.depositPaidCents,
        dueDate: toLocalDate(p.data.dueDate) ?? null,
        notes: p.data.notes || null,
      },
    });
    revalidate();
    return { ok: true, id: c.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't add that commitment." };
  }
}

export async function updateCommitment(id: string, input: unknown): Promise<Result> {
  const p = commitmentSchema.partial().safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid" };
  try {
    const d = p.data;
    await prisma.commitment.update({
      where: { id },
      data: {
        name: d.name?.trim(),
        category: d.category,
        totalCents: d.totalCents,
        depositPaidCents: d.depositPaidCents,
        dueDate: d.dueDate !== undefined ? (toLocalDate(d.dueDate) ?? null) : undefined,
        notes: d.notes !== undefined ? (d.notes || null) : undefined,
      },
    });
    revalidate();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't update that commitment." };
  }
}

export async function setCommitmentStatus(id: string, status: "Open" | "Fulfilled" | "Cancelled"): Promise<Result> {
  if (!["Open", "Fulfilled", "Cancelled"].includes(status)) return { ok: false, error: "Bad status" };
  try {
    await prisma.commitment.update({ where: { id }, data: { status } });
    revalidate();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't update status." };
  }
}

export async function deleteCommitment(id: string): Promise<Result> {
  try {
    await prisma.commitment.delete({ where: { id } });
    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't delete." };
  }
}

export async function reverseCapitalEntry(entryId: string): Promise<Result> {
  try {
    const { id } = await reverseEntry(entryId);
    revalidate();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't reverse that entry." };
  }
}
