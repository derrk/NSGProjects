// v0.2 end-to-end proof on a throwaway DB. Exercises the spec's critical
// design principle — ONE asset, full lifecycle, identity never lost:
//   Bought → Sent to PSA → Returned PSA 10 → Taken to a show → Sold → Profit
// Plus: show-mode auto-stamping, show summary math, grading basis math (spec's
// $317 + $100 fees = $417 example), and brick/aging metrics.
import { prisma } from "../lib/db";
import { recordBuy, recordSale, recordGradingSubmit, recordGradingReturn } from "../lib/ledger";
import { enterShowMode, endShowMode, computeShowSummary } from "../lib/shows";
import { ensureChartOfAccounts, postEntry } from "../lib/accounting";
import { formatUSD } from "../lib/money";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

async function main() {
  // ── Chapter 1: Bought ───────────────────────────────────────────────────────
  await recordBuy({
    counterparty: "LCS",
    cashPaidCents: 317_00,
    received: [
      {
        name: "Charizard Base Set",
        game: "Pokemon",
        assetType: "RawCard",
        set: "Base Set",
        cardNumber: "4",
        variant: "Holofoil",
        grade: "Ungraded",
        condition: "Near Mint",
        quantity: 1,
        unitMarketValueCents: 700_00,
      },
    ],
  });
  const card = await prisma.asset.findFirstOrThrow({ where: { name: "Charizard Base Set" } });
  const cardId = card.id;
  check("bought: basis = $317", card.costBasisCents === 317_00, formatUSD(card.costBasisCents));
  check("bought: acquiredAt set", card.acquiredAt !== null);

  // ── Chapter 2: Sent to PSA (spec example: 317 + 12 + 8 + 80 = 417) ─────────
  await recordGradingSubmit({
    assetId: cardId,
    company: "PSA",
    serviceLevel: "Regular",
    shippingCents: 12_00,
    insuranceCents: 8_00,
    feeCents: 80_00,
  });
  const grading = await prisma.asset.findUniqueOrThrow({ where: { id: cardId } });
  check("submit: status Grading", grading.status === "Grading");
  check(
    "submit: basis $317 + $12 + $8 + $80 = $417 (spec example)",
    grading.costBasisCents === 417_00,
    formatUSD(grading.costBasisCents),
  );
  check(
    "submit: sync backlog treats Grading as still owned (no remove task)",
    (await prisma.syncTask.count({ where: { assetId: cardId, kind: "remove", status: "pending" } })) === 0,
  );

  // Can't double-submit
  let threw = false;
  try {
    await recordGradingSubmit({ assetId: cardId, company: "PSA", shippingCents: 0, insuranceCents: 0, feeCents: 0 });
  } catch {
    threw = true;
  }
  check("submit: double-submission rejected", threw);

  // Grading-window integrity: the card can't be sold while at PSA…
  threw = false;
  try {
    await recordSale({ proceedsCents: 100_00, given: [{ assetId: cardId, quantity: 1 }] });
  } catch (e) {
    threw = e instanceof Error && e.message.includes("out for grading");
  }
  check("guard: selling a card at PSA is blocked", threw);

  // …and buying an identical raw copy can't silently merge into the grading lot.
  threw = false;
  try {
    await recordBuy({
      cashPaidCents: 200_00,
      received: [
        {
          name: "Charizard Base Set",
          game: "Pokemon",
          assetType: "RawCard",
          set: "Base Set",
          cardNumber: "4",
          variant: "Holofoil",
          grade: "Ungraded",
          condition: "Near Mint",
          quantity: 1,
          unitMarketValueCents: 700_00,
        },
      ],
    });
  } catch (e) {
    threw = e instanceof Error && e.message.includes("out for grading");
  }
  check("guard: buying an identical copy during grading is blocked", threw);

  // ── Chapter 3: Returned PSA 10 ─────────────────────────────────────────────
  const sub = await prisma.gradingSubmission.findFirstOrThrow({ where: { assetId: cardId, status: "Out" } });
  await recordGradingReturn({
    submissionId: sub.id,
    grade: "PSA 10",
    certNumber: "12345678",
    newMarketValueCents: 1800_00,
  });
  const returned = await prisma.asset.findUniqueOrThrow({ where: { id: cardId } });
  check("return: SAME asset id (identity preserved)", returned.id === cardId);
  check("return: status back InStock", returned.status === "InStock");
  check("return: grade PSA 10 + cert stored", returned.grade === "PSA 10" && returned.certNumber === "12345678");
  check("return: type GradedCard", returned.assetType === "GradedCard");
  check("return: market $1,800", returned.marketValueCents === 1800_00);
  check("return: basis still $417", returned.costBasisCents === 417_00);
  const roi = ((1800_00 - 417_00) / 417_00) * 100;
  check(`return: unrealized ${formatUSD(1800_00 - 417_00)}, ROI ${roi.toFixed(0)}% (spec ~300%)`, Math.round(roi) === 332 || roi > 300);
  check(
    "return: backlog says add graded version to Collectr",
    (await prisma.syncTask.count({ where: { assetId: cardId, kind: "add", status: "pending" } })) === 1,
  );

  // ── Chapter 4: Taken to Dallas Card Show (Show Mode) ───────────────────────
  const show = await prisma.show.create({
    data: {
      name: "Dallas Card Show",
      city: "Dallas",
      startDate: new Date(),
    },
  });
  // Show expenses are journal entries tagged to the show (the 5 legacy columns
  // were retired). Post $470 of operating expenses so the summary can net them.
  await ensureChartOfAccounts();
  await postEntry({
    type: "BusinessExpense",
    description: "Show expenses",
    showId: show.id,
    lines: [
      { accountCode: "show_table_fees", debitCents: 150_00, creditCents: 0 },
      { accountCode: "travel_hotel", debitCents: 200_00, creditCents: 0 },
      { accountCode: "travel_fuel", debitCents: 80_00, creditCents: 0 },
      { accountCode: "travel_meals", debitCents: 40_00, creditCents: 0 },
      { accountCode: "cash_on_hand", debitCents: 0, creditCents: 470_00 },
    ],
  });
  await enterShowMode({ showId: show.id, buyingCashCents: 1000_00, personalCashCents: 100_00 });
  const activeShow = await prisma.show.findUniqueOrThrow({ where: { id: show.id } });
  check("show mode: active + snapshot taken", activeShow.status === "Active" && (activeShow.snapshotValueCents ?? 0) > 0,
    `snapshot ${formatUSD(activeShow.snapshotValueCents ?? 0)}`);

  // Can't enter another show while one is active
  threw = false;
  try {
    await enterShowMode({ showId: "nonexistent", buyingCashCents: 0, personalCashCents: 0 });
  } catch {
    threw = true;
  }
  check("show mode: second show blocked while active", threw);

  // A buy during the show auto-stamps showId + source
  await recordBuy({
    counterparty: "Vendor booth",
    cashPaidCents: 50_00,
    received: [
      {
        name: "Show Pickup Card",
        game: "Pokemon",
        assetType: "RawCard",
        quantity: 1,
        unitMarketValueCents: 80_00,
      },
    ],
  });
  const showBuy = await prisma.transaction.findFirstOrThrow({
    where: { type: "BUY", counterparty: "Vendor booth" },
  });
  check("show mode: buy auto-tagged with showId", showBuy.showId === show.id);
  check('show mode: source auto-set to "Show"', showBuy.source === "Show");

  // ── Chapter 5: Sold (at the show) ──────────────────────────────────────────
  await recordSale({
    counterparty: "Collector",
    proceedsCents: 1750_00,
    given: [{ assetId: cardId, quantity: 1, unitValueCents: 1750_00 }],
  });
  const sold = await prisma.asset.findUniqueOrThrow({ where: { id: cardId } });
  check("sold: status Sold, qty 0, same id", sold.status === "Sold" && sold.quantity === 0);
  const saleTxn = await prisma.transaction.findFirstOrThrow({ where: { type: "SALE" } });
  check("sold: sale auto-tagged to show", saleTxn.showId === show.id);

  // ── Chapter 6: Profit calculated (show summary) ────────────────────────────
  await endShowMode({ endingCashCents: 2700_00 });
  const summary = await computeShowSummary(show.id);
  check("summary: revenue $1,750", summary.revenueCents === 1750_00, formatUSD(summary.revenueCents));
  check("summary: COGS $417", summary.cogsCents === 417_00, formatUSD(summary.cogsCents));
  check("summary: realized profit $1,333", summary.realizedProfitCents === 1333_00, formatUSD(summary.realizedProfitCents));
  check("summary: expenses $470", summary.expensesCents === 470_00, formatUSD(summary.expensesCents));
  check("summary: NET PROFIT $863", summary.netProfitCents === 863_00, formatUSD(summary.netProfitCents));
  check("summary: buying cash used $50", summary.buyingCashUsedCents === 50_00);
  const endedShow = await prisma.show.findUniqueOrThrow({ where: { id: show.id } });
  check("show completed + mode released", endedShow.status === "Completed" &&
    (await prisma.appState.findUnique({ where: { id: 1 } }))?.activeShowId === null);

  // ── Papertrail: the full life story on ONE asset ───────────────────────────
  const lines = await prisma.transactionLine.findMany({
    where: { assetId: cardId },
    include: { transaction: { select: { type: true } } },
    orderBy: { transaction: { date: "asc" } },
  });
  const story = lines.map((l) => l.transaction.type).join(" → ");
  check(
    "papertrail: BUY → GRADING_SUBMIT → GRADING_RETURN → SALE on one asset",
    story === "BUY → GRADING_SUBMIT → GRADING_RETURN → SALE",
    story,
  );

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
