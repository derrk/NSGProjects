// Prize-wheel analytics — derived live from WheelSpin rows (which carry
// allocated revenue + resolved prize cost per spin).
import { prisma } from "./db";

export interface WheelSlotStats {
  id: string;
  label: string;
  active: boolean;
  estCostCents: number;
  hits: number;
  hitRatePct: number | null; // null when no spins recorded yet
  revenueCents: number;
  prizeCostCents: number;
  netCents: number;
}

export interface WheelShowStats {
  showId: string | null;
  showName: string;
  spins: number;
  revenueCents: number;
  prizeCostCents: number;
  netCents: number;
}

export interface WheelTierStats {
  /** Spins per session: 1, 3, 5 — or the exact count for off-tier sessions. */
  spinsPerSession: number;
  sessions: number;
  spins: number;
  revenueCents: number;
  avgPerSessionCents: number;
}

export interface WheelStats {
  totalSpins: number;
  totalSessions: number;
  revenueCents: number;
  prizeCostCents: number;
  profitCents: number;
  avgRevenuePerSpinCents: number;
  slots: WheelSlotStats[];
  shows: WheelShowStats[];
  tiers: WheelTierStats[];
}

export async function getWheelSlots(activeOnly = false) {
  return prisma.wheelSlot.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function getWheelStats(): Promise<WheelStats> {
  const [slots, spins] = await Promise.all([
    prisma.wheelSlot.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.wheelSpin.findMany({
      include: { show: { select: { id: true, name: true } } },
    }),
  ]);

  const totalSpins = spins.length;
  let revenueCents = 0;
  let prizeCostCents = 0;

  const bySlot = new Map<string, { hits: number; revenue: number; cost: number }>();
  const byShow = new Map<string, WheelShowStats>();
  // Spins bought together share a revenue transaction — that's a session.
  const bySession = new Map<string, { spins: number; revenue: number }>();

  for (const s of spins) {
    revenueCents += s.revenueCents;
    prizeCostCents += s.prizeCostCents;

    const sessionKey = s.revenueTransactionId ?? s.id;
    const session = bySession.get(sessionKey) ?? { spins: 0, revenue: 0 };
    session.spins++;
    session.revenue += s.revenueCents;
    bySession.set(sessionKey, session);

    const slot = bySlot.get(s.slotId) ?? { hits: 0, revenue: 0, cost: 0 };
    slot.hits++;
    slot.revenue += s.revenueCents;
    slot.cost += s.prizeCostCents;
    bySlot.set(s.slotId, slot);

    const showKey = s.showId ?? "none";
    const show =
      byShow.get(showKey) ??
      ({
        showId: s.showId,
        showName: s.show?.name ?? "No show (off-show spins)",
        spins: 0,
        revenueCents: 0,
        prizeCostCents: 0,
        netCents: 0,
      } satisfies WheelShowStats);
    show.spins++;
    show.revenueCents += s.revenueCents;
    show.prizeCostCents += s.prizeCostCents;
    show.netCents = show.revenueCents - show.prizeCostCents;
    byShow.set(showKey, show);
  }

  // Sessions bucketed by spins-per-session (1 / 3 / 5 / anything else).
  const byTier = new Map<number, { sessions: number; spins: number; revenue: number }>();
  for (const s of bySession.values()) {
    const t = byTier.get(s.spins) ?? { sessions: 0, spins: 0, revenue: 0 };
    t.sessions++;
    t.spins += s.spins;
    t.revenue += s.revenue;
    byTier.set(s.spins, t);
  }
  const tiers: WheelTierStats[] = [...byTier.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([spinsPerSession, t]) => ({
      spinsPerSession,
      sessions: t.sessions,
      spins: t.spins,
      revenueCents: t.revenue,
      avgPerSessionCents: t.sessions > 0 ? Math.round(t.revenue / t.sessions) : 0,
    }));

  return {
    totalSpins,
    totalSessions: bySession.size,
    revenueCents,
    prizeCostCents,
    profitCents: revenueCents - prizeCostCents,
    avgRevenuePerSpinCents: totalSpins > 0 ? Math.round(revenueCents / totalSpins) : 0,
    tiers,
    slots: slots.map((sl) => {
      const s = bySlot.get(sl.id) ?? { hits: 0, revenue: 0, cost: 0 };
      return {
        id: sl.id,
        label: sl.label,
        active: sl.active,
        estCostCents: sl.estCostCents,
        hits: s.hits,
        hitRatePct: totalSpins > 0 ? (s.hits / totalSpins) * 100 : null,
        revenueCents: s.revenue,
        prizeCostCents: s.cost,
        netCents: s.revenue - s.cost,
      };
    }),
    shows: [...byShow.values()].sort((a, b) => b.spins - a.spins),
  };
}

export async function getRecentSpins(limit = 25) {
  return prisma.wheelSpin.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      slot: { select: { label: true } },
      asset: { select: { id: true, name: true } },
      show: { select: { name: true } },
    },
  });
}
