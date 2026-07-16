// Phase 2 of the SQLite → Postgres move: load data-export.json into the new
// database. Preserves every id, timestamp, and relation. Refuses to run
// against a non-empty database unless "force" is passed.
//
//   pnpm exec tsx scripts/import-data.ts          (safe: empty DB only)
//   pnpm exec tsx scripts/import-data.ts force    (wipes + reloads)
import { readFileSync } from "node:fs";
import { prisma } from "../lib/db";

const FORCE = process.argv[2] === "force";

function revive(rows: Record<string, unknown>[], dateKeys: string[]) {
  return rows.map((r) => {
    const out: Record<string, unknown> = { ...r };
    for (const k of dateKeys) {
      if (out[k] != null) out[k] = new Date(out[k] as string);
    }
    return out;
  });
}

async function main() {
  const data = JSON.parse(readFileSync("data-export.json", "utf8"));

  const existing = await prisma.asset.count();
  if (existing > 0 && !FORCE) {
    throw new Error(`Target DB already has ${existing} assets. Pass "force" to wipe and reload.`);
  }
  if (FORCE) {
    // Dependency order: children first.
    await prisma.syncTask.deleteMany();
    await prisma.attachment.deleteMany();
    await prisma.gradingSubmission.deleteMany();
    await prisma.transactionLine.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.asset.deleteMany();
    await prisma.show.deleteMany();
    await prisma.importBatch.deleteMany();
    await prisma.appState.deleteMany();
  }

  await prisma.show.createMany({
    data: revive(data.shows, [
      "startDate", "endDate", "enteredAt", "endedAt", "createdAt", "updatedAt",
    ]) as never,
  });
  await prisma.asset.createMany({
    data: revive(data.assets, [
      "acquiredAt", "collectrDateAdded", "marketPriceAsOf", "createdAt", "updatedAt",
    ]) as never,
  });
  await prisma.transaction.createMany({
    data: revive(data.transactions, ["date", "createdAt"]) as never,
  });
  await prisma.transactionLine.createMany({
    data: revive(data.transactionLines, []) as never,
  });
  await prisma.attachment.createMany({
    data: revive(data.attachments, ["createdAt"]) as never,
  });
  await prisma.syncTask.createMany({
    data: revive(data.syncTasks, ["createdAt", "resolvedAt"]) as never,
  });
  await prisma.gradingSubmission.createMany({
    data: revive(data.gradingSubmissions, [
      "submittedAt", "expectedReturnAt", "returnedAt", "createdAt",
    ]) as never,
  });
  await prisma.importBatch.createMany({
    data: revive(data.importBatches, ["marketPriceAsOf", "createdAt"]) as never,
  });
  await prisma.appState.createMany({ data: data.appState as never });

  console.log("imported:");
  console.log("  shows:", await prisma.show.count());
  console.log("  assets:", await prisma.asset.count());
  console.log("  transactions:", await prisma.transaction.count());
  console.log("  transactionLines:", await prisma.transactionLine.count());
  console.log("  syncTasks:", await prisma.syncTask.count());
  console.log("  gradingSubmissions:", await prisma.gradingSubmission.count());
  console.log("  importBatches:", await prisma.importBatch.count());
  console.log("  appState:", await prisma.appState.count());
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
