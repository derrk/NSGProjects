import { prisma } from "../lib/db";
import { buildNaturalKey } from "../lib/domain";

async function main() {
  const total = await prisma.asset.count();
  console.log("TOTAL ASSETS:", total);

  // Group by natural key to find any true unique-key collisions (shouldn't exist).
  const all = await prisma.asset.findMany({
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
  });

  // Find rows whose STORED naturalKey differs from a freshly-computed one.
  let staleKeys = 0;
  for (const x of all) {
    const fresh = buildNaturalKey({
      game: x.game,
      set: x.set,
      name: x.name,
      cardNumber: x.cardNumber,
      variant: x.variant,
      grade: x.grade,
      condition: x.condition,
    });
    if (fresh !== x.naturalKey) {
      staleKeys++;
      console.log("STALE KEY:", x.name, "#", x.cardNumber);
      console.log("  stored=[" + x.naturalKey + "]");
      console.log("  fresh =[" + fresh + "]");
    }
  }
  console.log("STALE KEY COUNT:", staleKeys);

  // Show near-duplicate groups by name+number (ignoring the key), to see dupes.
  const groups = new Map<string, typeof all>();
  for (const x of all) {
    const k = (x.name + "|" + (x.cardNumber ?? "")).toLowerCase();
    const g = groups.get(k) ?? [];
    g.push(x);
    groups.set(k, g);
  }
  // Dump every row for the cards the user named, regardless of grouping.
  const NEEDLES = ["Zekrom", "Charmander", "Charizard", "Chimchar", "Piplup"];
  console.log("=== ROWS MATCHING NAMED CARDS ===");
  for (const x of all) {
    if (!NEEDLES.some((n) => x.name.includes(n))) continue;
    console.log(
      `"${x.name}" #${x.cardNumber ?? "-"} set="${x.set ?? "-"}" qty=${x.quantity} src=${x.source ?? "-"} touched=${x.ledgerTouched} created=${x.createdAt.toISOString().slice(0, 19)}`,
    );
    console.log(`   nk=[${x.naturalKey}]`);
  }

  const dupes = [...groups.entries()].filter(([, g]) => g.length > 1);
  console.log("NAME+NUMBER DUPLICATE GROUPS:", dupes.length);
  for (const [k, g] of dupes.slice(0, 12)) {
    console.log("== " + k + " (" + g.length + " rows)");
    for (const x of g) {
      console.log(
        `   qty=${x.quantity} set="${x.set}" variant="${x.variant}" grade="${x.grade}" cond="${x.condition}" src=${x.source} touched=${x.ledgerTouched} created=${x.createdAt.toISOString().slice(0, 19)}`,
      );
      console.log(`     nk=[${x.naturalKey}]`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
