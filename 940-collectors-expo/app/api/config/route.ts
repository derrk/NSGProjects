import { NextResponse } from "next/server";
import { stripeConfigured } from "../../lib/stripe";
import { RESERVATIONS_OPEN } from "../../lib/site";

export const dynamic = "force-dynamic";

// Tiny public config flags. Deliberately does NOT touch the database — used by
// the tickets page so a page load doesn't cost a DB query.
export async function GET() {
  return NextResponse.json({
    stripeEnabled: stripeConfigured(),
    reservationsOpen: RESERVATIONS_OPEN,
  });
}
