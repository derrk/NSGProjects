import Link from "next/link";
import { CheckCircle, Clock } from "lucide-react";
import { getStripe } from "../../lib/stripe";

export const metadata = {
  title: "Tickets confirmed",
  robots: { index: false },
};

export default async function TicketsSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  const stripe = getStripe();
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
          {paid ? <CheckCircle size={32} className="text-[#A855F7]" /> : <Clock size={32} className="text-[#FACC15]" />}
        </div>
        {paid ? (
          <>
            <h1 className="text-2xl font-black text-white mb-2">Tickets confirmed! 🎟️</h1>
            <p className="text-[#E5E7EB]/60 text-sm mb-6 leading-relaxed">
              Payment received — we&apos;ve emailed your proof of purchase. Show that email (or just give
              your name) at the door. See you at the 940 Collector&apos;s Expo!
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-black text-white mb-2">Thanks — finalizing your order</h1>
            <p className="text-[#E5E7EB]/60 text-sm mb-6 leading-relaxed">
              If your payment went through, your proof-of-purchase email will arrive shortly. If you
              didn&apos;t complete checkout, you weren&apos;t charged — you can try again.
            </p>
          </>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/" className="retro-btn">Back to home</Link>
          <Link href="/tickets" className="retro-btn-outline">Buy more tickets</Link>
        </div>
      </div>
    </main>
  );
}
