import { NextResponse } from "next/server";
import { isAdmin } from "../../../../lib/admin-auth";
import { supabaseConfigured } from "../../../../lib/supabase";
import { updateReservation, type ReservationEdit } from "../../../../lib/reservations-service";

// String-valued fields only (amountCents is a number, handled separately below).
type StringField = "business" | "instagram" | "bio" | "firstName" | "lastName" | "email" | "phone" | "category";
const ALLOWED: StringField[] = [
  "business",
  "instagram",
  "bio",
  "firstName",
  "lastName",
  "email",
  "phone",
  "category",
];

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  let resCode = "";
  let fieldsIn: Record<string, unknown> = {};
  try {
    const body = await req.json();
    resCode = body.resCode;
    fieldsIn = body.fields ?? {};
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!resCode) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // Whitelist editable fields.
  const fields: ReservationEdit = {};
  for (const k of ALLOWED) {
    if (typeof fieldsIn[k] === "string") fields[k] = fieldsIn[k] as string;
  }
  // Amount collected is a number (cents), handled separately from the string fields.
  if (
    typeof fieldsIn.amountCents === "number" &&
    Number.isFinite(fieldsIn.amountCents) &&
    fieldsIn.amountCents >= 0
  ) {
    fields.amountCents = Math.round(fieldsIn.amountCents);
  }
  if (fields.business !== undefined && !fields.business.trim()) {
    return NextResponse.json({ error: "business_required" }, { status: 400 });
  }

  try {
    await updateReservation(resCode, fields);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 400 });
  }
}
