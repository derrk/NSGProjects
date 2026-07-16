// One-time backfill after adding Asset.collectrQuantity: untouched Collectr
// assets got their quantity straight from the last import, so record it.
// Ledger-touched assets stay null (unknown) — the next import records truth.
import { prisma } from "../lib/db";
import { reconcileAssetSync } from "../lib/sync-backlog";

async function main() {
  const rows = await prisma.asset.findMany({
    where: { inCollectr: true, ledgerTouched: false },
    select: { id: true, quantity: true },
  });
  for (const r of rows) {
    await prisma.asset.update({ where: { id: r.id }, data: { collectrQuantity: r.quantity } });
  }
  console.log("backfilled collectrQuantity for", rows.length, "untouched Collectr assets");

  const all = await prisma.asset.findMany({ select: { id: true } });
  for (const a of all) await reconcileAssetSync(prisma, a.id);

  const pend = await prisma.syncTask.findMany({
    where: { status: "pending" },
    include: { asset: { select: { name: true } } },
  });
  console.log("pending backlog:", pend.length);
  for (const t of pend) console.log(" ", t.kind, "-", t.asset.name);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
