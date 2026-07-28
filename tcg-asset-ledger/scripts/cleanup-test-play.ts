import { prisma } from "../lib/db";

async function main() {
  const r = await prisma.gradingPlay.deleteMany({
    where: { name: "Umbreon VMAX Alt Art", assetId: null, notes: null },
  });
  console.log("deleted test rows:", r.count);
}

main().then(() => process.exit(0));
