import type { Metadata } from "next";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import ReserveClient from "./ReserveClient";
import ExpoFloorMap from "./ExpoFloorMap";
import { RESERVATIONS_MODE } from "../lib/site";

export const metadata: Metadata =
  RESERVATIONS_MODE === "open"
    ? {
        title: "Reserve a Vendor Table",
        description:
          "Reserve your vendor table at the 940 Collector's Expo. Pick your spot on the interactive floor map and check out.",
        alternates: { canonical: "/reserve" },
      }
    : RESERVATIONS_MODE === "preview"
    ? {
        title: "Vendor Floor Plan",
        description:
          "Preview the vendor floor plan for the next 940 Collector's Expo. Table booking opens soon.",
        alternates: { canonical: "/reserve" },
      }
    : {
        title: "Vendor Tables — Sold Out",
        description: "Vendor tables for the 940 Collector's Expo are sold out.",
        alternates: { canonical: "/reserve" },
      };

function PreviewView() {
  return (
    <main className="min-h-screen px-4 sm:px-8 pt-24 pb-16 max-w-4xl mx-auto">
      <div className="text-center mb-6">
        <p className="pixel-eyebrow text-[#A855F7] mb-2">Next Show &middot; Rooms 1&ndash;4</p>
        <h1 className="text-3xl sm:text-4xl font-black text-white mb-3">Vendor Floor Plan</h1>
        <div className="inline-block rounded-xl bg-[#FACC15]/10 border border-[#FACC15]/40 text-[#FACC15] text-sm font-semibold px-4 py-2">
          Table booking opens soon — here&apos;s the floor plan for our next show. 114 tables.
        </div>
      </div>

      <ExpoFloorMap maxHeight="80vh" />

      <p className="text-center text-sm text-[#E5E7EB]/50 mt-6">
        Want a table? Booking opens shortly — check back soon, or reach out to reserve early.
      </p>
    </main>
  );
}

function SoldOut() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-32">
      <div className="retro-panel p-8 sm:p-10 max-w-lg text-center">
        <p className="pixel-eyebrow text-[#FACC15] mb-3">Vendor Booth Sales</p>
        <h1 className="text-3xl sm:text-4xl font-black text-white mb-4">Tables Are Sold Out</h1>
        <p className="text-[#E5E7EB]/70 leading-relaxed mb-8">
          Every vendor table is booked — thank you to all our vendors! Want to attend? Grab your
          admission tickets online below.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a href="/tickets" className="retro-btn">Buy Tickets</a>
          <a href="/" className="retro-btn-outline">Back to Home</a>
        </div>
      </div>
    </main>
  );
}

export default function ReservePage() {
  return (
    <>
      <Nav />
      {RESERVATIONS_MODE === "open" ? (
        <ReserveClient />
      ) : RESERVATIONS_MODE === "preview" ? (
        <PreviewView />
      ) : (
        <SoldOut />
      )}
      <Footer />
    </>
  );
}
