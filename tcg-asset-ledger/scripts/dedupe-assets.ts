// Merge duplicate assets created when Collectr re-exported card numbers with
// different zero-padding (e.g. "38" vs "038"). Groups assets by the NORMALIZED
// natural key and collapses each group to one row, preserving ledger history
// and using the latest Collectr snapshot for untouched cards.
//
// Dry run (default): prints what it WOULD do, changes nothing.
//   pnpm exec tsx scripts/dedupe-assets.ts
// Apply:
//   pnpm exec tsx scripts/dedupe-assets.ts apply
import { prisma } from "../lib/db";
import { buildNaturalKey } from "../lib/domain";
import { formatUSD } from "../lib/money";

const APPLY = process.argv[2] === "apply";

async function main() {
  const assets = await prisma.asset.findMany({
    include: { _count: { select: { lines: true } } },
  });

  // Group by the normalized key.
  const groups = new Map<string, typeof assets>();
  for (const a of assets) {
    const key = buildNaturalKey(a);
    const g = groups.get(key) ?? [];
    g.push(a);
    groups.set(key, g);
  }

  let mergeGroups = 0;
  let rowsDeleted = 0;
  let rekeyed = 0;
  let valueBefore = 0;
  for (const a of assets) valueBefore += (a.priceOverrideCents ?? a.marketValueCents) * a.quantity;

  for (const [key, g] of groups) {
    if (g.length === 1) {
      if (g[0].naturalKey !== key) {
        rekeyed++;
        if (APPLY) await prisma.asset.update({ where: { id: g[0].id }, data: { naturalKey: key } });
      }
      continue;
    }

    // Choose the primary: prefer one with ledger history, then most lines, then oldest.
    const sorted = [...g].sort((a, b) => {
      if (a.ledgerTouched !== b.ledgerTouched) return a.ledgerTouched ? -1 : 1;
      if (a._count.lines !== b._count.lines) return b._count.lines - a._count.lines;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const primary = sorted[0];
    const extras = sorted.slice(1);
    const newest = [...g].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    mergeGroups++;
    console.log(`\nMERGE "${primary.name}" #${primary.cardNumber ?? "-"} (${g.length} rows -> 1)`);
    for (const x of g) {
      console.log(
        `   ${x.id === primary.id ? "KEEP " : "DROP "} #${x.cardNumber} qty=${x.quantity} market=${formatUSD(x.priceOverrideCents ?? x.marketValueCents)} basis=${formatUSD(x.costBasisCents)} touched=${x.ledgerTouched} lines=${x._count.lines}`,
      );
    }

    if (!APPLY) continue;

    await prisma.$transaction(async (tx) => {
      // Preserve papertrail: move any ledger lines from extras onto the primary.
      for (const extra of extras) {
        await tx.transactionLine.updateMany({
          where: { assetId: extra.id },
          data: { assetId: primary.id },
        });
        await tx.asset.delete({ where: { id: extra.id } });
        rowsDeleted++;
      }
      // Refresh pricing to the newest snapshot; for untouched primaries also
      // adopt the newest quantity/basis (latest Collectr truth). Ledger-owned
      // rows keep their quantity/basis.
      await tx.asset.update({
        where: { id: primary.id },
        data: {
          naturalKey: key,
          marketValueCents: newest.marketValueCents,
          priceOverrideCents: newest.priceOverrideCents,
          marketPriceAsOf: newest.marketPriceAsOf,
          ...(primary.ledgerTouched
            ? {}
            : { quantity: newest.quantity, costBasisCents: newest.costBasisCents }),
        },
      });
    });
  }

  const after = await prisma.asset.findMany({
    select: { quantity: true, marketValueCents: true, priceOverrideCents: true },
  });
  let valueAfter = 0;
  for (const a of after) valueAfter += (a.priceOverrideCents ?? a.marketValueCents) * a.quantity;

  console.log("\n─── SUMMARY ───");
  console.log("mode:", APPLY ? "APPLY" : "DRY RUN");
  console.log("duplicate groups merged:", mergeGroups);
  console.log("singletons re-keyed:", rekeyed);
  console.log("rows deleted:", APPLY ? rowsDeleted : "(dry run)");
  console.log("assets:", assets.length, "->", APPLY ? after.length : "(dry run — unchanged)");
  console.log("inventory value before:", formatUSD(valueBefore));
  if (APPLY) console.log("inventory value after:", formatUSD(valueAfter));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
