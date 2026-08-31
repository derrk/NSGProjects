import "server-only";
import { getServiceClient } from "./supabase";
import { TICKETS } from "./site";
import { createTicketCheckoutSession, stripeConfigured } from "./stripe";
import { sendTicketConfirmation } from "./email";

export interface TicketOrderInput {
  name: string;
  phone: string;
  email: string;
  vipQty: number;
  gaQty: number;
  extraEntries: number;
  origin?: string;
}

export interface TicketOrder {
  id: string;
  orderCode: string;
  name: string;
  phone: string;
  email: string;
  vipQty: number;
  gaQty: number;
  extraEntries: number;
  giveawayEntries: number;
  amountCents: number;
  status: string;
  paidAt: string | null;
  createdAt: string;
}

const MAX_QTY = 20;

function genTixCode(): string {
  const n = Math.floor(100000 + Math.random() * 899999); // 6 digits
  return `940TIX-${n}`;
}

function computeTicketTotals(vipQty: number, gaQty: number, extraEntries: number) {
  const amountCents =
    vipQty * TICKETS.vip.priceCents +
    gaQty * TICKETS.general.priceCents +
    extraEntries * TICKETS.extra.priceCents;
  const giveawayEntries =
    vipQty * TICKETS.vip.entries + gaQty * TICKETS.general.entries + extraEntries * TICKETS.extra.entries;
  return { amountCents, giveawayEntries };
}

// Create a pending ticket order + a Stripe Checkout Session. Amount is computed
// server-side from TICKETS (never trust the client). Returns the checkout URL.
export async function createTicketOrder(
  input: TicketOrderInput
): Promise<{ orderCode: string; amountCents: number; checkoutUrl: string }> {
  if (!stripeConfigured()) throw new Error("payments_unavailable");
  const clamp = (n: unknown) => Math.max(0, Math.min(MAX_QTY, Math.floor(Number(n) || 0)));
  const vipQty = clamp(input.vipQty);
  const gaQty = clamp(input.gaQty);
  const extraEntries = clamp(input.extraEntries);
  if (vipQty + gaQty + extraEntries === 0) throw new Error("nothing_selected");
  const name = (input.name || "").trim();
  const phone = (input.phone || "").trim();
  const email = (input.email || "").trim();
  if (!name || !phone || !email) throw new Error("missing_fields");

  const { amountCents, giveawayEntries } = computeTicketTotals(vipQty, gaQty, extraEntries);

  const sb = getServiceClient();
  // Insert the pending order, retrying on the rare order_code collision. Any
  // other insert failure (e.g. the migration isn't run yet) surfaces as a
  // friendly "payments_unavailable" rather than a raw DB error.
  let orderCode = "";
  let orderId = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    orderCode = genTixCode();
    const { data: row, error } = await sb
      .from("ticket_orders")
      .insert({
        order_code: orderCode,
        name,
        phone,
        email,
        vip_qty: vipQty,
        ga_qty: gaQty,
        extra_entries: extraEntries,
        giveaway_entries: giveawayEntries,
        amount_cents: amountCents,
        status: "pending",
      })
      .select("id")
      .single();
    if (!error && row) {
      orderId = row.id as string;
      break;
    }
    if ((error as { code?: string })?.code === "23505") continue; // order_code clash — new code
    console.error("[tickets] order insert failed:", (error as Error)?.message ?? error);
    throw new Error("payments_unavailable");
  }
  if (!orderId) throw new Error("payments_unavailable");

  try {
    const session = await createTicketCheckoutSession({
      orderCode,
      email,
      vipQty,
      gaQty,
      extraEntries,
      origin: input.origin || "",
    });
    if (!session?.url) throw new Error("no_session_url");
    await sb.from("ticket_orders").update({ stripe_session_id: session.sessionId }).eq("id", orderId);
    return { orderCode, amountCents, checkoutUrl: session.url };
  } catch (err) {
    await sb.from("ticket_orders").delete().eq("id", orderId); // no payment started — remove the orphan
    console.error("[tickets] checkout session failed:", (err as Error)?.message ?? err);
    throw new Error("payment_init_failed");
  }
}

// Webhook: mark a ticket order paid (idempotent) and send the proof-of-purchase email.
export async function markTicketPaid(orderCode: string): Promise<void> {
  const sb = getServiceClient();
  const { data: row, error: e0 } = await sb
    .from("ticket_orders")
    .select("id,status,name,email,vip_qty,ga_qty,extra_entries,giveaway_entries,amount_cents,order_code")
    .eq("order_code", orderCode)
    .maybeSingle();
  if (e0 || !row) throw e0 ?? new Error("Ticket order not found.");
  if (row.status === "paid") return; // fast idempotent path
  const { data: won, error } = await sb
    .from("ticket_orders")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id");
  if (error) throw error;
  if (!won || won.length === 0) return; // a concurrent delivery already marked it paid
  await sendTicketConfirmation({
    orderCode: row.order_code as string,
    name: row.name as string,
    email: row.email as string,
    vipQty: row.vip_qty as number,
    gaQty: row.ga_qty as number,
    extraEntries: row.extra_entries as number,
    giveawayEntries: row.giveaway_entries as number,
    amountCents: row.amount_cents as number,
  });
}

export async function getTicketOrderCodeByStripeSession(sessionId: string): Promise<string | null> {
  const sb = getServiceClient();
  const { data } = await sb
    .from("ticket_orders")
    .select("order_code")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  return (data?.order_code as string) ?? null;
}

export async function listTicketOrders(): Promise<TicketOrder[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("ticket_orders")
    .select(
      "id,order_code,name,phone,email,vip_qty,ga_qty,extra_entries,giveaway_entries,amount_cents,status,paid_at,created_at"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    orderCode: r.order_code as string,
    name: r.name as string,
    phone: r.phone as string,
    email: r.email as string,
    vipQty: r.vip_qty as number,
    gaQty: r.ga_qty as number,
    extraEntries: r.extra_entries as number,
    giveawayEntries: r.giveaway_entries as number,
    amountCents: r.amount_cents as number,
    status: r.status as string,
    paidAt: (r.paid_at as string) ?? null,
    createdAt: r.created_at as string,
  }));
}
