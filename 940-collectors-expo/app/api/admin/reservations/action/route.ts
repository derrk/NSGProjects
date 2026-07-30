import { NextResponse } from "next/server";
import { isAdmin } from "../../../../lib/admin-auth";
import { supabaseConfigured } from "../../../../lib/supabase";
import { setReservationStatus } from "../../../../lib/reservations-service";

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  let resCode = "";
  let action: "confirm" | "release" = "confirm";
  try {
    const body = await req.json();
    resCode = body.resCode;
    action = body.action;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!resCode || (action !== "confirm" && action !== "release")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    await setReservationStatus(resCode, action);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 400 });
  }
}
