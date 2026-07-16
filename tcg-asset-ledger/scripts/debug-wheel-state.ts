import { prisma } from "../lib/db";
import { formatUSD } from "../lib/money";

async function main() {
  const spins = await prisma.wheelSpin.findMany({
    include: { slot: { select: { label: true } }, asset: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  console.log("total spins logged:", spins.length);
  let revenue = 0;
  for (const s of spins) {
    revenue += s.revenueCents;
    console.log(
      `  ${s.date.toISOString().slice(0, 10)} slot="${s.slot.label}" prize=${s.asset?.name ?? "(none/bundle)"} rev=${formatUSD(s.revenueCents)} cost=${formatUSD(s.prizeCostCents)}`,
    );
  }
  if (spins.length) console.log("avg revenue/spin:", formatUSD(Math.round(revenue / spins.length)));
  const slots = await prisma.wheelSlot.findMany({ select: { label: true, active: true } });
  console.log("slots:", slots.map((s) => `${s.label}${s.active ? "" : " (retired)"}`).join(", "));
}

main().then(() => process.exit(0));
