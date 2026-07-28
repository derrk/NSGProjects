// Backup of the orphaned wheel tables (feature removed from the app; tables
// still in Neon). Uses raw SQL since the models are gone from the client.
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/db";

async function main() {
  const slots = await prisma.$queryRawUnsafe('SELECT * FROM "WheelSlot"');
  const spins = await prisma.$queryRawUnsafe('SELECT * FROM "WheelSpin"');
  writeFileSync(
    "wheel-data-backup.json",
    JSON.stringify({ exportedAt: new Date().toISOString(), slots, spins }, null, 1),
  );
  console.log(
    "backed up:",
    (slots as unknown[]).length,
    "slots,",
    (spins as unknown[]).length,
    "spins → wheel-data-backup.json",
  );
}

main().then(() => process.exit(0));
