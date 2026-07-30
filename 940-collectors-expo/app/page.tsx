import Nav from "./components/Nav";
import Hero from "./components/Hero";
import About from "./components/About";
import VendorSection from "./components/VendorSection";
import WhyVend from "./components/WhyVend";
import VendorForm from "./components/VendorForm";
import EventInfo from "./components/EventInfo";
import UpcomingEvents from "./components/UpcomingEvents";
import FeaturedVendors from "./components/FeaturedVendors";
import Sponsorship from "./components/Sponsorship";
import Gallery from "./components/Gallery";
import FAQ from "./components/FAQ";
import Contact from "./components/Contact";
import Footer from "./components/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <About />
        <VendorSection />
        <WhyVend />
        <VendorForm />
        <EventInfo />
        <UpcomingEvents />
        <FeaturedVendors />
        <Sponsorship />
        <Gallery />
        <FAQ />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
