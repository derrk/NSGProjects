// Regenerate Collectr sync tasks under the updated cost rule: any owned,
// in-Collectr card whose app basis (>0) differs from Collectr's known cost now
// needs an "update" task. Dry run counts; `apply` reconciles them.
import { prisma } from "../lib/db";
import { reconcileAssetSync } from "../lib/sync-backlog";
import { formatUSD } from "../lib/money";

const APPLY = process.argv[2] === "apply";

async function main() {
  const candidates = await prisma.asset.findMany({
    where: {
      inCollectr: true,
      status: { in: ["InStock", "Grading"] },
      quantity: { gt: 0 },
      collectrCostCents: { not: null },
    },
  });
  const needsUpdate = candidates.filter(
    (a) => a.costBasisCents > 0 && a.costBasisCents !== a.collectrCostCents,
  );

  console.log(`owned in-Collectr cards: ${candidates.length}`);
  console.log(`newly need a cost "update" task: ${needsUpdate.length}`);
  for (const a of needsUpdate.slice(0, 30)) {
    console.log(
      `  ${a.name}: app ${formatUSD(a.costBasisCents)} vs Collectr ${formatUSD(a.collectrCostCents ?? 0)}`,
    );
  }
  if (needsUpdate.length > 30) console.log(`  … and ${needsUpdate.length - 30} more`);

  if (APPLY) {
    for (const a of needsUpdate) await reconcileAssetSync(prisma, a.id);
    const pending = await prisma.syncTask.count({ where: { status: "pending" } });
    console.log(`\napplied. total pending sync tasks now: ${pending}`);
  } else {
    console.log("\n(dry run — pass 'apply' to create the tasks)");
  }
}

main().then(() => process.exit(0));
