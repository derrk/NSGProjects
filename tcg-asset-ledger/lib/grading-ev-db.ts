// Server data layer for the EV grading analyzer. Loads cards + their latest
// price/gem snapshots, converts cents → dollars, and runs the pure engine.

import { prisma } from "./db";
import {
  DEFAULT_EV_CONFIG,
  evaluateCard,
  type EvConfig,
  type CardInputs,
  type EvResult,
} from "./grading-ev";

const DAY = 86400000;

export async function getEvConfig(): Promise<EvConfig> {
  const row = await prisma.gradingConfig.findUnique({ where: { id: 1 } });
  if (!row) return DEFAULT_EV_CONFIG;
  return { ...DEFAULT_EV_CONFIG, ...(row.values as Partial<EvConfig>) };
}

export async function saveEvConfig(patch: Partial<EvConfig>): Promise<void> {
  const values = { ...(await getEvConfig()), ...patch };
  await prisma.gradingConfig.upsert({
    where: { id: 1 },
    create: { id: 1, values },
    update: { values },
  });
}

export interface GradeCardView {
  id: string;
  name: string;
  game: string;
  set: string | null;
  cardNumber: string | null;
  language: string;
  rarity: string | null;
  notes: string | null;
  targetRoiPct: number | null;
  // latest price snapshot (cents; null if none)
  rawCents: number | null;
  psa10Cents: number | null;
  psa9Cents: number | null;
  psa8Cents: number | null;
  sales30d: number | null;
  source: string | null;
  snapshotDate: string | null;
  // latest gem
  gemPop10: number | null;
  gemPopTotal: number | null;
  gemRate: number | null;
  gemIsDefault: boolean;
  dataAgeDays: number | null;
  result: EvResult | null;
}

type CardWithSnaps = {
  id: string; name: string; game: string; set: string | null; cardNumber: string | null;
  language: string; rarity: string | null; notes: string | null; targetRoiPct: number | null;
  priceSnapshots: { date: Date; rawCents: number; psa10Cents: number; psa9Cents: number | null; psa8Cents: number | null; sales30d: number | null; source: string }[];
  gemSnapshots: { pop10: number; popTotal: number }[];
};

export function buildCardView(c: CardWithSnaps, now: Date, cfg: EvConfig): GradeCardView {
  const price = c.priceSnapshots[0] ?? null;
  const gem = c.gemSnapshots[0] ?? null;
  const realGemRate = gem && gem.popTotal > 0 ? gem.pop10 / gem.popTotal : null;
  const defaultGem = cfg.defaultGemByGame[c.game] ?? null;
  const gemRate = realGemRate ?? defaultGem;
  const gemIsDefault = realGemRate == null && defaultGem != null;

  let result: EvResult | null = null;
  let dataAgeDays: number | null = null;
  if (price && gemRate != null) {
    dataAgeDays = Math.max(0, Math.floor((now.getTime() - price.date.getTime()) / DAY));
    const cardCfg: EvConfig = c.targetRoiPct != null ? { ...cfg, targetRoiFloor: c.targetRoiPct / 100 } : cfg;
    const inp: CardInputs = {
      rawPrice: price.rawCents / 100,
      psa10Price: price.psa10Cents / 100,
      psa9Price: price.psa9Cents != null ? price.psa9Cents / 100 : null,
      psa8Price: price.psa8Cents != null ? price.psa8Cents / 100 : null,
      gemRate,
      sales30d: price.sales30d ?? null,
      dataAgeDays,
    };
    result = evaluateCard(inp, cardCfg);
  }

  return {
    id: c.id, name: c.name, game: c.game, set: c.set, cardNumber: c.cardNumber,
    language: c.language, rarity: c.rarity, notes: c.notes, targetRoiPct: c.targetRoiPct,
    rawCents: price?.rawCents ?? null,
    psa10Cents: price?.psa10Cents ?? null,
    psa9Cents: price?.psa9Cents ?? null,
    psa8Cents: price?.psa8Cents ?? null,
    sales30d: price?.sales30d ?? null,
    source: price?.source ?? null,
    snapshotDate: price ? price.date.toISOString() : null,
    gemPop10: gem?.pop10 ?? null,
    gemPopTotal: gem?.popTotal ?? null,
    gemRate,
    gemIsDefault,
    dataAgeDays,
    result,
  };
}

export async function listGradeCards(now: Date, cfg: EvConfig): Promise<GradeCardView[]> {
  const cards = await prisma.gradeCard.findMany({
    orderBy: { name: "asc" },
    include: {
      priceSnapshots: { orderBy: { date: "desc" }, take: 1 },
      gemSnapshots: { orderBy: { date: "desc" }, take: 1 },
    },
  });
  return cards.map((c) => buildCardView(c, now, cfg));
}
