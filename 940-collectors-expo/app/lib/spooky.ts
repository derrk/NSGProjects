"use client";

// Halloween flourish: a real bat-colony recording + a giant WAVE of bats sweeping
// across the screen, triggered on fun moments (selecting a table, adding a
// ticket). Fails silently, and skips the animation when the user prefers
// reduced motion.

const BAT_SOUND_SRC = "/sfx/bats.mp3";
let batAudio: HTMLAudioElement | null = null;

function playBatSound() {
  try {
    if (typeof Audio === "undefined") return;
    if (!batAudio) {
      batAudio = new Audio(BAT_SOUND_SRC);
      batAudio.preload = "auto";
      batAudio.volume = 0.65;
    }
    batAudio.currentTime = 0; // restart so every tap re-triggers the screech
    const p = batAudio.play();
    if (p && typeof p.catch === "function") p.catch(() => {}); // ignore autoplay blocks
  } catch {
    /* audio unavailable — ignore */
  }
}

const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// A giant WAVE of bats surging across the screen — released in a tight stagger
// so they read as one swarm, spread over the full height, flapping as they go.
function flyBatSwarm(n = 34) {
  try {
    if (typeof document === "undefined" || reducedMotion()) return;
    for (let i = 0; i < n; i++) {
      const bat = document.createElement("div");
      bat.textContent = "🦇";
      bat.setAttribute("aria-hidden", "true");
      const top = 3 + Math.random() * 90; // fill the whole screen height
      const size = 22 + Math.random() * 30; // bigger, varied
      const dur = 2200 + Math.random() * 1500; // sweeping wave
      const drift = Math.random() * 24 - 12; // vertical wander
      bat.style.cssText = `position:fixed;left:-64px;top:${top}vh;font-size:${size}px;z-index:9998;pointer-events:none;will-change:transform;filter:drop-shadow(0 0 3px rgba(0,0,0,.55));`;
      document.body.appendChild(bat);
      const anim = bat.animate(
        [
          { transform: "translate(0,0) rotate(-12deg) scaleX(1)" },
          { transform: `translate(30vw,${drift * 0.6}vh) rotate(10deg) scaleX(0.5)`, offset: 0.25 },
          { transform: `translate(58vw,${-drift * 0.5}vh) rotate(-10deg) scaleX(1)`, offset: 0.55 },
          { transform: `translate(85vw,${drift * 0.4}vh) rotate(10deg) scaleX(0.5)`, offset: 0.8 },
          { transform: "translate(124vw,0) rotate(-8deg) scaleX(1)" },
        ],
        { duration: dur, delay: i * 38, easing: "ease-in-out" } // tight stagger = a wave
      );
      anim.onfinish = () => bat.remove();
    }
  } catch {
    /* ignore */
  }
}

export function spookyFx() {
  playBatSound();
  flyBatSwarm();
}
