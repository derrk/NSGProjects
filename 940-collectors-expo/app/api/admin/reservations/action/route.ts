import { NextResponse } from "next/server";
import { isAdmin } from "../../../../lib/admin-auth";
import { supabaseConfigured } from "../../../../lib/supabase";
import { setReservationStatus, resendConfirmation, setFeatured } from "../../../../lib/reservations-service";

type Action = "confirm" | "release" | "resend" | "feature" | "unfeature";
const ACTIONS: Action[] = ["confirm", "release", "resend", "feature", "unfeature"];

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  let resCode = "";
  let action: Action = "confirm";
  try {
    const body = await req.json();
    resCode = body.resCode;
    action = body.action;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!resCode || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    if (action === "resend") {
      // Throws if not configured, not confirmed, or the send is rejected — the
      // catch below surfaces the reason to the admin UI as a 400.
      await resendConfirmation(resCode);
      return NextResponse.json({ ok: true });
    }
    if (action === "feature" || action === "unfeature") {
      await setFeatured(resCode, action === "feature");
      return NextResponse.json({ ok: true });
    }
    await setReservationStatus(resCode, action);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 400 });
  }
}
