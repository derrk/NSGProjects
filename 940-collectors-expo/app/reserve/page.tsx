import type { Metadata } from "next";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import ReserveClient from "./ReserveClient";

export const metadata: Metadata = {
  title: "Reserve a Table | 940 Collectors Expo",
  description:
    "Reserve your vendor table at the 940 Collectors Expo. Pick your spot on the floor map, add tables to your cart, and check out.",
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
