// End-to-end proof of the Collectr sync backlog, exercising the exact workflow:
//  1. Buy a $100-market card for $70 at a show → backlog says "add to Collectr"
//     (task derivation is atomic with the ledger posting — no explicit call).
//  2a. You add it to Collectr WITH the $70 cost → re-import → task auto-resolves
//  2b. (variant) You add it but FORGET the cost → re-import → task resolves,
//      app keeps its $70 basis (fills the gap), no nag
//  2c. (variant) You enter the WRONG cost ($65) → re-import → "update" task
//  3. Partial sale: sell 2 of a 10-lot → "update" task says fix Collectr's qty
//  4. Sell a Collectr card entirely → "remove" task; removing it from the
//     export resolves the task
//  5. Throughout: imports merge without duplication and create no transactions.
import { readFileSync } from "node:fs";
import { prisma } from "../lib/db";
import { recordBuy, recordSale } from "../lib/ledger";
import { parseCollectrCsv } from "../lib/collectr";
import { planImport, applyPlan } from "../lib/import-collectr";
import { formatUSD } from "../lib/money";

const CSV = process.argv[2];
let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

async function importCsv(text: string) {
  const parsed = parseCollectrCsv(text);
  const plan = await planImport(parsed.rows);
  const res = await applyPlan(plan, { fileName: "test", asOfDate: parsed.asOfDate });
  return { plan, res };
}

async function pendingCount() {
  return prisma.syncTask.count({ where: { status: "pending" } });
}

async function main() {
  // Normalize CRLF → LF so appended test rows split correctly (PapaParse
  // auto-detects the newline; a bare \n row in a CRLF file merges into the
  // previous line).
  const baseCsv = readFileSync(CSV, "utf8").replace(/\r\n/g, "\n");

  // ── Seed: initial full import ──────────────────────────────────────────────
  await importCsv(baseCsv);
  const assetsAfterSeed = await prisma.asset.count();
  check("seed import leaves no pending backlog", (await pendingCount()) === 0);

  // ── 1. Buy at the show: $100 market card for $70 ──────────────────────────
  await recordBuy({
    counterparty: "Show buy",
    cashPaidCents: 7000,
    received: [
      {
        name: "Umbreon VMAX (Test)",
        game: "Pokemon",
        assetType: "RawCard",
        set: "Evolving Skies",
        cardNumber: "215/203",
        variant: "Holofoil",
        grade: "Ungraded",
        condition: "Near Mint",
        quantity: 1,
        unitMarketValueCents: 10000,
      },
    ],
  });

  const addTask = await prisma.syncTask.findFirst({
    where: { status: "pending", kind: "add" },
    include: { asset: true },
  });
  check("buy created an 'add to Collectr' task (atomically)", !!addTask, addTask?.note ?? "");
  check("task carries the $70 cost basis", addTask?.asset.costBasisCents === 7000,
    formatUSD(addTask?.asset.costBasisCents ?? 0));
  const newAssetKey = addTask!.asset.naturalKey;

  // ── 2a. Added to Collectr WITH correct $70 cost → re-import resolves ──────
  const rowWithCost = `full collection,Pokemon,Evolving Skies,Umbreon VMAX (Test),215/203,Ultra Rare,Holofoil,Ungraded,Near Mint,70,1,100,0,FALSE,7/7/2026,\n`;
  const { res: res2a } = await importCsv(baseCsv.trimEnd() + "\n" + rowWithCost);
  check("re-import created no duplicate", (await prisma.asset.count()) === assetsAfterSeed + 1,
    `${await prisma.asset.count()} vs ${assetsAfterSeed + 1}`);
  check("add-task auto-resolved on import", (await pendingCount()) === 0);
  check("import reported it as synced", res2a.syncedCount === 1, `syncedCount=${res2a.syncedCount}`);
  const after2a = await prisma.asset.findUnique({ where: { naturalKey: newAssetKey } });
  check("app basis still $70 (ledger authoritative)", after2a?.costBasisCents === 7000);
  check("Collectr qty recorded from import", after2a?.collectrQuantity === 1);
  check("no duplicate transaction created by import",
    (await prisma.transaction.count({ where: { type: "BUY" } })) === 1);

  // ── 2b. Variant: forgot the cost in Collectr (0) → resolves, app fills gap ─
  await prisma.asset.update({
    where: { naturalKey: newAssetKey },
    data: { inCollectr: false, collectrCostCents: null, collectrQuantity: null },
  });
  const { reconcileAssetSync } = await import("../lib/sync-backlog");
  await reconcileAssetSync(prisma, after2a!.id);
  check("reset: add-task pending again", (await pendingCount()) === 1);
  const rowNoCost = rowWithCost.replace(",70,1,100,", ",0,1,100,");
  await importCsv(baseCsv.trimEnd() + "\n" + rowNoCost);
  check("forgot-the-price: task still resolves", (await pendingCount()) === 0);
  const after2b = await prisma.asset.findUnique({ where: { naturalKey: newAssetKey } });
  check("forgot-the-price: app keeps $70 basis (fills it in)", after2b?.costBasisCents === 7000,
    formatUSD(after2b?.costBasisCents ?? 0));

  // ── 2c. Variant: wrong cost in Collectr ($65) → 'update' nudge ────────────
  const rowWrongCost = rowWithCost.replace(",70,1,100,", ",65,1,100,");
  await importCsv(baseCsv.trimEnd() + "\n" + rowWrongCost);
  const updateTask = await prisma.syncTask.findFirst({ where: { status: "pending", kind: "update" } });
  check("wrong cost in Collectr → 'update' task", !!updateTask, updateTask?.note ?? "");
  await importCsv(baseCsv.trimEnd() + "\n" + rowWithCost);
  check("corrected cost → update-task resolves", (await pendingCount()) === 0);

  // ── 3. Partial sale: sell 2 of a 10-lot → quantity-drift 'update' task ────
  const lot = await prisma.asset.findFirst({
    where: { inCollectr: true, status: "InStock", quantity: { gte: 5 }, ledgerTouched: false },
    orderBy: { quantity: "desc" },
  });
  await recordSale({
    proceedsCents: 2000,
    given: [{ assetId: lot!.id, quantity: 2 }],
  });
  const qtyTask = await prisma.syncTask.findFirst({
    where: { status: "pending", kind: "update", assetId: lot!.id },
  });
  check(
    `partial sale (2 of ${lot!.quantity}) → quantity 'update' task`,
    !!qtyTask,
    qtyTask?.note ?? "NO TASK",
  );
  check(
    "note tells you the exact quantity to set",
    (qtyTask?.note ?? "").includes(`set quantity to ${lot!.quantity - 2}`),
  );
  // User fixes the count in Collectr → re-import with the new qty resolves it.
  const lotLine = baseCsv
    .split("\n")
    .find((l) => l.includes(lot!.name));
  const fixedLine = lotLine!.replace(`,${lot!.quantity},`, `,${lot!.quantity - 2},`);
  const csvQtyFixed = baseCsv.replace(lotLine!, fixedLine).trimEnd() + "\n" + rowWithCost;
  await importCsv(csvQtyFixed);
  check("fixed Collectr qty → update-task resolves", (await pendingCount()) === 0);

  // ── 4. Sell a Collectr card entirely → 'remove' task; absent → resolves ───
  const victim = await prisma.asset.findFirst({
    where: { inCollectr: true, status: "InStock", quantity: 1, ledgerTouched: false },
  });
  await recordSale({
    proceedsCents: 5000,
    given: [{ assetId: victim!.id, quantity: 1 }],
  });
  const removeTask = await prisma.syncTask.findFirst({ where: { status: "pending", kind: "remove" } });
  check("full sale created a 'remove from Collectr' task", !!removeTask, victim!.name);

  const withoutVictim = csvQtyFixed
    .split("\n")
    .filter((l) => !l.includes(victim!.name))
    .join("\n");
  await importCsv(withoutVictim);
  check("card gone from export → remove-task resolves", (await pendingCount()) === 0);
  const victimAfter = await prisma.asset.findUnique({ where: { id: victim!.id } });
  check("sold card stays Sold, untouched by import", victimAfter?.status === "Sold");
  check("sold card marked out of Collectr", victimAfter?.inCollectr === false);

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
