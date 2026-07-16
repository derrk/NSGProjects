import { prisma } from "../lib/db";

async function main() {
  const assets = await prisma.asset.findMany({
    where: { name: { contains: "Katakuri" } },
    select: { name: true, status: true, quantity: true, inCollectr: true, collectrQuantity: true },
  });
  for (const a of assets) console.log(JSON.stringify(a));
  if (assets.length === 0) console.log("no Katakuri asset found");
}

main().then(() => process.exit(0));
