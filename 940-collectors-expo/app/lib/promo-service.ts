import "server-only";
import { getServiceClient } from "./supabase";
import type { PromoCode } from "../reserve/tables";

export interface PromoRow extends PromoCode {
  active: boolean;
  used: number;
  remaining: number | null; // null = unlimited
}

type SbRow = { code: string; type: PromoCode["type"]; value: number; label: string; max_uses: number | null; active?: boolean };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function usageCounts(sb: any, codes: string[]): Promise<Record<string, number>> {
  if (!codes.length) return {};
  const { data } = await sb
    .from("reservations")
    .select("promo_code,status")
    .in("promo_code", codes)
    .neq("status", "released");
  const m: Record<string, number> = {};
  for (const r of data ?? []) {
    const c = r.promo_code as string | null;
    if (c) m[c] = (m[c] ?? 0) + 1;
  }
  return m;
}

// Fallback so the advertised early-bird keeps working in the window between
// deploying this feature and running migration 0007 (which seeds it in the DB).
const FALLBACK_ROWS: SbRow[] = [
  { code: "EARLYBIRD940", type: "table_price", value: 8500, label: "Early bird — $85 per table", max_uses: 25, active: true },
];

const toCode = (r: SbRow): PromoCode => ({
  code: r.code,
  type: r.type,
  value: r.value,
  label: r.label,
  maxUses: r.max_uses ?? undefined,
});

// Active codes only — used to compute pricing on the client + server.
export async function getActivePromoCodes(): Promise<PromoCode[]> {
  const sb = getServiceClient();
  const { data, error } = await sb.from("promo_codes").select("code,type,value,label,max_uses").eq("active", true);
  if (error) return FALLBACK_ROWS.map(toCode); // table not created yet (migration 0007)
  return (data ?? []).map(toCode);
}

const withUsage = (rows: SbRow[], usage: Record<string, number>): PromoRow[] =>
  rows.map((r) => {
    const used = usage[r.code] ?? 0;
    const max = r.max_uses ?? null;
    return { ...toCode(r), active: r.active ?? true, used, remaining: max == null ? null : Math.max(0, max - used) };
  });

// Active codes + live usage — for the public reserve page (pricing + counters).
export async function getActivePromoStatuses(): Promise<PromoRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("promo_codes")
    .select("code,type,value,label,max_uses,active")
    .eq("active", true);
  const rows = error ? FALLBACK_ROWS : ((data ?? []) as SbRow[]); // fallback if table missing
  return withUsage(rows, await usageCounts(sb, rows.map((r) => r.code)));
}

// All codes (active + inactive) + usage — for the admin panel.
export async function listPromoCodesAdmin(): Promise<PromoRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("promo_codes")
    .select("code,type,value,label,max_uses,active")
    .order("created_at", { ascending: false });
  if (error) return [];
  const rows = (data ?? []) as SbRow[];
  return withUsage(rows, await usageCounts(sb, rows.map((r) => r.code)));
}

export async function createPromoCode(input: {
  code: string;
  type: PromoCode["type"];
  value: number;
  label?: string;
  maxUses?: number | null;
}): Promise<void> {
  const sb = getServiceClient();
  const code = (input.code || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{2,32}$/.test(code)) throw new Error("Code must be 2–32 letters/numbers.");
  if (!["fixed", "percent", "table_price"].includes(input.type)) throw new Error("Invalid discount type.");
  if (!Number.isFinite(input.value) || input.value < 0) throw new Error("Invalid discount value.");
  if (input.type === "percent" && input.value > 100) throw new Error("Percent can't exceed 100.");
  const maxUses = input.maxUses == null || input.maxUses === 0 ? null : Math.max(1, Math.floor(input.maxUses));
  const { error } = await sb.from("promo_codes").insert({
    code,
    type: input.type,
    value: Math.round(input.value),
    label: (input.label || "").trim() || code,
    max_uses: maxUses,
    active: true,
  });
  if (error) {
    if ((error as { code?: string }).code === "23505") throw new Error("That code already exists.");
    throw error;
  }
}

export async function setPromoActive(code: string, active: boolean): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from("promo_codes").update({ active }).eq("code", code.trim().toUpperCase());
  if (error) throw error;
}

export async function deletePromoCode(code: string): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from("promo_codes").delete().eq("code", code.trim().toUpperCase());
  if (error) throw error;
}
