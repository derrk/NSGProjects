// Read-only: explain the gap between app inventory value and Collectr.
// Buckets every owned asset by its Collectr sync state and totals the value.
import { prisma } from "../lib/db";
import { formatUSD } from "../lib/money";

const val = (a: { priceOverrideCents: number | null; marketValueCents: number }) =>
  a.priceOverrideCents ?? a.marketValueCents;

async function main() {
  const owned = await prisma.asset.findMany({
    where: { status: { in: ["InStock", "Grading"] }, quantity: { gt: 0 } },
  });

  let total = 0;
  let inCollectrMatched = 0; // in Collectr, quantities agree (or unknown)
  const notInCollectr: { name: string; qty: number; value: number; status: string }[] = [];
  const qtyDrift: { name: string; appQty: number; collectrQty: number; excessValue: number }[] = [];

  for (const a of owned) {
    const v = val(a) * a.quantity;
    total += v;
    if (!a.inCollectr) {
      notInCollectr.push({ name: a.name, qty: a.quantity, value: v, status: a.status });
    } else if (a.collectrQuantity != null && a.quantity > a.collectrQuantity) {
      qtyDrift.push({
        name: a.name,
        appQty: a.quantity,
        collectrQty: a.collectrQuantity,
        excessValue: val(a) * (a.quantity - a.collectrQuantity),
      });
    } else {
      inCollectrMatched += v;
    }
  }

  const notInSum = notInCollectr.reduce((s, x) => s + x.value, 0);
  const driftSum = qtyDrift.reduce((s, x) => s + x.excessValue, 0);

  console.log("TOTAL owned value (app):", formatUSD(total));
  console.log("  matched in Collectr:  ", formatUSD(inCollectrMatched));
  console.log("  NOT in Collectr:      ", formatUSD(notInSum), `(${notInCollectr.length} lots)`);
  console.log("  qty drift excess:     ", formatUSD(driftSum), `(${qtyDrift.length} lots)`);
  console.log("  → implied Collectr value:", formatUSD(total - notInSum - driftSum));

  console.log("\n─ NOT IN COLLECTR (sold at show? or needs adding) ─");
  notInCollectr
    .sort((a, b) => b.value - a.value)
    .forEach((x) =>
      console.log(`  ${formatUSD(x.value).padStart(9)}  ${x.qty}x ${x.name} [${x.status}]`),
    );

  if (qtyDrift.length) {
    console.log("\n─ QUANTITY DRIFT (app has more than Collectr) ─");
    qtyDrift
      .sort((a, b) => b.excessValue - a.excessValue)
      .forEach((x) =>
        console.log(
          `  ${formatUSD(x.excessValue).padStart(9)}  ${x.name}: app ${x.appQty} vs Collectr ${x.collectrQty}`,
        ),
      );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
