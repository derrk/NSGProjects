import { CITIES, VENUE } from "../lib/site";

export default function AreasServed() {
  return (
    <section id="areas" className="py-24 lg:py-32 bg-[#0B0713] relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[300px] rounded-full bg-[#A855F7]/6 blur-[120px] pointer-events-none" />
      <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center relative z-10">
        <p className="pixel-eyebrow text-[#A855F7] mb-4">Serving North Texas &amp; Texoma</p>
        <h2 className="text-3xl lg:text-5xl font-black text-white mb-5">
          A Card &amp; Collectibles Show Near You
        </h2>
        <p className="text-lg text-[#E5E7EB]/70 leading-relaxed max-w-2xl mx-auto mb-4">
          Held in <strong className="text-white">{VENUE.city}, {VENUE.region}</strong> at the{" "}
          {VENUE.name}, the 940 Collector&apos;s Expo is the trading card and collectibles event for
          the whole region — a short drive whether you&apos;re hunting Pokémon and sports cards, Funko
          Pops, comics, LEGO, action figures, video games, or anime figures.
        </p>
        <p className="text-sm text-[#E5E7EB]/50 max-w-2xl mx-auto mb-8">
          Collectors and vendors join us from across North Texas and Southern Oklahoma:
        </p>

        <div className="flex flex-wrap justify-center gap-2">
          {CITIES.map((city) => (
            <span
              key={city}
              className="px-3.5 py-1.5 rounded-full text-sm font-semibold bg-[#171022] border border-white/10 text-[#E5E7EB]/75"
            >
              {city}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
