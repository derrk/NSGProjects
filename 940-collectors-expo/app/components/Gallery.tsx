"use client";

import { motion } from "framer-motion";

// Real photography from past shows. To add more, drop the file in
// public/gallery/ and add a line here — the grid and layout follow.
const photos: { src: string; alt: string; w: number; h: number }[] = [
  {
    src: "/gallery/cosplay-duo.jpg",
    alt: "Two One Piece cosplayers posing together on the show floor at a past 940 Collector's Expo",
    w: 1050,
    h: 1400,
  },
  {
    src: "/gallery/raffle-draw.jpg",
    alt: "A young attendee drawing a raffle ticket and winning a box of trading cards",
    w: 1069,
    h: 1400,
  },
  {
    src: "/gallery/lego-winner.jpg",
    alt: "An attendee holding the LEGO Super Mario Piranha Plant set he won at the show",
    w: 1050,
    h: 1400,
  },
];

export default function Gallery() {
  return (
    <section className="py-28 lg:py-36 bg-[#171022] relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-[#A855F7] pixel-eyebrow mb-4">Gallery</p>
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-4">
            The Show Floor
          </h2>
          <p className="text-lg text-[#E5E7EB]/60 max-w-xl mx-auto">
            Scenes from past shows — cosplay, giveaways, and collectors walking away
            with something they came for. Here&apos;s what a 940 Collector&apos;s Expo
            looks like.
          </p>
        </motion.div>

        {/* Masonry-style grid — grows as more photos are added above. */}
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4 max-w-5xl mx-auto">
          {photos.map((p, i) => (
            <motion.figure
              key={p.src}
              initial={{ opacity: 0, scale: 0.97 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="break-inside-avoid rounded-2xl overflow-hidden border border-white/5 bg-[#0B0713] hover:border-[#A855F7]/30 transition-all duration-300 hover:-translate-y-0.5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.src}
                alt={p.alt}
                width={p.w}
                height={p.h}
                loading="lazy"
                decoding="async"
                className="block w-full h-auto"
              />
            </motion.figure>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="text-center mt-10"
        >
          <p className="text-[#E5E7EB]/30 text-sm">
            More photos from past shows coming soon — the gallery is updated after
            each event.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
