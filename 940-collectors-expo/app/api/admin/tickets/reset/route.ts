import { NextResponse } from "next/server";
import { isAdmin } from "../../../../lib/admin-auth";
import { supabaseConfigured } from "../../../../lib/supabase";
import { archiveAllTickets } from "../../../../lib/tickets-service";

// Admin-only: reset online-ticket counts for a new show (tickets ONLY — does not
// touch table reservations/holds). Paid orders become 'archived' (kept as records).
export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  try {
    const result = await archiveAllTickets();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 400 });
  }
}
