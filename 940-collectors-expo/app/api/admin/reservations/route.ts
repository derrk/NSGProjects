import { NextResponse } from "next/server";
import { isAdmin } from "../../../lib/admin-auth";
import { supabaseConfigured } from "../../../lib/supabase";
import { listReservations } from "../../../lib/reservations-service";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!supabaseConfigured()) {
    return NextResponse.json({ configured: false, reservations: [] });
  }
  try {
    const reservations = await listReservations();
    return NextResponse.json({ configured: true, reservations });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
