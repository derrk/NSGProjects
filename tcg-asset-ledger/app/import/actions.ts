"use server";

import { revalidatePath } from "next/cache";
import { parseCollectrCsv } from "@/lib/collectr";
import { planImport, applyPlan } from "@/lib/import-collectr";

export interface AnalyzeResult {
  ok: boolean;
  error?: string;
  asOfDate?: string | null;
  rowCount?: number;
  createCount?: number;
  refreshCount?: number;
  priceOnlyCount?: number;
  mismatchCount?: number;
  duplicateWarningCount?: number;
  preview?: {
    name: string;
    action: string;
    qtyBefore: number | null;
    qtyAfter: number;
    costAfterCents: number;
    marketBeforeCents: number | null;
    marketAfterCents: number;
    quantityMismatch: boolean;
    possibleDuplicateOf?: string;
  }[];
  parseErrors?: string[];
}

export async function analyzeCollectr(csvText: string): Promise<AnalyzeResult> {
  const parsed = parseCollectrCsv(csvText);
  if (parsed.rows.length === 0) {
    return {
      ok: false,
      error: "No rows found. Is this a Collectr CSV export?",
      parseErrors: parsed.errors,
    };
  }
  const plan = await planImport(parsed.rows);

  // Show the most interesting rows first: duplicate warnings, mismatches,
  // creates, then the rest.
  const sorted = [...plan.items].sort((a, b) => {
    const score = (i: typeof a) =>
      (i.possibleDuplicateOf ? 0 : 2) +
      (i.quantityMismatch ? 0 : 1) +
      (i.action === "create" ? 0 : 1);
    return score(a) - score(b);
  });

  return {
    ok: true,
    asOfDate: parsed.asOfDate ? parsed.asOfDate.toISOString() : null,
    rowCount: parsed.rows.length,
    createCount: plan.createCount,
    refreshCount: plan.refreshCount,
    priceOnlyCount: plan.priceOnlyCount,
    mismatchCount: plan.mismatchCount,
    duplicateWarningCount: plan.duplicateWarningCount,
    parseErrors: parsed.errors,
    preview: sorted.slice(0, 60).map((i) => ({
      name: i.name,
      action: i.action,
      qtyBefore: i.qtyBefore,
      qtyAfter: i.qtyAfter,
      costAfterCents: i.costAfterCents,
      marketBeforeCents: i.marketBeforeCents,
      marketAfterCents: i.marketAfterCents,
      quantityMismatch: i.quantityMismatch,
      possibleDuplicateOf: i.possibleDuplicateOf,
    })),
  };
}

export interface CommitResult {
  ok: boolean;
  error?: string;
  created?: number;
  updated?: number;
  syncedCount?: number;
}

export async function commitCollectr(
  csvText: string,
  fileName?: string,
): Promise<CommitResult> {
  const parsed = parseCollectrCsv(csvText);
  if (parsed.rows.length === 0) {
    return { ok: false, error: "No rows to import." };
  }
  try {
    const plan = await planImport(parsed.rows);
    const res = await applyPlan(plan, { fileName, asOfDate: parsed.asOfDate });
    revalidatePath("/");
    revalidatePath("/inventory");
    revalidatePath("/reports");
    revalidatePath("/sync");
    return { ok: true, created: res.created, updated: res.updated, syncedCount: res.syncedCount };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Import failed" };
  }
}
