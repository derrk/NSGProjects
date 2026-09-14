import { NextResponse } from "next/server";
import { isAdmin } from "../../../../lib/admin-auth";
import { supabaseConfigured } from "../../../../lib/supabase";
import { archiveAllActive } from "../../../../lib/reservations-service";
import { archiveAllTickets } from "../../../../lib/tickets-service";

// Admin-only: reset for a fresh show — release every current hold/confirmation
// AND reset paid-ticket counts. Rows are kept ('released' / 'archived') as records;
// the UI double-confirms first.
export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  try {
    const res = await archiveAllActive();
    let tickets = { count: 0 };
    try {
      tickets = await archiveAllTickets();
    } catch {
      /* tickets table may not exist / no tickets — reservations reset still counts */
    }
    return NextResponse.json({ ok: true, count: res.count, ticketCount: tickets.count });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 400 });
  }
}
