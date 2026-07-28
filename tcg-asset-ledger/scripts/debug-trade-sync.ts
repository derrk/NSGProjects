// Read-only: inspect recent TRADE transactions and whether their given/received
// cards produced Collectr sync tasks.
import { prisma } from "../lib/db";
import { formatUSD } from "../lib/money";

async function main() {
  const trades = await prisma.transaction.findMany({
    where: { type: "TRADE" },
    orderBy: { date: "desc" },
    take: 5,
    include: { lines: { include: { asset: true } } },
  });
  console.log(`recent trades: ${trades.length}\n`);
  for (const t of trades) {
    console.log(`TRADE ${t.date.toISOString().slice(0, 10)} (cash ${formatUSD(t.cashDeltaCents)})`);
    for (const l of t.lines) {
      const a = l.asset;
      const sync = await prisma.syncTask.findMany({
        where: { assetId: a.id },
        select: { kind: true, status: true },
      });
      const rec = await prisma.reconcileTask.findMany({
        where: { assetId: a.id },
        select: { kind: true, status: true },
      });
      console.log(
        `  ${l.direction} ${a.name} | qty=${a.quantity} status=${a.status} inCollectr=${a.inCollectr} basis=${formatUSD(a.costBasisCents)} collectrCost=${a.collectrCostCents == null ? "null" : formatUSD(a.collectrCostCents)} collectrQty=${a.collectrQuantity}`,
      );
      console.log(
        `      syncTasks=[${sync.map((s) => `${s.kind}:${s.status}`).join(", ") || "none"}] reconcileTasks=[${rec.map((r) => `${r.kind}:${r.status}`).join(", ") || "none"}]`,
      );
    }
    console.log("");
  }
}

main().then(() => process.exit(0));
