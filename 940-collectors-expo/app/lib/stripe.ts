import "server-only";
import Stripe from "stripe";
import { SITE_NAME, SITE_URL } from "./site";

// Stripe card payments via hosted Checkout. Gated on STRIPE_SECRET_KEY — if it's
// absent, card checkout is disabled and the site falls back to Zelle only.
//   STRIPE_SECRET_KEY   — sk_test_… (test) then sk_live_… (live), from the Stripe dashboard
//   STRIPE_WEBHOOK_SECRET — whsec_…, from the webhook endpoint you create in Stripe
// apiVersion is intentionally omitted so the account default is used (Stripe's
// own Next.js sample does the same; avoids TS literal-version friction).
const KEY = process.env.STRIPE_SECRET_KEY;

const stripe = KEY ? new Stripe(KEY) : null;

export function stripeConfigured(): boolean {
  return !!stripe;
}

// The webhook route needs the client to verify signatures.
export function getStripe(): Stripe | null {
  return stripe;
}

export interface CheckoutSessionInfo {
  url: string | null;
  sessionId: string;
  expiresAtIso: string;
}

// Creates a hosted Checkout Session for one vendor reservation and returns the
// URL to redirect the browser to. Amount is server-computed (never trust the client).
export async function createCheckoutSession(opts: {
  resCode: string;
  reservationId: string;
  amountCents: number;
  businessName: string;
  email: string;
  origin: string;
}): Promise<CheckoutSessionInfo | null> {
  if (!stripe) return null;
  const origin = opts.origin || SITE_URL; // fall back to the configured site URL
  // Expire an unpaid checkout (and its table hold) after 60 min so abandoned
  // card sessions don't sit on a table (Stripe allows 30 min – 24 h).
  const expiresAtUnix = Math.floor(Date.now() / 1000) + 60 * 60;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    // Card only → payment settles synchronously, so checkout.session.completed
    // always arrives 'paid' within the hold window (no delayed ACH settlement).
    payment_method_types: ["card"],
    expires_at: expiresAtUnix,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: opts.amountCents,
          product_data: {
            name: `${SITE_NAME} — Vendor Table`,
            description: `Reservation ${opts.resCode} · ${opts.businessName}`,
          },
        },
      },
    ],
    customer_email: opts.email || undefined,
    client_reference_id: opts.resCode,
    // The webhook reconciles the payment back to the reservation via metadata.
    metadata: { resCode: opts.resCode, reservationId: opts.reservationId },
    success_url: `${origin}/reserve/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/reserve?canceled=1`,
  });
  // Hold the tables until 15 min AFTER the session hard-closes — a payment can
  // only happen while the session is open, so this guarantees the expiry sweep
  // never releases a hold whose webhook confirmation is still in flight.
  const holdUntilUnix = (session.expires_at ?? Math.floor(Date.now() / 1000) + 60 * 60) + 15 * 60;
  return {
    url: session.url,
    sessionId: session.id,
    expiresAtIso: new Date(holdUntilUnix * 1000).toISOString(),
  };
}
