// Phase 1 of the SQLite → Postgres move: dump every table to JSON while the
// Prisma client still speaks SQLite. scripts/import-data.ts loads it after the
// provider switch. IDs and timestamps are preserved verbatim.
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/db";

async function main() {
  const data = {
    exportedAt: new Date().toISOString(),
    shows: await prisma.show.findMany(),
    assets: await prisma.asset.findMany(),
    transactions: await prisma.transaction.findMany(),
    transactionLines: await prisma.transactionLine.findMany(),
    attachments: await prisma.attachment.findMany(),
    syncTasks: await prisma.syncTask.findMany(),
    gradingSubmissions: await prisma.gradingSubmission.findMany(),
    importBatches: await prisma.importBatch.findMany(),
    appState: await prisma.appState.findMany(),
  };
  writeFileSync("data-export.json", JSON.stringify(data, null, 1));
  console.log("exported:");
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) console.log(`  ${k}: ${v.length}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
