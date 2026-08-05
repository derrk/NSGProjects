import {
  SITE_URL,
  SITE_NAME,
  SITE_DESCRIPTION,
  CITIES,
  VENUE,
  EVENT_DATE_ISO,
  EVENT_END_ISO,
  ADMISSION,
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

  const event = EVENT_DATE_ISO
    ? {
        "@context": "https://schema.org",
        "@type": "Event",
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        startDate: EVENT_DATE_ISO,
        ...(EVENT_END_ISO ? { endDate: EVENT_END_ISO } : {}),
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
          name: "General admission",
          price: ADMISSION.doorPrice,
          priceCurrency: "USD",
          url: SITE_URL,
          availability: "https://schema.org/InStock",
          validFrom: EVENT_DATE_ISO,
        },
      }
    : null;

  const blocks = [organization, website, ...(event ? [event] : [])];

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
