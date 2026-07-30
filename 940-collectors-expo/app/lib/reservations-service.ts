import "server-only";
import { getServiceClient } from "./supabase";
import { computePricing, getTable } from "../reserve/tables";

export class ConflictError extends Error {
  tables: number[];
  constructor(tables: number[]) {
    super(`Tables no longer available: ${tables.join(", ")}`);
    this.name = "ConflictError";
    this.tables = tables;
  }
}

export interface HoldInput {
  tableNumbers: number[];
  promoCode?: string | null;
  profile: {
    business: string;
    firstName?: string;
    lastName?: string;
    email: string;
    phone?: string;
    instagram?: string;
    bio?: string;
    category?: string;
    photo?: string;
  };
}

// Public map state — NO contact PII (email/phone/name are omitted on purpose).
export interface PublicReservation {
  tableNumber: number;
  resCode: string;
  status: "pending" | "confirmed";
  business: string;
  instagram: string | null;
  bio: string | null;
  photo: string | null;
}

function genCode(): string {
  const n = Math.floor(10000 + Math.random() * 89999);
  return `940CE-${n}`;
}

export async function getPublicState(): Promise<{
  reservations: PublicReservation[];
  blocked: number[];
}> {
  const sb = getServiceClient();
  const [{ data: rt, error: e1 }, { data: bl, error: e2 }] = await Promise.all([
    sb
      .from("reservation_tables")
      .select("table_number, reservations!inner(res_code,status,business,instagram,bio,photo)")
      .eq("active", true),
    sb.from("blocked_tables").select("table_number"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const reservations: PublicReservation[] = (rt ?? []).map((row: Record<string, unknown>) => {
    const r = row.reservations as Record<string, unknown>;
    return {
      tableNumber: row.table_number as number,
      resCode: r.res_code as string,
      status: r.status as "pending" | "confirmed",
      business: r.business as string,
      instagram: (r.instagram as string) ?? null,
      bio: (r.bio as string) ?? null,
      photo: (r.photo as string) ?? null,
    };
  });
  const blocked = (bl ?? []).map((b: { table_number: number }) => b.table_number);
  return { reservations, blocked };
}

export async function createHold(input: HoldInput): Promise<{ resCode: string; amountCents: number }> {
  const sb = getServiceClient();
  const tableNumbers = [...new Set(input.tableNumbers)].filter((n) => !!getTable(n));
  if (tableNumbers.length === 0) throw new Error("No valid tables selected.");

  // Server is the source of truth for price (bundle + promo).
  const pricing = computePricing(tableNumbers, input.promoCode);

  // Pre-check availability (the unique index is the real guard against races).
  const [{ data: taken }, { data: blocked }] = await Promise.all([
    sb.from("reservation_tables").select("table_number").eq("active", true).in("table_number", tableNumbers),
    sb.from("blocked_tables").select("table_number").in("table_number", tableNumbers),
  ]);
  const conflicts = [
    ...(taken ?? []).map((t: { table_number: number }) => t.table_number),
    ...(blocked ?? []).map((b: { table_number: number }) => b.table_number),
  ];
  if (conflicts.length) throw new ConflictError([...new Set(conflicts)]);

  const resCode = genCode();
  const { data: resRow, error: e1 } = await sb
    .from("reservations")
    .insert({
      res_code: resCode,
      status: "pending",
      business: input.profile.business,
      first_name: input.profile.firstName ?? null,
      last_name: input.profile.lastName ?? null,
      email: input.profile.email,
      phone: input.profile.phone ?? null,
      instagram: input.profile.instagram ?? null,
      bio: input.profile.bio ?? null,
      category: input.profile.category ?? null,
      photo: input.profile.photo ?? null,
      amount_cents: pricing.totalCents,
      promo_code: input.promoCode || null,
    })
    .select("id")
    .single();
  if (e1 || !resRow) throw e1 ?? new Error("Failed to create reservation.");

  const rows = tableNumbers.map((n) => ({ reservation_id: resRow.id, table_number: n, active: true }));
  const { error: e2 } = await sb.from("reservation_tables").insert(rows);
  if (e2) {
    await sb.from("reservations").delete().eq("id", resRow.id); // cleanup orphan
    if (e2.code === "23505") throw new ConflictError(tableNumbers); // lost a race
    throw e2;
  }
  return { resCode, amountCents: pricing.totalCents };
}

export interface AdminReservation {
  id: string;
  resCode: string;
  status: string;
  business: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  instagram: string | null;
  category: string | null;
  amountCents: number;
  promoCode: string | null;
  createdAt: string;
  tables: number[];
}

export async function listReservations(): Promise<AdminReservation[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("reservations")
    .select(
      "id,res_code,status,business,first_name,last_name,email,phone,instagram,category,amount_cents,promo_code,created_at,reservation_tables(table_number)"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    resCode: r.res_code as string,
    status: r.status as string,
    business: r.business as string,
    firstName: (r.first_name as string) ?? null,
    lastName: (r.last_name as string) ?? null,
    email: r.email as string,
    phone: (r.phone as string) ?? null,
    instagram: (r.instagram as string) ?? null,
    category: (r.category as string) ?? null,
    amountCents: r.amount_cents as number,
    promoCode: (r.promo_code as string) ?? null,
    createdAt: r.created_at as string,
    tables: ((r.reservation_tables as { table_number: number }[]) ?? [])
      .map((t) => t.table_number)
      .sort((a, b) => a - b),
  }));
}

export async function setReservationStatus(resCode: string, action: "confirm" | "release"): Promise<void> {
  const sb = getServiceClient();
  const { data: row, error: e0 } = await sb.from("reservations").select("id").eq("res_code", resCode).single();
  if (e0 || !row) throw e0 ?? new Error("Reservation not found.");
  if (action === "confirm") {
    const { error } = await sb.from("reservations").update({ status: "confirmed", updated_at: new Date().toISOString() }).eq("id", row.id);
    if (error) throw error;
  } else {
    // Release: free the tables (active=false) so they return to availability.
    const { error: e1 } = await sb.from("reservations").update({ status: "released", updated_at: new Date().toISOString() }).eq("id", row.id);
    if (e1) throw e1;
    const { error: e2 } = await sb.from("reservation_tables").update({ active: false }).eq("reservation_id", row.id);
    if (e2) throw e2;
  }
}
