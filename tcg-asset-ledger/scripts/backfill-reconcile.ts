// One-time backfill: put every currently-diverged asset on the catch-up
// backlog. Going forward, imports create these tasks at detection time.
import { prisma } from "../lib/db";
import { upsertReconcileTask } from "../lib/reconcile-tasks";

async function main() {
  // Owned here, absent from Collectr → "vanished" (sold? still-have? dupe?)
  const vanished = await prisma.asset.findMany({
    where: { inCollectr: false, status: { in: ["InStock", "Grading"] }, quantity: { gt: 0 } },
  });
  for (const a of vanished) {
    await upsertReconcileTask(prisma, a, "vanished", null, 0);
  }

  // Owned here with Collectr showing fewer → "qty-drop"
  const drops = await prisma.asset.findMany({
    where: { inCollectr: true, status: { in: ["InStock", "Grading"] }, quantity: { gt: 0 } },
  });
  let dropCount = 0;
  for (const a of drops) {
    if (a.collectrQuantity != null && a.collectrQuantity < a.quantity) {
      await upsertReconcileTask(prisma, a, "qty-drop", a.collectrQuantity, a.collectrQuantity);
      dropCount++;
    }
  }

  console.log(`backfilled: ${vanished.length} vanished, ${dropCount} qty-drop`);
  console.log("pending catch-up tasks:", await prisma.reconcileTask.count({ where: { status: "pending" } }));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
