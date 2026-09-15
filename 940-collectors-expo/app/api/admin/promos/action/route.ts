import { NextResponse } from "next/server";
import { isAdmin } from "../../../../lib/admin-auth";
import { supabaseConfigured } from "../../../../lib/supabase";
import { setPromoActive, deletePromoCode } from "../../../../lib/promo-service";

type Action = "activate" | "deactivate" | "delete";

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  let code = "", action: Action = "deactivate";
  try {
    const body = await req.json();
    code = String(body.code ?? "");
    action = body.action;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!code || !["activate", "deactivate", "delete"].includes(action)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    if (action === "delete") await deletePromoCode(code);
    else await setPromoActive(code, action === "activate");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 400 });
  }
}
