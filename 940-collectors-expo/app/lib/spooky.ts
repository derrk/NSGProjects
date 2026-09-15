"use client";

// Halloween flourish: a short eerie sound + a couple of bats flapping across the
// screen. Triggered on fun moments (selecting a table, adding a ticket). Fails
// silently and skips the animation when the user prefers reduced motion.

let ctx: AudioContext | null = null;

function playSpooky() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(170, now + 0.32);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.03); // quiet
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    // vibrato for an eerie wobble
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 17;
    lfoGain.gain.value = 30;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    lfo.start(now);
    osc.stop(now + 0.44);
    lfo.stop(now + 0.44);
  } catch {
    /* audio not available — ignore */
  }
}

function flyBats(n = 2) {
  try {
    if (typeof document === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    for (let i = 0; i < n; i++) {
      const bat = document.createElement("div");
      bat.textContent = "🦇";
      bat.setAttribute("aria-hidden", "true");
      const top = 18 + Math.random() * 58;
      const size = 22 + Math.random() * 18;
      const dur = 1200 + Math.random() * 700;
      bat.style.cssText = `position:fixed;left:-48px;top:${top}vh;font-size:${size}px;z-index:9998;pointer-events:none;will-change:transform;`;
      document.body.appendChild(bat);
      const anim = bat.animate(
        [
          { transform: "translate(0,0) rotate(-10deg) scaleX(1)" },
          { transform: "translate(28vw,-7vh) rotate(8deg) scaleX(0.65)", offset: 0.25 },
          { transform: "translate(55vw,5vh) rotate(-8deg) scaleX(1)", offset: 0.55 },
          { transform: "translate(82vw,-4vh) rotate(8deg) scaleX(0.65)", offset: 0.8 },
          { transform: "translate(116vw,2vh) rotate(-6deg) scaleX(1)" },
        ],
        { duration: dur, delay: i * 130, easing: "ease-in-out" }
      );
      anim.onfinish = () => bat.remove();
    }
  } catch {
    /* ignore */
  }
}

export function spookyFx() {
  playSpooky();
  flyBats();
}
