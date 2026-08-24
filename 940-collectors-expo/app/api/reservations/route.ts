import { NextResponse } from "next/server";
import { supabaseConfigured } from "../../lib/supabase";
import { getPublicState, createHold, ConflictError, PromoExhaustedError } from "../../lib/reservations-service";
import { stripeConfigured } from "../../lib/stripe";

export const dynamic = "force-dynamic";

// Public map state (no contact PII).
export async function GET() {
  if (!supabaseConfigured()) {
    return NextResponse.json({ configured: false, stripeEnabled: false, reservations: [], blocked: [] });
  }
  try {
    const state = await getPublicState();
    return NextResponse.json({ configured: true, stripeEnabled: stripeConfigured(), ...state });
  } catch (e) {
    return NextResponse.json(
      { configured: true, stripeEnabled: stripeConfigured(), error: String((e as Error)?.message ?? e), reservations: [], blocked: [] },
      { status: 500 }
    );
  }
}

// Create a pending hold (server recomputes price, DB guards double-booking).
export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  let body: {
    tableNumbers?: number[];
    promoCode?: string | null;
    paymentMethod?: string;
    profile?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const tableNumbers = Array.isArray(body.tableNumbers) ? body.tableNumbers.map(Number) : [];
  const profile = body.profile as
    | {
        business: string;
        firstName?: string;
        lastName?: string;
        email: string;
        phone?: string;
        instagram?: string;
        bio?: string;
        category?: string;
        photo?: string;
      }
    | undefined;
  if (!tableNumbers.length || !profile?.business || !profile?.email) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  const paymentMethod = body.paymentMethod === "stripe" ? "stripe" : "zelle";
  const origin = req.headers.get("origin") ?? undefined;
  try {
    const result = await createHold({ tableNumbers, promoCode: body.promoCode ?? null, profile, paymentMethod, origin });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof ConflictError) {
      return NextResponse.json({ error: "conflict", tables: e.tables }, { status: 409 });
    }
    if (e instanceof PromoExhaustedError) {
      return NextResponse.json({ error: "promo_exhausted" }, { status: 409 });
    }
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 400 });
  }
}
