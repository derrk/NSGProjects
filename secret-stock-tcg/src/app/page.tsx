import Hero from '@/components/home/Hero';
import FeaturedCategories from '@/components/home/FeaturedCategories';
import FeaturedProducts from '@/components/home/FeaturedProducts';
// EventsPreview hidden for inventory-showcase version — uncomment to restore
// import EventsPreview from '@/components/home/EventsPreview';
import CollectionsCTA from '@/components/home/CollectionsCTA';
import LocalPresence from '@/components/home/LocalPresence';

export default function HomePage() {
  return (
    <>
      <Hero />
      <FeaturedCategories />
      <FeaturedProducts />
      {/* <EventsPreview /> — hidden for inventory-showcase version */}
      <CollectionsCTA />
      <LocalPresence />
    </>
  );
}
