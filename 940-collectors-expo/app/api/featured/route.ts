import { NextResponse } from "next/server";
import { supabaseConfigured } from "../../lib/supabase";
import { getFeaturedVendors } from "../../lib/reservations-service";

export const dynamic = "force-dynamic";

// Featured vendors for the homepage. Small payload (starred vendors only), so it
// stays cheap even though it includes their logos.
export async function GET() {
  if (!supabaseConfigured()) return NextResponse.json({ vendors: [] });
  try {
    const vendors = await getFeaturedVendors();
    return NextResponse.json({ vendors });
  } catch (e) {
    return NextResponse.json(
      { vendors: [], error: String((e as Error)?.message ?? e) },
      { status: 500 }
    );
  }
}
