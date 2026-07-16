// One-time backfill for Asset.acquiredAt (drives days-held / brick aging):
// Collectr "Date Added" if present, else the earliest IN ledger line's date,
// else the row's createdAt.
import { prisma } from "../lib/db";

async function main() {
  const assets = await prisma.asset.findMany({
    where: { acquiredAt: null },
    select: { id: true, collectrDateAdded: true, createdAt: true },
  });
  let n = 0;
  for (const a of assets) {
    let acquiredAt = a.collectrDateAdded;
    if (!acquiredAt) {
      const firstIn = await prisma.transactionLine.findFirst({
        where: { assetId: a.id, direction: "IN" },
        orderBy: { transaction: { date: "asc" } },
        include: { transaction: { select: { date: true } } },
      });
      acquiredAt = firstIn?.transaction.date ?? a.createdAt;
    }
    await prisma.asset.update({ where: { id: a.id }, data: { acquiredAt } });
    n++;
  }
  console.log(`backfilled acquiredAt for ${n} assets`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
