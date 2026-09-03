import "server-only";
import { getServiceClient } from "./supabase";
import { computePricing, getTable, resolvePromo, FOUNDER_TABLES, SEATING_TABLES, EVENT } from "../reserve/tables";
import { createCheckoutSession, stripeConfigured } from "./stripe";

// Tables that can never be booked by a vendor (organizer HQ + the seating/ripping zone).
const NON_VENDOR_TABLES = [...FOUNDER_TABLES, ...SEATING_TABLES];
import {
  sendVendorAcknowledgement,
  sendVendorConfirmation,
  sendAdminNewRequest,
  sendVendorBroadcast,
  type BroadcastRecipient,
  type BroadcastAttachment,
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
  paymentMethod?: "zelle" | "stripe";
  origin?: string; // request origin, for Stripe success/cancel URLs
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

// NOTE: The 12-hour Zelle window is a VISUAL warning only — Zelle holds are NOT
// auto-released. An unpaid hold stays until an admin releases it via /admin.
// (Abandoned Stripe card holds are still freed by the checkout.session.expired
// webhook — that's independent of the Zelle window.)

export async function getPublicState(): Promise<{
  reservations: PublicReservation[];
  blocked: number[];
}> {
  const sb = getServiceClient();
  const [{ data: rt, error: e1 }, { data: bl, error: e2 }] = await Promise.all([
    sb
      .from("reservation_tables")
      // NOTE: intentionally excludes the heavy `photo` (base64 data URL) and
      // `bio` columns. Those are fetched once via getVendorMedia() instead of on
      // every 60s poll — otherwise every visitor re-downloads all vendor logos
      // continuously and blows the DB egress quota.
      .select("table_number, reservations!inner(res_code,status,business,instagram,category,featured)")
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
      ...NON_VENDOR_TABLES,
    ]),
  ];
  return { reservations, blocked };
}

// Featured (starred, confirmed) vendors only — small result set for the homepage
// FeaturedVendors section. Selected straight from `reservations` (one row per
// vendor, not per table) so the homepage never downloads the whole floor's data.
export interface FeaturedVendor {
  resCode: string;
  business: string;
  instagram: string | null;
  bio: string | null;
  photo: string | null;
  category: string | null;
}
export async function getFeaturedVendors(): Promise<FeaturedVendor[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("reservations")
    .select("res_code,business,instagram,bio,photo,category")
    .eq("featured", true)
    .eq("status", "confirmed");
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    resCode: r.res_code as string,
    business: r.business as string,
    instagram: (r.instagram as string) ?? null,
    bio: (r.bio as string) ?? null,
    photo: (r.photo as string) ?? null,
    category: (r.category as string) ?? null,
  }));
}

// Vendor logos + bios keyed by table number. Heavy (base64 photos), so this is
// fetched sparingly by the client (once on load + after a booking) rather than
// on the recurring availability poll. Kept separate from getPublicState to keep
// per-poll egress tiny.
export async function getVendorMedia(): Promise<{
  media: { tableNumber: number; photo: string | null; bio: string | null }[];
}> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("reservation_tables")
    .select("table_number, reservations!inner(photo,bio)")
    .eq("active", true);
  if (error) throw error;
  const media = (data ?? [])
    .map((row: Record<string, unknown>) => {
      const r = row.reservations as Record<string, unknown>;
      return {
        tableNumber: row.table_number as number,
        photo: (r.photo as string) ?? null,
        bio: (r.bio as string) ?? null,
      };
    })
    .filter((m) => m.photo || m.bio);
  return { media };
}

export async function createHold(
  input: HoldInput
): Promise<{ resCode: string; amountCents: number; paymentMethod: "zelle" | "stripe"; checkoutUrl?: string }> {
  const sb = getServiceClient();
  const tableNumbers = [...new Set(input.tableNumbers)].filter((n) => !!getTable(n));
  if (tableNumbers.length === 0) throw new Error("No valid tables selected.");

  // Founder/HQ + seating/ripping tables are never bookable.
  const founderHit = tableNumbers.filter((n) => NON_VENDOR_TABLES.includes(n));
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
  // Card only if the vendor chose it AND Stripe is configured; otherwise Zelle.
  const method: "zelle" | "stripe" =
    input.paymentMethod === "stripe" && stripeConfigured() ? "stripe" : "zelle";
  // Zelle holds get a hard 12h deadline; Stripe holds live as long as the
  // Checkout Session (expiry is updated to the session's once it's created).
  const expiresAt =
    method === "stripe"
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + EVENT.zelleHoldHours * 60 * 60 * 1000).toISOString();

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
      // Store the CANONICAL code (not raw input) so a maxUses cap counts every
      // redemption regardless of the casing the vendor typed. Invalid/absent -> null.
      promo_code: promo ? promo.code : null,
      payment_method: method,
      expires_at: expiresAt,
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

  const info = {
    resCode,
    business: input.profile.business,
    email: input.profile.email,
    firstName: input.profile.firstName ?? null,
    tables: tableNumbers,
    amountCents: pricing.totalCents,
  };

  if (method === "stripe") {
    // Start hosted Checkout and hand the URL back to the client to redirect.
    try {
      const session = await createCheckoutSession({
        resCode,
        reservationId: resRow.id as string,
        amountCents: pricing.totalCents,
        businessName: input.profile.business,
        email: input.profile.email,
        origin: input.origin || "",
      });
      if (!session?.url) throw new Error("no_session_url");
      const { error: e3 } = await sb
        .from("reservations")
        .update({ stripe_session_id: session.sessionId, expires_at: session.expiresAtIso })
        .eq("id", resRow.id);
      if (e3) throw e3; // fall to cleanup below rather than strand the hold at 24h
      return { resCode, amountCents: pricing.totalCents, paymentMethod: "stripe", checkoutUrl: session.url };
    } catch (err) {
      // Payment couldn't be started — free the tables so they don't sit stuck.
      await sb.from("reservation_tables").update({ active: false }).eq("reservation_id", resRow.id);
      await sb.from("reservations").update({ status: "released" }).eq("id", resRow.id);
      console.error("[stripe] checkout session failed:", (err as Error)?.message ?? err);
      throw new Error("payment_init_failed");
    }
  }

  // Zelle: acknowledge the vendor (with the 12h warning) + notify the organizer.
  await sendVendorAcknowledgement(info);
  await sendAdminNewRequest(info);
  return { resCode, amountCents: pricing.totalCents, paymentMethod: "zelle" };
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
  photo: string | null;
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
      "id,res_code,status,business,first_name,last_name,email,phone,instagram,category,photo,amount_cents,promo_code,featured,created_at,reservation_tables(table_number,active)"
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
    photo: (r.photo as string) ?? null,
    amountCents: r.amount_cents as number,
    promoCode: (r.promo_code as string) ?? null,
    featured: (r.featured as boolean) ?? false,
    createdAt: r.created_at as string,
    tables: ((r.reservation_tables as { table_number: number; active: boolean }[]) ?? [])
      .filter((t) => t.active)
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
  photo?: string; // vendor's table image (data URL); "" clears it
  amountCents?: number; // admin override of the amount actually collected
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
  if (fields.photo !== undefined) patch.photo = fields.photo || null;
  if (fields.amountCents !== undefined) patch.amount_cents = fields.amountCents;
  const { error } = await sb.from("reservations").update(patch).eq("res_code", resCode);
  if (error) throw error;
}

// Admin reassignment of which physical table(s) a reservation holds — this also
// moves the vendor on the public map. Validates against the layout, founder/HQ,
// blocked tables, and tables already held by ANOTHER active reservation.
export async function changeReservationTables(resCode: string, newTables: number[]): Promise<void> {
  const sb = getServiceClient();
  const desired = [...new Set(newTables)].filter((n) => Number.isInteger(n));
  if (desired.length === 0) throw new Error("At least one table is required.");
  const unknown = desired.filter((n) => !getTable(n));
  if (unknown.length) throw new Error(`Not a real table: ${unknown.join(", ")}`);
  const founderHit = desired.filter((n) => NON_VENDOR_TABLES.includes(n));
  if (founderHit.length) throw new Error(`These tables aren't vendor tables (HQ or seating): ${founderHit.join(", ")}`);

  const { data: row, error: e0 } = await sb
    .from("reservations")
    .select("id,reservation_tables(table_number,active)")
    .eq("res_code", resCode)
    .single();
  if (e0 || !row) throw e0 ?? new Error("Reservation not found.");
  const resId = row.id as string;
  const current = ((row.reservation_tables as { table_number: number; active: boolean }[]) ?? [])
    .filter((t) => t.active)
    .map((t) => t.table_number);
  const currentSet = new Set(current);
  const desiredSet = new Set(desired);
  const toAdd = desired.filter((n) => !currentSet.has(n));
  const toRemove = current.filter((n) => !desiredSet.has(n));
  if (toAdd.length === 0 && toRemove.length === 0) return; // no change

  // Only the tables we're newly claiming can conflict (a table already held by
  // THIS reservation is fine).
  if (toAdd.length) {
    const [{ data: taken }, { data: blocked }] = await Promise.all([
      sb.from("reservation_tables").select("table_number,reservation_id").eq("active", true).in("table_number", toAdd),
      sb.from("blocked_tables").select("table_number").in("table_number", toAdd),
    ]);
    const conflicts = [
      ...(taken ?? []).filter((t) => t.reservation_id !== resId).map((t: { table_number: number }) => t.table_number),
      ...(blocked ?? []).map((b: { table_number: number }) => b.table_number),
    ];
    if (conflicts.length) throw new ConflictError([...new Set(conflicts)]);
  }

  // Free removed tables first so a shuffle within the same set can't self-conflict.
  if (toRemove.length) {
    const { error } = await sb
      .from("reservation_tables")
      .update({ active: false })
      .eq("reservation_id", resId)
      .in("table_number", toRemove);
    if (error) throw error;
  }
  // Claim the added tables (the unique index is the real race guard).
  if (toAdd.length) {
    const rows = toAdd.map((n) => ({ reservation_id: resId, table_number: n, active: true }));
    const { error } = await sb.from("reservation_tables").insert(rows);
    if (error) {
      // Roll back the frees so we never strand the vendor with fewer tables.
      if (toRemove.length) {
        const { error: rollbackErr } = await sb
          .from("reservation_tables")
          .update({ active: true })
          .eq("reservation_id", resId)
          .in("table_number", toRemove);
        // If the rollback itself failed (e.g. a concurrent hold grabbed a freed
        // table), the vendor is now short those tables — surface it loudly.
        if (rollbackErr) {
          throw new Error(
            `Table move failed and could not be fully undone. Please re-check reservation ${resCode}; tables ${toRemove.join(", ")} may need to be re-assigned.`
          );
        }
      }
      if ((error as { code?: string }).code === "23505") throw new ConflictError(toAdd);
      throw error;
    }
  }
  await sb.from("reservations").update({ updated_at: new Date().toISOString() }).eq("id", resId);
}

// Re-send the standard confirmation email for an already-confirmed reservation
// (e.g. vendors confirmed before email was wired up). No status change.
export async function resendConfirmation(resCode: string): Promise<void> {
  const sb = getServiceClient();
  const { data: row, error } = await sb
    .from("reservations")
    .select("status,business,email,first_name,amount_cents,reservation_tables(table_number,active)")
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
    tables: ((row.reservation_tables as { table_number: number; active: boolean }[]) ?? [])
      .filter((t) => t.active)
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
  message: string,
  attachment?: BroadcastAttachment | null
): Promise<{ sent: number; failed: number; total: number }> {
  const recipients = await getVendorRecipients(statuses);
  const { sent, failed } = await sendVendorBroadcast(recipients, subject, message, attachment);
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

export async function setReservationStatus(
  resCode: string,
  action: "confirm" | "release" | "pending",
  opts?: { source?: "zelle" | "stripe" }
): Promise<void> {
  const sb = getServiceClient();
  const { data: row, error: e0 } = await sb
    .from("reservations")
    .select("id,status,business,email,first_name,amount_cents,reservation_tables(table_number,active)")
    .eq("res_code", resCode)
    .single();
  if (e0 || !row) throw e0 ?? new Error("Reservation not found.");
  if (action === "confirm") {
    // Only a PENDING reservation can be confirmed. This keeps confirm idempotent
    // (a duplicate/retried Stripe webhook is a no-op) AND prevents a released or
    // refunded reservation from being resurrected by a late webhook.
    if (row.status !== "pending") return;
    const patch: Record<string, unknown> = {
      status: "confirmed",
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (opts?.source) patch.payment_method = opts.source;
    // Only the delivery that actually flips pending -> confirmed proceeds to email.
    const { data: won, error } = await sb
      .from("reservations")
      .update(patch)
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id");
    if (error) throw error;
    if (!won || won.length === 0) return; // a concurrent delivery already confirmed it
    // Email the vendor that payment was received and their table(s) are locked in.
    await sendVendorConfirmation({
      resCode,
      business: row.business as string,
      email: row.email as string,
      firstName: (row.first_name as string) ?? null,
      tables: ((row.reservation_tables as { table_number: number; active: boolean }[]) ?? [])
        .filter((t) => t.active)
        .map((t) => t.table_number)
        .sort((a, b) => a - b),
      amountCents: row.amount_cents as number,
    });
  } else if (action === "pending") {
    // Move a CONFIRMED reservation back to pending (admin mistake, or reworking a
    // payment). Only from confirmed — never resurrect a released one. Tables stay
    // held (active unchanged); clear paid_at.
    if (row.status !== "confirmed") return;
    const { error } = await sb
      .from("reservations")
      .update({ status: "pending", paid_at: null, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "confirmed");
    if (error) throw error;
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

// Release a hold ONLY if it's still pending (used by the Stripe
// checkout.session.expired webhook to free an abandoned card hold). Never
// touches a confirmed reservation.
export async function releaseIfPending(resCode: string): Promise<void> {
  const sb = getServiceClient();
  const { data: row } = await sb
    .from("reservations")
    .select("id,status")
    .eq("res_code", resCode)
    .maybeSingle();
  if (!row || row.status !== "pending") return;
  await sb.from("reservation_tables").update({ active: false }).eq("reservation_id", row.id);
  await sb.from("reservations").update({ status: "released", updated_at: new Date().toISOString() }).eq("id", row.id);
}

// Webhook fallback: resolve a reservation code from its Stripe Checkout Session id
// (used only if the session's client_reference_id/metadata is somehow missing).
export async function getResCodeByStripeSession(sessionId: string): Promise<string | null> {
  const sb = getServiceClient();
  const { data } = await sb
    .from("reservations")
    .select("res_code")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  return (data?.res_code as string) ?? null;
}
