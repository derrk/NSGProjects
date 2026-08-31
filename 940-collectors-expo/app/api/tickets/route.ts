import { NextResponse } from "next/server";
import { supabaseConfigured } from "../../lib/supabase";
import { stripeConfigured } from "../../lib/stripe";
import { createTicketOrder } from "../../lib/tickets-service";

export const dynamic = "force-dynamic";

// Public: create a pending ticket order and return the Stripe Checkout URL.
export async function POST(req: Request) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!stripeConfigured()) return NextResponse.json({ error: "payments_unavailable" }, { status: 503 });

  let body: {
    name?: string;
    phone?: string;
    email?: string;
    vipQty?: number;
    gaQty?: number;
    extraEntries?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const origin = req.headers.get("origin") ?? undefined;
  try {
    const result = await createTicketOrder({
      name: String(body.name ?? ""),
      phone: String(body.phone ?? ""),
      email: String(body.email ?? ""),
      vipQty: Number(body.vipQty ?? 0),
      gaQty: Number(body.gaQty ?? 0),
      extraEntries: Number(body.extraEntries ?? 0),
      origin,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 400 });
  }
}
