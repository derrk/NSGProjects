// Read-only pre-catch-up status: active show, recent shows, backlog counts.
import { prisma } from "../lib/db";

async function main() {
  const state = await prisma.appState.findUnique({ where: { id: 1 } });
  const active = state?.activeShowId
    ? await prisma.show.findUnique({ where: { id: state.activeShowId } })
    : null;
  console.log("Show Mode active:", active ? `YES — "${active.name}"` : "no");
  const shows = await prisma.show.findMany({
    orderBy: { startDate: "desc" },
    take: 3,
    select: { name: true, status: true, startDate: true },
  });
  for (const s of shows)
    console.log(`  show: ${s.name} [${s.status}] ${s.startDate.toISOString().slice(0, 10)}`);
  console.log("pending catch-up:", await prisma.reconcileTask.count({ where: { status: "pending" } }));
  console.log("pending collectr backlog:", await prisma.syncTask.count({ where: { status: "pending" } }));
  const lastImport = await prisma.importBatch.findFirst({ orderBy: { createdAt: "desc" } });
  console.log("last import:", lastImport?.createdAt.toISOString().slice(0, 16) ?? "never");
}

main().then(() => process.exit(0));
