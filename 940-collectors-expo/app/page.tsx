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
import AreasServed from "./components/AreasServed";
import FAQ from "./components/FAQ";
import Contact from "./components/Contact";
import Footer from "./components/Footer";
import FaqJsonLd from "./components/FaqJsonLd";

export default function Home() {
  return (
    <>
      <FaqJsonLd />
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
        <AreasServed />
        <FAQ />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
