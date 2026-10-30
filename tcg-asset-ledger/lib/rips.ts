// Rip economics — "did opening this sealed pay off?" Cost = the sealed's cost
// basis that left inventory; pulled value = the market value of the cards that
// came out. Net = pulled − cost (usually negative — the fun tax — but a big hit
// can flip it positive). Pure helper below; getRipHistory wraps it with Prisma.

import { prisma } from "./db";

export interface RipLine {
  direction: string; // IN (pulled) | OUT (the sealed)
  quantity: number;
  unitValueCents: number; // market value per unit
  unitBasisCents: number; // cost basis per unit
}

export interface RipEconomics {
  costCents: number; // sealed cost basis consumed
  pulledValueCents: number; // market value of the pulls
  netCents: number; // pulled − cost
  pullCount: number;
}

/** Pure: roll a BREAK/rip transaction's lines into its economics. */
export function ripEconomics(lines: RipLine[]): RipEconomics {
  let costCents = 0;
  let pulledValueCents = 0;
  let pullCount = 0;
  for (const l of lines) {
    if (l.direction === "OUT") {
      costCents += l.unitBasisCents * l.quantity;
    } else if (l.direction === "IN") {
      pulledValueCents += l.unitValueCents * l.quantity;
      pullCount += l.quantity;
    }
  }
  return { costCents, pulledValueCents, netCents: pulledValueCents - costCents, pullCount };
}

export interface RipRow extends RipEconomics {
  id: string;
  date: Date;
  sealedName: string;
}

export interface RipHistory {
  rips: RipRow[];
  count: number;
  totalCostCents: number;
  totalPulledCents: number;
  totalNetCents: number;
  paidOffCount: number; // rips where pulled value beat the sealed cost
}

/** Every sealed opening (BREAK) with its economics + lifetime totals. */
export async function getRipHistory(): Promise<RipHistory> {
  const txns = await prisma.transaction.findMany({
    where: { type: "BREAK" },
    orderBy: { date: "desc" },
    include: {
      lines: {
        select: {
          direction: true,
          quantity: true,
          unitValueCents: true,
          unitBasisCents: true,
          asset: { select: { name: true } },
        },
      },
    },
  });

  const rips: RipRow[] = txns.map((t) => {
    const econ = ripEconomics(t.lines);
    const sealed = t.lines.find((l) => l.direction === "OUT");
    return { id: t.id, date: t.date, sealedName: sealed?.asset?.name ?? "Sealed product", ...econ };
  });

  return {
    rips,
    count: rips.length,
    totalCostCents: rips.reduce((s, r) => s + r.costCents, 0),
    totalPulledCents: rips.reduce((s, r) => s + r.pulledValueCents, 0),
    totalNetCents: rips.reduce((s, r) => s + r.netCents, 0),
    paidOffCount: rips.filter((r) => r.netCents > 0).length,
  };
}
