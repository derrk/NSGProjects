import Nav from "./Nav";
import Footer from "./Footer";
import { ArrowRight, ArrowLeft } from "lucide-react";

export interface LocalLandingProps {
  eyebrow: string;
  h1: string;
  lede: string;
  findTitle?: string;
  find?: string[];
  sections: { heading: string; body: string }[];
  nearby?: string;
}

export default function LocalLanding({
  eyebrow,
  h1,
  lede,
  findTitle = "What you'll find",
  find = [],
  sections,
  nearby,
}: LocalLandingProps) {
  return (
    <>
      <Nav />
      <main className="min-h-screen pt-28 pb-24 bg-[#0B0713]">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[#E5E7EB]/50 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft size={15} /> 940 Collector&apos;s Expo home
          </a>

          <p className="pixel-eyebrow text-[#A855F7] mb-4">{eyebrow}</p>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight mb-5">
            {h1}
          </h1>
          <p className="text-lg text-[#E5E7EB]/70 leading-relaxed mb-8">{lede}</p>

          <div className="flex flex-col sm:flex-row gap-4 mb-12">
            <a href="/reserve" className="retro-btn group">
              Reserve a Table
              <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
            </a>
            <a href="/#contact" className="retro-btn-outline">
              Get Event Updates
            </a>
          </div>

          {find.length > 0 && (
            <div className="retro-panel p-6 mb-12">
              <p className="pixel-eyebrow text-[#FACC15] mb-4">{findTitle}</p>
              <div className="flex flex-wrap gap-2">
                {find.map((f) => (
                  <span
                    key={f}
                    className="px-3 py-1.5 rounded-full text-sm font-semibold bg-[#0B0713] border border-white/10 text-[#E5E7EB]/75"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-8">
            {sections.map((s) => (
              <div key={s.heading}>
                <h2 className="text-xl lg:text-2xl font-bold text-white mb-3">{s.heading}</h2>
                <p className="text-[#E5E7EB]/70 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>

          {nearby && (
            <p className="text-sm text-[#E5E7EB]/50 mt-10 leading-relaxed border-t border-white/10 pt-6">
              {nearby}
            </p>
          )}

          {/* Closing CTA */}
          <div className="retro-panel p-8 mt-12 text-center">
            <h2 className="text-2xl font-black text-white mb-2">Want a table at the show?</h2>
            <p className="text-[#E5E7EB]/60 mb-6">
              Pick your exact spot on the interactive floor map — tables start at $99.99.
            </p>
            <a href="/reserve" className="retro-btn group inline-flex">
              Reserve Your Table
              <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
            </a>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
