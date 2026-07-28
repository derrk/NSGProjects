// Read-only: what assetType do pack-like in-stock assets have? The "From a
// pack" picker only shows SealedProduct/LoosePack/Bundle.
import { prisma } from "../lib/db";

const PACKISH = /pack|booster|bundle|box|etb|elite trainer|collection|tin|blister/i;

async function main() {
  const owned = await prisma.asset.findMany({
    where: { status: "InStock", quantity: { gt: 0 } },
    select: { id: true, name: true, assetType: true, quantity: true, costBasisCents: true },
  });
  const packish = owned.filter((a) => PACKISH.test(a.name));
  console.log("in-stock pack-like assets:", packish.length);
  for (const p of packish) {
    console.log(
      `  [${p.assetType}] ${p.quantity}x ${p.name} (basis $${(p.costBasisCents / 100).toFixed(2)}/u)`,
    );
  }
  const eligible = packish.filter((p) =>
    ["SealedProduct", "LoosePack", "Bundle"].includes(p.assetType),
  );
  console.log(`\nvisible in "From a pack" picker: ${eligible.length} of ${packish.length}`);
}

main().then(() => process.exit(0));
