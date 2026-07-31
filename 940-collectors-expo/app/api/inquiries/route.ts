import { NextResponse } from "next/server";
import { supabaseConfigured } from "../../lib/supabase";
import { createInquiry } from "../../lib/inquiries-service";

export const dynamic = "force-dynamic";

// Public: store a homepage "Reserve Your Table" inquiry.
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) return NextResponse.json({ error: "missing_email" }, { status: 400 });

  // No backend yet → accept but don't store (keeps the form usable in dev).
  if (!supabaseConfigured()) {
    return NextResponse.json({ ok: true, stored: false });
  }
  try {
    await createInquiry({
      business: body.business as string,
      contactName: body.contactName as string,
      email,
      phone: body.phone as string,
      products: Array.isArray(body.products) ? (body.products as string[]) : [],
      tablesRequested: body.tablesRequested as string,
      website: body.website as string,
      social: body.social as string,
      notes: body.notes as string,
    });
    return NextResponse.json({ ok: true, stored: true });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
