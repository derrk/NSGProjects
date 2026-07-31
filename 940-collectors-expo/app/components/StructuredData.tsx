import {
  SITE_URL,
  SITE_NAME,
  SITE_DESCRIPTION,
  CITIES,
  FAQS,
  VENUE,
  EVENT_DATE_ISO,
} from "../lib/site";

// JSON-LD structured data for local + event + FAQ rich results.
// Server component — renders <script type="application/ld+json"> into <body>.
export default function StructuredData() {
  const address = {
    "@type": "PostalAddress",
    ...(VENUE.streetAddress ? { streetAddress: VENUE.streetAddress } : {}),
    addressLocality: VENUE.city,
    addressRegion: VENUE.region,
    ...(VENUE.postalCode ? { postalCode: VENUE.postalCode } : {}),
    addressCountry: VENUE.country,
  };

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.jpg`,
    image: `${SITE_URL}/hero-backdrop.jpg`,
    description: SITE_DESCRIPTION,
    address,
    areaServed: CITIES.map((c) => ({ "@type": "City", name: c })),
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
  };

  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const event = EVENT_DATE_ISO
    ? {
        "@context": "https://schema.org",
        "@type": "Event",
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        startDate: EVENT_DATE_ISO,
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        image: [`${SITE_URL}/hero-backdrop.jpg`],
        location: {
          "@type": "Place",
          name: `${VENUE.name} — ${VENUE.room}`,
          address,
        },
        organizer: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
        offers: {
          "@type": "Offer",
          name: "Vendor table",
          price: "99.99",
          priceCurrency: "USD",
          url: `${SITE_URL}/reserve`,
          availability: "https://schema.org/InStock",
        },
      }
    : null;

  const blocks = [organization, website, faqPage, ...(event ? [event] : [])];

  return (
    <>
      {blocks.map((b, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(b) }}
        />
      ))}
    </>
  );
}
