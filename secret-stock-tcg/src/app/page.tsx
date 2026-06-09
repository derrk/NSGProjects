import Hero from '@/components/home/Hero';
import FeaturedCategories from '@/components/home/FeaturedCategories';
import FeaturedProducts from '@/components/home/FeaturedProducts';
import EventsPreview from '@/components/home/EventsPreview';
import CollectionsCTA from '@/components/home/CollectionsCTA';

export default function HomePage() {
  return (
    <>
      <Hero />
      <FeaturedCategories />
      <FeaturedProducts />
      <EventsPreview />
      <CollectionsCTA />
    </>
  );
}
