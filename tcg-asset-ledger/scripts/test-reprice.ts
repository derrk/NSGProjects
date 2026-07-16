// Prove the match-existing fix on the HARD case: a multi-quantity lot. Logging
// a trade that receives a card already in inventory must NOT duplicate it,
// must NOT change quantity, and must blend basis correctly across the lot
// (the earlier bug wrote pool/lineQty onto every unit).
import { prisma } from "../lib/db";
import { recordTrade } from "../lib/ledger";
import { blendUnitBasis } from "../lib/costbasis";
import { formatUSD } from "../lib/money";

async function main() {
  // Prefer a multi-quantity lot to exercise the blend; fall back to any lot.
  const received =
    (await prisma.asset.findFirst({
      where: { status: "InStock", quantity: { gt: 1 } },
      orderBy: { quantity: "desc" },
    })) ??
    (await prisma.asset.findFirst({ where: { status: "InStock", quantity: { gt: 0 } } }));
  if (!received) throw new Error("no received candidate");

  const give = await prisma.asset.findFirst({
    where: { status: "InStock", costBasisCents: { gt: 0 }, id: { not: received.id } },
    orderBy: { costBasisCents: "desc" },
  });
  if (!give) throw new Error("no give candidate");

  const beforeCount = await prisma.asset.count();
  const lotQty = received.quantity;
  const oldUnit = received.costBasisCents;
  const cash = 50_00;
  const pool = give.costBasisCents + cash; // single give + cash, single received line
  const acquiredQty = 1;
  const expectedUnit = blendUnitBasis(lotQty - acquiredQty, oldUnit, acquiredQty, pool);

  console.log(`Received lot "${received.name}" qty=${lotQty} oldBasis=${formatUSD(oldUnit)}/u`);
  console.log(`Give "${give.name}" basis ${formatUSD(give.costBasisCents)} + ${formatUSD(cash)} cash -> pool ${formatUSD(pool)}`);

  await recordTrade({
    cashDeltaCents: -cash,
    given: [{ assetId: give.id, quantity: 1 }],
    received: [
      { assetId: received.id, matchMode: "reprice", quantity: acquiredQty, unitMarketValueCents: received.marketValueCents },
    ],
  });

  const afterCount = await prisma.asset.count();
  const after = await prisma.asset.findUnique({ where: { id: received.id } });

  console.log("—");
  console.log("asset count:", beforeCount, "/", afterCount, beforeCount === afterCount ? "✓ no duplicate" : "✗ DUPLICATED");
  console.log("lot qty:", lotQty, "/", after!.quantity, lotQty === after!.quantity ? "✓ unchanged" : "✗ CHANGED");
  console.log("per-unit basis:", formatUSD(after!.costBasisCents), "expected:", formatUSD(expectedUnit), after!.costBasisCents === expectedUnit ? "✓ MATCH" : "✗ MISMATCH");
  console.log("lot total basis:", formatUSD(after!.costBasisCents * after!.quantity), "(was", formatUSD(oldUnit * lotQty) + ", added pool", formatUSD(pool) + ")");
  console.log("ledgerTouched:", after!.ledgerTouched);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
