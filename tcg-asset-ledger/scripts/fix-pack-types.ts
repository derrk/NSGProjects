// One-time: retype in-stock sealed products that imports classified as
// RawCard. Uses the same conservative heuristic as the parser (packish word in
// the name OUTSIDE parentheses + no card number). naturalKey doesn't include
// assetType, so this is Collectr-sync-safe.
//
//   pnpm exec tsx scripts/fix-pack-types.ts        (dry run)
//   pnpm exec tsx scripts/fix-pack-types.ts apply
import { prisma } from "../lib/db";
import { inferSealedAssetType } from "../lib/domain";

const APPLY = process.argv[2] === "apply";

async function main() {
  const candidates = await prisma.asset.findMany({
    where: { assetType: "RawCard" },
    select: { id: true, name: true, cardNumber: true, grade: true, quantity: true, status: true },
  });
  let changed = 0;
  for (const a of candidates) {
    const inferred = inferSealedAssetType(a.name, a.cardNumber, a.grade);
    if (inferred !== "RawCard") {
      changed++;
      console.log(`  ${APPLY ? "FIX" : "would fix"}: [${inferred}] ${a.name} (qty ${a.quantity}, ${a.status})`);
      if (APPLY) {
        await prisma.asset.update({ where: { id: a.id }, data: { assetType: inferred } });
      }
    }
  }
  console.log(`${APPLY ? "updated" : "would update"}: ${changed} asset(s)`);
}

main().then(() => process.exit(0));
