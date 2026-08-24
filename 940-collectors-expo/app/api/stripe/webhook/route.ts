import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "../../../lib/stripe";
import { setReservationStatus, getResCodeByStripeSession, releaseIfPending } from "../../../lib/reservations-service";

// Must run on the Node runtime (Stripe uses Node crypto) and never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return new NextResponse("stripe not configured", { status: 503 });
  }

  // Signature verification requires the RAW body — do not parse it first.
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new NextResponse("missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    console.error("[stripe] webhook signature failed:", (err as Error)?.message ?? err);
    return new NextResponse("invalid signature", { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid") {
        const resCode =
          session.client_reference_id ||
          (session.metadata?.resCode as string | undefined) ||
          (await getResCodeByStripeSession(session.id));
        if (resCode) {
          // Idempotent — a retried delivery won't double-confirm or double-email.
          await setReservationStatus(resCode, "confirm", { source: "stripe" });
        } else {
          console.error("[stripe] no reservation found for session", session.id);
        }
      }
    } else if (event.type === "checkout.session.expired") {
      // The card session lapsed unpaid — free the abandoned hold's tables.
      const session = event.data.object as Stripe.Checkout.Session;
      const resCode =
        session.client_reference_id ||
        (session.metadata?.resCode as string | undefined) ||
        (await getResCodeByStripeSession(session.id));
      if (resCode) await releaseIfPending(resCode);
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe] webhook handler error:", (err as Error)?.message ?? err);
    // Non-2xx so Stripe retries (it retries for up to ~3 days).
    return new NextResponse("handler error", { status: 500 });
  }
}
