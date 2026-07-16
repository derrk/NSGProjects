// Quick proof the show-date round-trip is lossless after the local-parse fix.
import { prisma } from "../lib/db";

function parseLocal(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)!;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function renderLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function main() {
  const input = "2026-07-12";
  const out = renderLocal(parseLocal(input));
  console.log(`round-trip ${input} -> ${out}: ${out === input ? "LOSSLESS" : "DRIFT!"}`);
  // The old UTC behavior, for contrast:
  const utcOut = renderLocal(new Date(input));
  console.log(`old UTC parse would render: ${utcOut} (tz offset ${new Date().getTimezoneOffset()}min)`);
  console.log("shows in dev.db:", await prisma.show.count());
}

main().then(() => process.exit(0));
