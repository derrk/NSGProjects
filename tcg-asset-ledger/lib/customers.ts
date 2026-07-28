// Customer service. Additive to the ledger — a Transaction's counterparty
// stays free text; customerId is just an optional strong link for repeat
// buyers/trade partners worth tracking.
import { prisma } from "./db";
import type { PickableCustomer } from "@/components/flows/types";

/** Customers for the flow-form picker (fetched once, filtered client-side). */
export async function listPickableCustomers(): Promise<PickableCustomer[]> {
  return prisma.customer.findMany({
    select: { id: true, name: true, email: true, phone: true },
    orderBy: { name: "asc" },
    take: 500,
  });
}

export interface CustomerListRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  transactionCount: number;
  lifetimeSalesCents: number;
  lastTransactionAt: Date | null;
}

export async function listCustomers(filters: { search?: string } = {}): Promise<CustomerListRow[]> {
  const customers = await prisma.customer.findMany({
    where: filters.search
      ? {
          OR: [
            { name: { contains: filters.search } },
            { email: { contains: filters.search } },
            { phone: { contains: filters.search } },
          ],
        }
      : undefined,
    include: {
      transactions: { select: { type: true, cashDeltaCents: true, date: true } },
    },
    orderBy: { name: "asc" },
  });

  return customers.map((c) => {
    let lifetimeSalesCents = 0;
    let lastTransactionAt: Date | null = null;
    for (const t of c.transactions) {
      if (t.type === "SALE") lifetimeSalesCents += t.cashDeltaCents;
      if (!lastTransactionAt || t.date > lastTransactionAt) lastTransactionAt = t.date;
    }
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      transactionCount: c.transactions.length,
      lifetimeSalesCents,
      lastTransactionAt,
    };
  });
}

export async function getCustomer(id: string) {
  return prisma.customer.findUnique({ where: { id } });
}

export async function getCustomerWithHistory(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      transactions: {
        orderBy: { date: "desc" },
        include: { lines: { include: { asset: { select: { name: true } } } } },
      },
    },
  });
  return customer;
}

export interface CustomerStats {
  transactionCount: number;
  salesToCustomerCents: number;
  purchasesFromCustomerCents: number;
  tradesCount: number;
  tradeValueInCents: number;
  tradeValueOutCents: number;
  firstTransactionAt: Date | null;
  lastTransactionAt: Date | null;
}

export async function getCustomerStats(id: string): Promise<CustomerStats> {
  const txns = await prisma.transaction.findMany({
    where: { customerId: id },
    include: { lines: true },
    orderBy: { date: "asc" },
  });

  const stats: CustomerStats = {
    transactionCount: txns.length,
    salesToCustomerCents: 0,
    purchasesFromCustomerCents: 0,
    tradesCount: 0,
    tradeValueInCents: 0,
    tradeValueOutCents: 0,
    firstTransactionAt: txns[0]?.date ?? null,
    lastTransactionAt: txns[txns.length - 1]?.date ?? null,
  };

  for (const t of txns) {
    if (t.type === "SALE") {
      stats.salesToCustomerCents += t.cashDeltaCents;
    } else if (t.type === "BUY") {
      stats.purchasesFromCustomerCents += -t.cashDeltaCents;
    } else if (t.type === "TRADE") {
      stats.tradesCount++;
      for (const l of t.lines) {
        const v = l.unitValueCents * l.quantity;
        if (l.direction === "IN") stats.tradeValueInCents += v;
        else stats.tradeValueOutCents += v;
      }
    }
  }
  return stats;
}

export interface CustomerInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export async function createCustomer(input: CustomerInput) {
  return prisma.customer.create({
    data: {
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
    },
  });
}

export async function updateCustomer(id: string, input: Partial<CustomerInput>) {
  return prisma.customer.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email ?? null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
    },
  });
}

export async function deleteCustomer(id: string) {
  const txnCount = await prisma.transaction.count({ where: { customerId: id } });
  if (txnCount > 0) {
    throw new Error("This customer has transactions linked. Unlink them before deleting.");
  }
  await prisma.customer.delete({ where: { id } });
}
