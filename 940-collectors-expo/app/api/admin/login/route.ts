import { NextResponse } from "next/server";
import { setAdminCookie } from "../../../lib/admin-auth";

export async function POST(req: Request) {
  const expected = process.env.ADMIN_PASSCODE;
  if (!expected) {
    return NextResponse.json({ error: "admin_not_configured" }, { status: 503 });
  }
  let passcode = "";
  try {
    ({ passcode } = await req.json());
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (passcode !== expected) {
    return NextResponse.json({ error: "bad_passcode" }, { status: 401 });
  }
  await setAdminCookie();
  return NextResponse.json({ ok: true });
}
