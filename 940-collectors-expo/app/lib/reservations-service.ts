import "server-only";
import { getServiceClient } from "./supabase";
import { computePricing, getTable, resolvePromo, FOUNDER_TABLES } from "../reserve/tables";
import {
  sendVendorAcknowledgement,
  sendVendorConfirmation,
  sendAdminNewRequest,
  sendVendorBroadcast,
  type BroadcastRecipient,
} from "./email";

export class ConflictError extends Error {
  tables: number[];
  constructor(tables: number[]) {
    super(`Tables no longer available: ${tables.join(", ")}`);
    this.name = "ConflictError";
    this.tables = tables;
  }
}

export class PromoExhaustedError extends Error {
  constructor(code: string) {
    super(`Promo code ${code} has reached its limit.`);
    this.name = "PromoExhaustedError";
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
  category: string | null;
  featured: boolean;
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
      .select("table_number, reservations!inner(res_code,status,business,instagram,bio,photo,category,featured)")
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
      category: (r.category as string) ?? null,
      featured: (r.featured as boolean) ?? false,
    };
  });
  const blocked = [
    ...new Set([
      ...(bl ?? []).map((b: { table_number: number }) => b.table_number),
      ...FOUNDER_TABLES,
    ]),
  ];
  return { reservations, blocked };
}

export async function createHold(input: HoldInput): Promise<{ resCode: string; amountCents: number }> {
  const sb = getServiceClient();
  const tableNumbers = [...new Set(input.tableNumbers)].filter((n) => !!getTable(n));
  if (tableNumbers.length === 0) throw new Error("No valid tables selected.");

  // Founder/HQ tables are never bookable.
  const founderHit = tableNumbers.filter((n) => FOUNDER_TABLES.includes(n));
  if (founderHit.length) throw new ConflictError(founderHit);

  // Server is the source of truth for price (bundle + promo).
  const pricing = computePricing(tableNumbers, input.promoCode);

  // Enforce a limited-use promo code (e.g. early bird) across all reservations.
  const promo = resolvePromo(input.promoCode);
  if (promo?.maxUses != null) {
    const { count } = await sb
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("promo_code", promo.code)
      .neq("status", "released");
    if ((count ?? 0) >= promo.maxUses) throw new PromoExhaustedError(promo.code);
  }

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

  // Fire confirmation/acknowledgement emails (no-op if email isn't configured).
  const info = {
    resCode,
    business: input.profile.business,
    email: input.profile.email,
    firstName: input.profile.firstName ?? null,
    tables: tableNumbers,
    amountCents: pricing.totalCents,
  };
  await sendVendorAcknowledgement(info);
  await sendAdminNewRequest(info);

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
  featured: boolean;
  createdAt: string;
  tables: number[];
}

export async function listReservations(): Promise<AdminReservation[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("reservations")
    .select(
      "id,res_code,status,business,first_name,last_name,email,phone,instagram,category,amount_cents,promo_code,featured,created_at,reservation_tables(table_number)"
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
    featured: (r.featured as boolean) ?? false,
    createdAt: r.created_at as string,
    tables: ((r.reservation_tables as { table_number: number }[]) ?? [])
      .map((t) => t.table_number)
      .sort((a, b) => a - b),
  }));
}

export interface ReservationEdit {
  business?: string;
  instagram?: string;
  bio?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  category?: string;
}

// Admin edit of a reservation's vendor info (e.g. change the displayed business name).
export async function updateReservation(resCode: string, fields: ReservationEdit): Promise<void> {
  const sb = getServiceClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.business !== undefined) patch.business = fields.business;
  if (fields.instagram !== undefined) patch.instagram = fields.instagram || null;
  if (fields.bio !== undefined) patch.bio = fields.bio || null;
  if (fields.firstName !== undefined) patch.first_name = fields.firstName || null;
  if (fields.lastName !== undefined) patch.last_name = fields.lastName || null;
  if (fields.email !== undefined) patch.email = fields.email;
  if (fields.phone !== undefined) patch.phone = fields.phone || null;
  if (fields.category !== undefined) patch.category = fields.category || null;
  const { error } = await sb.from("reservations").update(patch).eq("res_code", resCode);
  if (error) throw error;
}

// Re-send the standard confirmation email for an already-confirmed reservation
// (e.g. vendors confirmed before email was wired up). No status change.
export async function resendConfirmation(resCode: string): Promise<void> {
  const sb = getServiceClient();
  const { data: row, error } = await sb
    .from("reservations")
    .select("status,business,email,first_name,amount_cents,reservation_tables(table_number)")
    .eq("res_code", resCode)
    .single();
  if (error || !row) throw error ?? new Error("Reservation not found.");
  // Never send a "you're confirmed" email for a reservation that isn't confirmed
  // (e.g. it was released in another tab) — that would list freed tables as booked.
  if (row.status !== "confirmed") {
    throw new Error("Only confirmed reservations can have their confirmation re-sent.");
  }
  const res = await sendVendorConfirmation({
    resCode,
    business: row.business as string,
    email: row.email as string,
    firstName: (row.first_name as string) ?? null,
    tables: ((row.reservation_tables as { table_number: number }[]) ?? [])
      .map((t) => t.table_number)
      .sort((a, b) => a - b),
    amountCents: row.amount_cents as number,
  });
  if (!res.ok) throw new Error(res.error || "Email failed to send.");
}

// Distinct vendor recipients (by email) whose reservation is in one of the
// given statuses — used for the admin broadcast tool.
export async function getVendorRecipients(statuses: string[]): Promise<BroadcastRecipient[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("reservations")
    .select("email,first_name,business,status")
    .in("status", statuses);
  if (error) throw error;
  const byEmail = new Map<string, BroadcastRecipient>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const email = (r.email as string)?.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (!byEmail.has(key)) {
      byEmail.set(key, {
        email,
        firstName: (r.first_name as string) ?? null,
        business: (r.business as string) ?? null,
      });
    }
  }
  return [...byEmail.values()];
}

// Send a custom announcement to every distinct vendor in the given statuses.
export async function broadcastToVendors(
  statuses: string[],
  subject: string,
  message: string
): Promise<{ sent: number; failed: number; total: number }> {
  const recipients = await getVendorRecipients(statuses);
  const { sent, failed } = await sendVendorBroadcast(recipients, subject, message);
  return { sent, failed, total: recipients.length };
}

// Toggle whether a vendor is featured on the homepage. Only confirmed vendors
// should be featured (a released/pending one has no business being spotlighted).
export async function setFeatured(resCode: string, featured: boolean): Promise<void> {
  const sb = getServiceClient();
  if (featured) {
    const { data: row, error: e0 } = await sb
      .from("reservations")
      .select("status")
      .eq("res_code", resCode)
      .single();
    if (e0 || !row) throw e0 ?? new Error("Reservation not found.");
    if (row.status !== "confirmed") {
      throw new Error("Only confirmed vendors can be featured.");
    }
  }
  const { error } = await sb
    .from("reservations")
    .update({ featured, updated_at: new Date().toISOString() })
    .eq("res_code", resCode);
  if (error) throw error;
}

export async function setReservationStatus(resCode: string, action: "confirm" | "release"): Promise<void> {
  const sb = getServiceClient();
  const { data: row, error: e0 } = await sb
    .from("reservations")
    .select("id,business,email,first_name,amount_cents,reservation_tables(table_number)")
    .eq("res_code", resCode)
    .single();
  if (e0 || !row) throw e0 ?? new Error("Reservation not found.");
  if (action === "confirm") {
    const { error } = await sb.from("reservations").update({ status: "confirmed", updated_at: new Date().toISOString() }).eq("id", row.id);
    if (error) throw error;
    // Email the vendor that payment was received and their table(s) are locked in.
    await sendVendorConfirmation({
      resCode,
      business: row.business as string,
      email: row.email as string,
      firstName: (row.first_name as string) ?? null,
      tables: ((row.reservation_tables as { table_number: number }[]) ?? [])
        .map((t) => t.table_number)
        .sort((a, b) => a - b),
      amountCents: row.amount_cents as number,
    });
  } else {
    // Release: free the tables FIRST (active=false) so a later failure can't
    // strand them as "taken"; then mark released + drop featured so a released
    // vendor never lingers on the homepage.
    const { error: e1 } = await sb.from("reservation_tables").update({ active: false }).eq("reservation_id", row.id);
    if (e1) throw e1;
    const { error: e2 } = await sb.from("reservations").update({ status: "released", featured: false, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (e2) throw e2;
  }
}
