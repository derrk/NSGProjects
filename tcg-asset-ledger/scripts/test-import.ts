// One-off: import a real Collectr CSV through the full pipeline to validate
// parsing + reconciliation + DB writes. Usage:
//   DATABASE_URL="file:./dev.db" pnpm exec tsx scripts/test-import.ts <path>
import { readFileSync } from "node:fs";
import { parseCollectrCsv } from "../lib/collectr";
import { planImport, applyPlan } from "../lib/import-collectr";

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("Pass a CSV path");
  const csv = readFileSync(path, "utf8");
  const parsed = parseCollectrCsv(csv);
  console.log("Parsed rows:", parsed.rows.length);
  console.log("As-of date:", parsed.asOfDate?.toISOString().slice(0, 10));
  console.log("Parse errors:", parsed.errors);

  const plan = await planImport(parsed.rows);
  console.log("Plan → create:", plan.createCount, "refresh:", plan.refreshCount, "price-only:", plan.priceOnlyCount, "mismatch:", plan.mismatchCount);

  const res = await applyPlan(plan, { fileName: path.split(/[\\/]/).pop(), asOfDate: parsed.asOfDate });
  console.log("Applied → created:", res.created, "updated:", res.updated);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
