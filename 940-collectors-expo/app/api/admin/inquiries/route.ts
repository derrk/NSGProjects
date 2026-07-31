import { NextResponse } from "next/server";
import { isAdmin } from "../../../lib/admin-auth";
import { supabaseConfigured } from "../../../lib/supabase";
import { listInquiries } from "../../../lib/inquiries-service";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ configured: false, inquiries: [] });
  try {
    const inquiries = await listInquiries();
    return NextResponse.json({ configured: true, inquiries });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
