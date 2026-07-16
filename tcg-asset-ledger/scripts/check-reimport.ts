// Read-only: plan a re-import of the given CSV against the current DB and report
// how many rows would CREATE vs REFRESH. After the dedupe + key normalization,
// a re-import (even zero-padded) should create 0 new rows. Also simulates a
// zero-padded export to prove resilience.
import { readFileSync } from "node:fs";
import { parseCollectrCsv } from "../lib/collectr";
import { planImport } from "../lib/import-collectr";

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("pass a CSV path");
  const raw = readFileSync(path, "utf8");

  const parsed = parseCollectrCsv(raw);
  const plan = await planImport(parsed.rows);
  console.log(`as-is:     create=${plan.createCount} refresh=${plan.refreshCount} priceOnly=${plan.priceOnlyCount} mismatch=${plan.mismatchCount}`);

  // Simulate Collectr zero-padding pure-integer card numbers (38 -> 038).
  const padded = raw.replace(/(,)(\d{1,2})(,)/g, (m, a, num, b) => `${a}0${num}${b}`);
  const parsedPad = parseCollectrCsv(padded);
  const planPad = await planImport(parsedPad.rows);
  console.log(`zero-pad:  create=${planPad.createCount} refresh=${planPad.refreshCount} priceOnly=${planPad.priceOnlyCount} mismatch=${planPad.mismatchCount}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
