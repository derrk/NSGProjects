import ContactForm from "@/components/ContactForm";
import { Mail, MapPin, Camera, Globe, MessageCircle } from "lucide-react";

export const metadata = {
  title: "Contact | SlabCraft Displays",
  description: "Contact SlabCraft Displays with questions about orders, custom builds, or shipping.",
};

const faqs = [
  {
    q: "Do you make custom sizes?",
    a: "Yes! We build fully custom displays in any size. Submit a custom order request and describe what you need.",
  },
  {
    q: "Can you engrave logos?",
    a: "Absolutely. We can laser-engrave team logos, custom text, card titles, and artwork onto any display piece.",
  },
  {
    q: "How long do custom orders take?",
    a: "Most custom orders take 1–2 weeks from approval to ship, depending on complexity. Standard orders ship within 3–5 business days.",
  },
  {
    q: "What types of cards fit?",
    a: "Our slab stands fit all standard graded cases including PSA, BGS, CGC, and SGC. We also build for raw cards, sealed packs, and more.",
  },
  {
    q: "Do you ship nationwide?",
    a: "Yes, we ship to all 50 states. International shipping is available on request — contact us for rates.",
  },
];

export default function ContactPage() {
  return (
    <div>
      {/* Header */}
      <section className="bg-[#1a1612] text-[#f5f0e8] py-14">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <div className="text-[#c9a96e] text-sm font-semibold tracking-widest uppercase mb-3">
            Get In Touch
          </div>
          <h1 className="font-serif text-5xl font-bold mb-4">Contact Us</h1>
          <p className="text-[#a89880] text-lg">
            Questions about an order? Want to discuss a custom build? We&apos;d love to hear from you.
          </p>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Contact info */}
          <div>
            <h2 className="font-serif text-2xl font-bold text-[#1a1612] mb-6">
              Contact Info
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-[#c9a96e] mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-[#1a1612]">Email</div>
                  <div className="text-sm text-[#6b5e50]">hello@slabcraftdisplays.com</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-[#c9a96e] mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-[#1a1612]">Location</div>
                  <div className="text-sm text-[#6b5e50]">United States (ships nationwide)</div>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <div className="text-sm font-semibold text-[#1a1612] mb-3">Follow Along</div>
              <div className="flex gap-4">
                <a href="#" className="text-[#a89880] hover:text-[#c9a96e] transition-colors">
                  <Camera className="w-5 h-5" />
                </a>
                <a href="#" className="text-[#a89880] hover:text-[#c9a96e] transition-colors">
                  <Globe className="w-5 h-5" />
                </a>
                <a href="#" className="text-[#a89880] hover:text-[#c9a96e] transition-colors">
                  <MessageCircle className="w-5 h-5" />
                </a>
              </div>
            </div>

            <div className="mt-8 bg-[#f0e8d8] border border-[#e0d4bf] rounded-lg p-5">
              <div className="text-sm font-semibold text-[#1a1612] mb-1">Response Time</div>
              <p className="text-sm text-[#6b5e50]">
                We typically respond within 1 business day. For custom order inquiries, expect a quote within 2 business days.
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-2">
            <ContactForm />
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-20">
          <h2 className="font-serif text-3xl font-bold text-[#1a1612] mb-8 text-center">
            Frequently Asked Questions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {faqs.map((faq) => (
              <div key={faq.q} className="bg-white border border-[#e0d4bf] rounded-lg p-6">
                <h3 className="font-serif font-bold text-[#1a1612] mb-2">{faq.q}</h3>
                <p className="text-sm text-[#6b5e50] leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
