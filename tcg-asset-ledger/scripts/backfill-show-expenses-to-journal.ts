// One-time: move the legacy Show expense columns (tableFeeCents / hotelCents /
// travelCents / foodCents / otherCents) into the accounting journal as real
// BusinessExpense entries tagged to each show, so the books stop ignoring them.
//
// The 5 columns are being retired; this backfills the historical values. Each
// nonzero column becomes a debit to its expense account; the total is credited
// to a chosen offset account.
//
//   pnpm exec tsx scripts/backfill-show-expenses-to-journal.ts            (dry run — writes nothing)
//   pnpm exec tsx scripts/backfill-show-expenses-to-journal.ts apply cash    (credit Cash on Hand — reduces cash)
//   pnpm exec tsx scripts/backfill-show-expenses-to-journal.ts apply equity  (credit Opening Balance Equity — cash untouched)
//
// Idempotent: a show that already has a "Backfilled show expenses" entry is skipped.
import { prisma } from "../lib/db";
import { postEntry, ensureChartOfAccounts } from "../lib/accounting";
import { ACCOUNT } from "../lib/accounting-math";
import { formatUSD } from "../lib/money";

const MARKER = "Backfilled show expenses";

const APPLY = process.argv[2] === "apply";
const OFFSET_ARG = process.argv[3]; // "cash" | "equity"

// Legacy Show column -> expense account code + display label.
const COLUMN_MAP = [
  { field: "tableFeeCents", code: "show_table_fees", label: "Table fee" },
  { field: "hotelCents", code: "travel_hotel", label: "Hotel" },
  { field: "travelCents", code: "travel_fuel", label: "Travel / fuel" },
  { field: "foodCents", code: "travel_meals", label: "Food / meals" },
  { field: "otherCents", code: ACCOUNT.MISC_EXPENSE, label: "Other" },
] as const;

function offsetAccount(): { code: string; name: string } {
  if (OFFSET_ARG === "equity") return { code: ACCOUNT.OPENING_EQUITY, name: "Opening Balance Equity" };
  return { code: ACCOUNT.CASH_ON_HAND, name: "Cash on Hand" };
}

async function main() {
  if (APPLY && OFFSET_ARG !== "cash" && OFFSET_ARG !== "equity") {
    console.error('Apply requires an offset: "apply cash" (reduces cash) or "apply equity" (cash untouched).');
    process.exit(1);
  }

  const shows = await prisma.show.findMany({
    orderBy: { startDate: "asc" },
    select: {
      id: true, name: true, startDate: true,
      tableFeeCents: true, hotelCents: true, travelCents: true, foodCents: true, otherCents: true,
    },
  });

  if (APPLY) await ensureChartOfAccounts();

  let grandTotal = 0;
  let posted = 0;
  let skipped = 0;

  for (const s of shows) {
    const cols: Record<(typeof COLUMN_MAP)[number]["field"], number> = {
      tableFeeCents: s.tableFeeCents,
      hotelCents: s.hotelCents,
      travelCents: s.travelCents,
      foodCents: s.foodCents,
      otherCents: s.otherCents,
    };
    const lines = COLUMN_MAP
      .map((m) => ({ ...m, cents: cols[m.field] }))
      .filter((m) => m.cents > 0);
    const total = lines.reduce((sum, l) => sum + l.cents, 0);
    if (total === 0) continue;

    const existing = await prisma.journalEntry.findFirst({
      where: { showId: s.id, type: "BusinessExpense", description: { startsWith: MARKER } },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      console.log(`SKIP  ${s.name} — already backfilled (${formatUSD(total)})`);
      continue;
    }

    grandTotal += total;
    console.log(`\n${APPLY ? "POST" : "would post"}: ${s.name} (${s.startDate.toISOString().slice(0, 10)})`);
    for (const l of lines) {
      console.log(`    debit  ${l.label.padEnd(16)} ${l.code.padEnd(18)} ${formatUSD(l.cents)}`);
    }
    if (APPLY) {
      const off = offsetAccount();
      console.log(`    credit ${off.name.padEnd(16)} ${off.code.padEnd(18)} ${formatUSD(total)}`);
    } else {
      // Show both interpretations so the offset choice is informed.
      console.log(`    credit  (cash mode)   ${ACCOUNT.CASH_ON_HAND.padEnd(22)} ${formatUSD(total)}   ← reduces cash`);
      console.log(`    credit  (equity mode) ${ACCOUNT.OPENING_EQUITY.padEnd(22)} ${formatUSD(total)}   ← cash untouched`);
    }

    if (APPLY) {
      const off = offsetAccount();
      await postEntry({
        type: "BusinessExpense",
        description: `${MARKER} (${off.name})`,
        date: s.startDate,
        showId: s.id,
        lines: [
          ...lines.map((l) => ({ accountCode: l.code, debitCents: l.cents, creditCents: 0, memo: l.label })),
          { accountCode: off.code, debitCents: 0, creditCents: total, memo: `${MARKER} — offset` },
        ],
      });
      posted++;
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  if (APPLY) {
    console.log(`Posted ${posted} show(s), skipped ${skipped} already-backfilled.`);
    console.log(`Offset account: ${offsetAccount().name}. Grand total backfilled: ${formatUSD(grandTotal)}`);
  } else {
    console.log(`Dry run — nothing written. ${skipped} show(s) already backfilled.`);
    console.log(`Would backfill grand total: ${formatUSD(grandTotal)}`);
    console.log(`Re-run with "apply cash" or "apply equity" to post.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    // A mid-run apply failure must not swallow the outcome — print what happened
    // so the operator knows the run was partial (each show is an atomic entry).
    console.error("\nBackfill FAILED partway through:", e instanceof Error ? e.message : e);
    console.error("Re-run in dry-run mode to see which shows are already backfilled before retrying.");
    process.exit(1);
  });
