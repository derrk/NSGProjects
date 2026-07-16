import { prisma } from "../lib/db";

async function main() {
  const packs = await prisma.asset.findMany({
    where: { OR: [{ name: { contains: "Rivals" } }, { name: { contains: "Journey" } }] },
    select: { id: true, name: true, game: true, status: true, quantity: true, inCollectr: true },
  });
  for (const p of packs) console.log(JSON.stringify(p));
}

main().then(() => process.exit(0));
