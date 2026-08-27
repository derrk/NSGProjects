import { NextResponse } from "next/server";
import { isAdmin } from "../../../lib/admin-auth";
import { supabaseConfigured } from "../../../lib/supabase";
import { broadcastToVendors } from "../../../lib/reservations-service";
import { emailConfigured } from "../../../lib/email";

// The attachment path sends individually (throttled), so give the function room
// to finish a full vendor list within one request instead of timing out midway.
export const maxDuration = 60;

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
  let attachment: { filename: string; content: string } | null = null;
  try {
    const body = await req.json();
    statuses = Array.isArray(body.statuses) ? body.statuses : [];
    subject = typeof body.subject === "string" ? body.subject.trim() : "";
    message = typeof body.message === "string" ? body.message.trim() : "";
    const a = body.attachment;
    if (a && typeof a.filename === "string" && typeof a.content === "string" && a.content.length) {
      attachment = { filename: a.filename, content: a.content };
    }
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
  // Cap attachment base64 well under Vercel's ~4.5MB request-body limit
  // (3.5M base64 chars ≈ a 2.6MB image). The client guards this too.
  if (attachment && attachment.content.length > 3_500_000) {
    return NextResponse.json({ error: "attachment_too_large" }, { status: 400 });
  }

  try {
    const result = await broadcastToVendors(statuses, subject, message, attachment);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 400 });
  }
}
