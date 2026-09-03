import type { Metadata } from "next";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import ReserveClient from "./ReserveClient";
import { RESERVATIONS_OPEN, EVENT_DATE_LABEL } from "../lib/site";

export const metadata: Metadata = RESERVATIONS_OPEN
  ? {
      title: "Reserve a Vendor Table",
      description:
        "Reserve your vendor table at the 940 Collector's Expo in Wichita Falls, TX. Pick your spot on the interactive floor map, add tables to your cart, and check out. Tables from $99.99.",
      alternates: { canonical: "/reserve" },
    }
  : {
      title: "Vendor Tables — Sold Out",
      description:
        "Vendor tables for the 940 Collector's Expo are sold out. Buy your admission tickets online to attend.",
      alternates: { canonical: "/reserve" },
    };

function SoldOut() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-32">
      <div className="retro-panel p-8 sm:p-10 max-w-lg text-center">
        <p className="pixel-eyebrow text-[#FACC15] mb-3">Vendor Booth Sales</p>
        <h1 className="text-3xl sm:text-4xl font-black text-white mb-4">
          Tables Are Sold Out
        </h1>
        <p className="text-[#E5E7EB]/70 leading-relaxed mb-2">
          Every vendor table for the {EVENT_DATE_LABEL} debut is booked — thank
          you to all our vendors! We&apos;re fully packed for the show floor.
        </p>
        <p className="text-[#E5E7EB]/70 leading-relaxed mb-8">
          Want to attend? Grab your admission tickets online below and come shop
          the show.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a href="/tickets" className="retro-btn">
            Buy Tickets
          </a>
          <a href="/" className="retro-btn-outline">
            Back to Home
          </a>
        </div>
      </div>
    </main>
  );
}

export default function ReservePage() {
  return (
    <>
      <Nav />
      {RESERVATIONS_OPEN ? <ReserveClient /> : <SoldOut />}
      <Footer />
    </>
  );
}
