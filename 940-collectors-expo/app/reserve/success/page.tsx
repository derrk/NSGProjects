import Link from "next/link";
import { CheckCircle, Clock } from "lucide-react";
import { getStripe } from "../../lib/stripe";

export const metadata = {
  title: "Payment received",
  robots: { index: false },
};

export default async function ReserveSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  const stripe = getStripe();

  // Verify against Stripe before asserting payment (webhook is the source of
  // truth for the DB; this just controls what the returning vendor sees).
  let paid = false;
  if (stripe && session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      paid = session.payment_status === "paid";
    } catch {
      paid = false;
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="retro-panel p-8 max-w-md w-full text-center">
        <div
          className={`w-16 h-16 rounded-2xl border flex items-center justify-center mx-auto mb-5 ${
            paid ? "bg-[#A855F7]/15 border-[#A855F7]/40" : "bg-[#FACC15]/15 border-[#FACC15]/40"
          }`}
        >
          {paid ? (
            <CheckCircle size={32} className="text-[#A855F7]" />
          ) : (
            <Clock size={32} className="text-[#FACC15]" />
          )}
        </div>
        {paid ? (
          <>
            <h1 className="text-2xl font-black text-white mb-2">You&apos;re confirmed! 🎉</h1>
            <p className="text-[#E5E7EB]/60 text-sm mb-6 leading-relaxed">
              Payment received — your vendor table is locked in. We&apos;ve emailed your
              confirmation and Stripe has sent your receipt. See you at the 940 Collector&apos;s Expo!
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-black text-white mb-2">Thanks — finalizing your payment</h1>
            <p className="text-[#E5E7EB]/60 text-sm mb-6 leading-relaxed">
              If your payment went through, you&apos;ll get a confirmation email shortly and your
              table will show as reserved on the map. If you didn&apos;t complete checkout, your hold
              will reopen automatically — you can pick your tables again or pay by Zelle.
            </p>
          </>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/reserve" className="retro-btn">View the floor map</Link>
          <Link href="/" className="retro-btn-outline">Back to home</Link>
        </div>
      </div>
    </main>
  );
}
