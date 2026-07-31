import { FAQS, type Faq } from "../lib/site";

// Emit FAQPage JSON-LD. Render ONLY on pages that actually show these FAQs.
export default function FaqJsonLd({ faqs = FAQS }: { faqs?: Faq[] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
