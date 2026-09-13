import { NextResponse } from "next/server";
import { isAdmin } from "../../../../lib/admin-auth";
import { supabaseConfigured } from "../../../../lib/supabase";
import { createAdminHold, ConflictError } from "../../../../lib/reservations-service";

// Admin-only: put table(s) on hold with just an optional label (no vendor info).
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  let tableNumbers: number[] = [];
  let label: string | undefined;
  try {
    const body = await req.json();
    tableNumbers = Array.isArray(body.tableNumbers) ? body.tableNumbers.map(Number) : [];
    label = typeof body.label === "string" ? body.label : undefined;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!tableNumbers.length) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    const result = await createAdminHold(tableNumbers, label);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof ConflictError) return NextResponse.json({ error: "conflict", tables: e.tables }, { status: 409 });
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 400 });
  }
}
