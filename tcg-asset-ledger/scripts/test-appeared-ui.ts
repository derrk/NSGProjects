// Create or remove a throwaway "appeared" task for UI verification.
//   tsx scripts/test-appeared-ui.ts create   → prints task id
//   tsx scripts/test-appeared-ui.ts cleanup  → removes it
import { prisma } from "../lib/db";

const MODE = process.argv[2];
const NOTE = "__ui-test-appeared__";

async function main() {
  if (MODE === "create") {
    const asset = await prisma.asset.findFirst({
      where: { status: "InStock", quantity: { gt: 0 } },
      orderBy: { marketValueCents: "desc" },
    });
    if (!asset) throw new Error("no asset");
    const existing = await prisma.reconcileTask.findFirst({
      where: { assetId: asset.id, status: "pending" },
    });
    if (existing) {
      console.log("asset already has a pending task; using another asset");
      return;
    }
    const t = await prisma.reconcileTask.create({
      data: {
        assetId: asset.id,
        kind: "appeared",
        appQty: asset.quantity,
        collectrQtyAfter: asset.quantity,
        note: NOTE,
      },
    });
    console.log("created", t.id, "on", asset.name);
  } else if (MODE === "cleanup") {
    const del = await prisma.reconcileTask.deleteMany({ where: { note: NOTE } });
    console.log("deleted", del.count);
  }
}

main().then(() => process.exit(0));
