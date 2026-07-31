import { NextResponse } from "next/server";
import { isAdmin } from "../../../../lib/admin-auth";
import { supabaseConfigured } from "../../../../lib/supabase";
import { setInquiryStatus } from "../../../../lib/inquiries-service";

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  let id = "";
  let status: "new" | "archived" = "archived";
  try {
    const body = await req.json();
    id = body.id;
    status = body.status;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!id || (status !== "new" && status !== "archived")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    await setInquiryStatus(id, status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 400 });
  }
}
