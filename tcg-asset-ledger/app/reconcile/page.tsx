import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { formatUSD } from "@/lib/money";
import { listPendingReconcileTasks } from "@/lib/reconcile-tasks";
import { ReconcileRow } from "./reconcile-row";

export const dynamic = "force-dynamic";

/** Loose identity for merge suggestions: one name's tokens contained in the
 *  other's (catches "Destined Rivals Pack" vs "Destined Rivals Booster Pack"). */
function tokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter(Boolean),
  );
}
function isSubset(a: Set<string>, b: Set<string>): boolean {
  for (const t of a) if (!b.has(t)) return false;
  return a.size > 0;
}

export default async function ReconcilePage() {
  const tasks = await listPendingReconcileTasks();

  const [shows, dupeCandidates] = await Promise.all([
    prisma.show.findMany({
      where: { status: { not: "Cancelled" } },
      orderBy: { startDate: "desc" },
      take: 8,
      select: { id: true, name: true },
    }),
    // Merge targets must be PLAUSIBLE imported duplicates: no ledger history of
    // their own (the server re-checks this; merging a real row would destroy
    // its quantity/basis).
    prisma.asset.findMany({
      where: {
        status: { in: ["InStock", "Grading"] },
        quantity: { gt: 0 },
        ledgerTouched: false,
      },
      select: {
        id: true,
        name: true,
        game: true,
        set: true,
        cardNumber: true,
        grade: true,
        quantity: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // Sealed products in stock — "From a pack" pulls allocate their basis.
  const packs = await prisma.asset.findMany({
    where: {
      status: "InStock",
      quantity: { gt: 0 },
      assetType: { in: ["SealedProduct", "LoosePack", "Bundle"] },
    },
    select: { id: true, name: true, quantity: true },
    orderBy: { name: "asc" },
  });
  const packCandidates = packs.map((p) => ({ id: p.id, label: `${p.name} (qty ${p.quantity})` }));

  // Wheel slots + the count of logged spins missing a prize (the pool the
  // "Wheel prize" resolution attaches to).
  const [slots, unattachedBySlot] = await Promise.all([
    prisma.wheelSlot.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, label: true },
    }),
    prisma.wheelSpin.groupBy({ by: ["slotId"], where: { assetId: null }, _count: true }),
  ]);
  const unattachedCount = new Map(unattachedBySlot.map((g) => [g.slotId, g._count]));
  const wheelSlots = slots.map((s) => ({
    id: s.id,
    label: s.label,
    openSpins: unattachedCount.get(s.id) ?? 0,
  }));

  // Header total uses the task snapshots (clamped to live stock), matching the
  // per-row default sale quantities. "Appeared" items aren't unaccounted value —
  // they're in inventory, just missing their acquisition story.
  const outTasks = tasks.filter((t) => t.kind !== "appeared");
  const appearedCount = tasks.length - outTasks.length;
  const totalValue = outTasks.reduce((s, t) => {
    const unit = t.asset.priceOverrideCents ?? t.asset.marketValueCents;
    const gap =
      t.kind === "qty-drop"
        ? Math.max(0, Math.min(t.appQty, t.asset.quantity) - (t.collectrQtyAfter ?? 0))
        : t.asset.quantity;
    return s + unit * gap;
  }, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catch-up"
        description="The ledger and Collectr disagree on these. Say what happened — the ledger does the rest."
      />

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <CheckCircle2 className="size-8 text-success" />
            <div className="font-medium">Nothing to catch up</div>
            <p className="max-w-md text-sm text-muted-foreground">
              The ledger and Collectr agree. After a busy show, import your Collectr export and
              anything you didn&apos;t get to record shows up here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{tasks.length} item(s)</span>
            {outTasks.length > 0 ? (
              <>
                {" "}
                · <span className="tnum">{formatUSD(totalValue)}</span> of unaccounted outgoing
                value
              </>
            ) : null}
            {appearedCount > 0 ? (
              <>
                {" "}
                · <span className="font-medium text-foreground">{appearedCount}</span> new from
                Collectr needing an acquisition (buy / trade / pack)
              </>
            ) : null}
            . Answer each one and the ledger posts the real transaction.
          </p>
          <div className="space-y-3">
            {tasks.map((t) => {
              const src = tokens(t.asset.name);
              const rowCandidates = dupeCandidates
                .filter((c) => c.id !== t.assetId && c.game === t.asset.game)
                .map((c) => ({
                  id: c.id,
                  label: [
                    c.name,
                    c.set,
                    c.cardNumber ? `#${c.cardNumber}` : null,
                    c.grade && c.grade !== "Ungraded" ? c.grade : null,
                    `qty ${c.quantity}`,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                }));
              const suggestion = dupeCandidates.find(
                (c) =>
                  c.id !== t.assetId &&
                  c.game === t.asset.game &&
                  (isSubset(src, tokens(c.name)) || isSubset(tokens(c.name), src)),
              );
              return (
                <ReconcileRow
                  // Remount when the underlying numbers move so stale form
                  // defaults can't survive a partial resolution.
                  key={`${t.id}:${t.asset.quantity}:${t.collectrQtyAfter ?? "x"}`}
                  task={{
                    id: t.id,
                    kind: t.kind,
                    appQty: t.appQty,
                    collectrQtyBefore: t.collectrQtyBefore,
                    collectrQtyAfter: t.collectrQtyAfter,
                    neverSeenInCollectr: t.collectrQtyBefore == null,
                    asset: {
                      id: t.asset.id,
                      name: t.asset.name,
                      set: t.asset.set,
                      cardNumber: t.asset.cardNumber,
                      grade: t.asset.grade,
                      quantity: t.asset.quantity,
                      marketUnitCents: t.asset.priceOverrideCents ?? t.asset.marketValueCents,
                      costBasisCents: t.asset.costBasisCents,
                    },
                  }}
                  shows={shows}
                  mergeCandidates={rowCandidates}
                  suggestedMergeId={suggestion?.id ?? null}
                  packCandidates={packCandidates}
                  wheelSlots={wheelSlots}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
