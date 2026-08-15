import { NextResponse } from "next/server";
import { isAdmin } from "../../../../lib/admin-auth";
import { supabaseConfigured } from "../../../../lib/supabase";
import { changeReservationTables, ConflictError } from "../../../../lib/reservations-service";

// Admin: reassign which table number(s) a reservation holds (moves them on the map too).
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  let resCode = "";
  let tables: number[] = [];
  try {
    const body = await req.json();
    resCode = body.resCode;
    tables = Array.isArray(body.tables) ? body.tables.map(Number).filter((n: number) => Number.isInteger(n)) : [];
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!resCode || tables.length === 0) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    await changeReservationTables(resCode, tables);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ConflictError) {
      return NextResponse.json({ error: "conflict", tables: e.tables }, { status: 409 });
    }
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 400 });
  }
}
