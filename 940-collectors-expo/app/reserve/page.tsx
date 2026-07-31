import type { Metadata } from "next";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import ReserveClient from "./ReserveClient";

export const metadata: Metadata = {
  title: "Reserve a Vendor Table",
  description:
    "Reserve your vendor table at the 940 Collector's Expo in Wichita Falls, TX. Pick your spot on the interactive floor map, add tables to your cart, and check out. Tables from $99.99.",
  alternates: { canonical: "/reserve" },
};

export default function ReservePage() {
  return (
    <>
      <Nav />
      <ReserveClient />
      <Footer />
    </>
  );
}
