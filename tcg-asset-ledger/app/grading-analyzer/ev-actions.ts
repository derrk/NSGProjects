"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { saveEvConfig } from "@/lib/grading-ev-db";
import { DEFAULT_EV_CONFIG, type EvConfig } from "@/lib/grading-ev";
import { getPriceSource, type GradedQuote } from "@/lib/price-sources";

type Result = { ok: true; id?: string; message?: string } | { ok: false; error: string };

function toLocalDate(s: string | null | undefined): Date | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}
const revalidate = () => revalidatePath("/grading-analyzer");

const cents = z.number().int().nonnegative();
const cardSchema = z.object({
  name: z.string().min(1, "Card name is required"),
  game: z.string().default("One Piece"),
  set: z.string().nullish(),
  cardNumber: z.string().nullish(),
  language: z.string().default("EN"),
  rarity: z.string().nullish(),
  notes: z.string().nullish(),
  targetRoiPct: z.number().int().nullish(),
  rawCents: cents,
  psa10Cents: cents,
  psa9Cents: cents.nullish(),
  psa8Cents: cents.nullish(),
  sales30d: z.number().int().nonnegative().nullish(),
  source: z.string().default("manual"),
  gemPct: z.number().nonnegative().nullish(),
  pop10: z.number().int().nonnegative().nullish(),
  popTotal: z.number().int().positive().nullish(),
  date: z.string().nullish(),
});

function gemFrom(d: { pop10?: number | null; popTotal?: number | null; gemPct?: number | null }): { pop10: number; popTotal: number } | null {
  if (d.pop10 != null && d.popTotal != null && d.popTotal > 0) return { pop10: d.pop10, popTotal: d.popTotal };
  if (d.gemPct != null && d.gemPct > 0) return { pop10: Math.round(d.gemPct), popTotal: 100 };
  return null;
}

export async function addGradeCard(input: unknown): Promise<Result> {
  const p = cardSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid" };
  const d = p.data;
  try {
    const date = toLocalDate(d.date) ?? new Date();
    const gem = gemFrom(d);
    const card = await prisma.gradeCard.create({
      data: {
        name: d.name.trim(), game: d.game, set: d.set || null, cardNumber: d.cardNumber || null,
        language: d.language, rarity: d.rarity || null, notes: d.notes || null, targetRoiPct: d.targetRoiPct ?? null,
        priceSnapshots: {
          create: { date, rawCents: d.rawCents, psa10Cents: d.psa10Cents, psa9Cents: d.psa9Cents ?? null, psa8Cents: d.psa8Cents ?? null, sales30d: d.sales30d ?? null, source: d.source },
        },
        ...(gem ? { gemSnapshots: { create: { date, pop10: gem.pop10, popTotal: gem.popTotal, source: d.source } } } : {}),
      },
    });
    revalidate();
    return { ok: true, id: card.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't add the card." };
  }
}

const snapshotSchema = z.object({
  cardId: z.string().min(1),
  rawCents: cents,
  psa10Cents: cents,
  psa9Cents: cents.nullish(),
  psa8Cents: cents.nullish(),
  sales30d: z.number().int().nonnegative().nullish(),
  gemPct: z.number().nonnegative().nullish(),
  pop10: z.number().int().nonnegative().nullish(),
  popTotal: z.number().int().positive().nullish(),
  source: z.string().default("manual"),
  date: z.string().nullish(),
});

export async function addSnapshot(input: unknown): Promise<Result> {
  const p = snapshotSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid" };
  const d = p.data;
  try {
    const date = toLocalDate(d.date) ?? new Date();
    await prisma.priceSnapshot.create({
      data: { gradeCardId: d.cardId, date, rawCents: d.rawCents, psa10Cents: d.psa10Cents, psa9Cents: d.psa9Cents ?? null, psa8Cents: d.psa8Cents ?? null, sales30d: d.sales30d ?? null, source: d.source },
    });
    const gem = gemFrom(d);
    if (gem) await prisma.gemSnapshot.create({ data: { gradeCardId: d.cardId, date, pop10: gem.pop10, popTotal: gem.popTotal, source: d.source } });
    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't add the snapshot." };
  }
}

export async function updateGradeCard(id: string, input: unknown): Promise<Result> {
  const schema = z.object({ name: z.string().min(1).optional(), game: z.string().optional(), set: z.string().nullish(), cardNumber: z.string().nullish(), language: z.string().optional(), rarity: z.string().nullish(), notes: z.string().nullish(), targetRoiPct: z.number().int().nullish() });
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid" };
  try {
    const d = p.data;
    await prisma.gradeCard.update({ where: { id }, data: { name: d.name, game: d.game, set: d.set !== undefined ? d.set || null : undefined, cardNumber: d.cardNumber !== undefined ? d.cardNumber || null : undefined, language: d.language, rarity: d.rarity !== undefined ? d.rarity || null : undefined, notes: d.notes !== undefined ? d.notes || null : undefined, targetRoiPct: d.targetRoiPct } });
    revalidate();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't update." };
  }
}

export async function deleteGradeCard(id: string): Promise<Result> {
  try {
    await prisma.gradeCard.delete({ where: { id } });
    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't delete." };
  }
}

export async function saveGradingConfigAction(patch: Partial<EvConfig>): Promise<Result> {
  try {
    // Only accept known numeric/boolean keys to avoid junk in the blob.
    const clean: Partial<EvConfig> = {};
    for (const k of Object.keys(DEFAULT_EV_CONFIG) as (keyof EvConfig)[]) {
      if (k in patch && patch[k] !== undefined) (clean as Record<string, unknown>)[k] = patch[k];
    }
    await saveEvConfig(clean);
    revalidate();
    return { ok: true, message: "Config saved." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save config." };
  }
}

const csvRow = cardSchema; // same shape; the client maps CSV → this
export async function importGradeCards(rows: unknown): Promise<Result> {
  const parsed = z.array(csvRow).max(5000).safeParse(rows);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid CSV rows" };
  try {
    const key = (r: { name: string; set?: string | null; cardNumber?: string | null; language: string; game: string }) =>
      [r.game, r.set ?? "", r.name, r.cardNumber ?? "", r.language].join("|").toLowerCase().trim();
    const existing = await prisma.gradeCard.findMany({ select: { id: true, name: true, set: true, cardNumber: true, language: true, game: true } });
    const byKey = new Map(existing.map((c) => [key(c), c.id]));

    let added = 0, snapshotted = 0;
    for (const d of parsed.data) {
      const date = toLocalDate(d.date) ?? new Date();
      const gem = gemFrom(d);
      const k = key(d);
      let cardId = byKey.get(k);
      if (!cardId) {
        const card = await prisma.gradeCard.create({ data: { name: d.name.trim(), game: d.game, set: d.set || null, cardNumber: d.cardNumber || null, language: d.language, rarity: d.rarity || null } });
        cardId = card.id; byKey.set(k, cardId); added++;
      }
      await prisma.priceSnapshot.create({ data: { gradeCardId: cardId, date, rawCents: d.rawCents, psa10Cents: d.psa10Cents, psa9Cents: d.psa9Cents ?? null, psa8Cents: d.psa8Cents ?? null, sales30d: d.sales30d ?? null, source: d.source || "csv" } });
      if (gem) await prisma.gemSnapshot.create({ data: { gradeCardId: cardId, date, pop10: gem.pop10, popTotal: gem.popTotal, source: d.source || "csv" } });
      snapshotted++;
    }
    revalidate();
    return { ok: true, id: `${added} new card(s), ${snapshotted} snapshot(s) imported` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Import failed" };
  }
}

/** Search the configured graded-price source for candidate cards (preview only —
 *  nothing is saved; the client fills the form and the user adds the gem rate). */
export async function searchCandidates(query: unknown): Promise<{ ok: true; quotes: GradedQuote[] } | { ok: false; error: string }> {
  const q = typeof query === "string" ? query.trim() : "";
  if (!q) return { ok: false, error: "Enter a search term." };
  const src = getPriceSource();
  if (!src) return { ok: false, error: "No price source configured — add PRICECHARTING_API_TOKEN to your environment to enable this." };
  try {
    const quotes = await src.searchQuotes(q, 15);
    return { ok: true, quotes };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Price-source search failed." };
  }
}

/** One-time: port the old GradingPlay watchlist into the new EV analyzer. */
export async function migrateOldGradingPlays(): Promise<Result> {
  try {
    if ((await prisma.gradeCard.count()) > 0) return { ok: false, error: "The new analyzer already has cards — migration skipped." };
    const plays = await prisma.gradingPlay.findMany();
    let migrated = 0;
    for (const p of plays) {
      const card = await prisma.gradeCard.create({
        data: {
          name: p.name, game: p.game ?? "One Piece", set: p.set, cardNumber: p.cardNumber, language: "EN", notes: p.notes,
          priceSnapshots: { create: { rawCents: p.rawValueCents, psa10Cents: p.psa10Cents, psa9Cents: p.psa9Cents, psa8Cents: p.psa8Cents, source: "migrated" } },
          gemSnapshots: p.gemRatePct > 0 ? { create: { pop10: Math.round(p.gemRatePct), popTotal: 100, source: "migrated" } } : undefined,
        },
      });
      if (card) migrated++;
    }
    revalidate();
    return { ok: true, id: `Migrated ${migrated} card(s) from the old analyzer` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Migration failed" };
  }
}
