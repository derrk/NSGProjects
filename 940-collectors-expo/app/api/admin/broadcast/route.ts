import { NextResponse } from "next/server";
import { isAdmin } from "../../../lib/admin-auth";
import { supabaseConfigured } from "../../../lib/supabase";
import { broadcastToVendors } from "../../../lib/reservations-service";
import { emailConfigured } from "../../../lib/email";

const ALLOWED_STATUSES = ["pending", "confirmed"];

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  if (!emailConfigured()) {
    return NextResponse.json({ error: "email_not_configured" }, { status: 503 });
  }

  let statuses: string[] = [];
  let subject = "";
  let message = "";
  try {
    const body = await req.json();
    statuses = Array.isArray(body.statuses) ? body.statuses : [];
    subject = typeof body.subject === "string" ? body.subject.trim() : "";
    message = typeof body.message === "string" ? body.message.trim() : "";
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  statuses = statuses.filter((s) => ALLOWED_STATUSES.includes(s));
  if (statuses.length === 0) {
    return NextResponse.json({ error: "no_recipients_selected" }, { status: 400 });
  }
  if (!subject || !message) {
    return NextResponse.json({ error: "subject_and_message_required" }, { status: 400 });
  }

  try {
    const result = await broadcastToVendors(statuses, subject, message);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 400 });
  }
}
