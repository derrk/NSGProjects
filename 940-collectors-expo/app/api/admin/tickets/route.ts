import { NextResponse } from "next/server";
import { isAdmin } from "../../../lib/admin-auth";
import { supabaseConfigured } from "../../../lib/supabase";
import { listTicketOrders } from "../../../lib/tickets-service";

// Admin: list ticket orders for check-in + export.
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ configured: false, tickets: [] });
  try {
    const tickets = await listTicketOrders();
    return NextResponse.json({ configured: true, tickets });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e), tickets: [] }, { status: 500 });
  }
}
