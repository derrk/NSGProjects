"use client";

// Halloween flourish: a spooky sound + critters drifting across the screen,
// triggered on fun moments (selecting a table, adding a ticket). Each trigger
// ALTERNATES between a bat flutter and a ghostly "wooo". Fails silently and
// skips the animation when the user prefers reduced motion.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// Rapid high-pitched chirps — a bat squeaking / fluttering past.
function playBatSound() {
  const ac = getCtx();
  if (!ac) return;
  try {
    const now = ac.currentTime;
    const chirps = 7;
    for (let i = 0; i < chirps; i++) {
      const t = now + i * 0.045;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "square";
      const base = 2600 + Math.random() * 800 - i * 80; // drift down as it passes
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 0.7, t + 0.03);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.035, t + 0.005); // quiet
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.05);
    }
  } catch {
    /* audio not available — ignore */
  }
}

// A slow, wobbling glissando that rises then sinks — a ghostly "wooooo".
function playGhostSound() {
  const ac = getCtx();
  if (!ac) return;
  try {
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.45);
    osc.frequency.exponentialRampToValueAtTime(230, now + 1.15);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.18);
    gain.gain.setValueAtTime(0.08, now + 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.25);
    // slow eerie wobble
    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 6;
    lfoGain.gain.value = 24;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(now);
    lfo.start(now);
    osc.stop(now + 1.3);
    lfo.stop(now + 1.3);
  } catch {
    /* audio not available — ignore */
  }
}

const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// A colony of bats flapping across the screen — slower, drifting flight.
function flyBats(n = 6) {
  try {
    if (typeof document === "undefined" || reducedMotion()) return;
    for (let i = 0; i < n; i++) {
      const bat = document.createElement("div");
      bat.textContent = "🦇";
      bat.setAttribute("aria-hidden", "true");
      const top = 12 + Math.random() * 66;
      const size = 22 + Math.random() * 20;
      const dur = 2800 + Math.random() * 1600; // slower than before (was ~1200–1900)
      bat.style.cssText = `position:fixed;left:-52px;top:${top}vh;font-size:${size}px;z-index:9998;pointer-events:none;will-change:transform;`;
      document.body.appendChild(bat);
      const anim = bat.animate(
        [
          { transform: "translate(0,0) rotate(-10deg) scaleX(1)" },
          { transform: "translate(28vw,-9vh) rotate(8deg) scaleX(0.6)", offset: 0.25 },
          { transform: "translate(55vw,6vh) rotate(-8deg) scaleX(1)", offset: 0.55 },
          { transform: "translate(82vw,-5vh) rotate(8deg) scaleX(0.6)", offset: 0.8 },
          { transform: "translate(118vw,3vh) rotate(-6deg) scaleX(1)" },
        ],
        { duration: dur, delay: i * 180, easing: "ease-in-out" }
      );
      anim.onfinish = () => bat.remove();
    }
  } catch {
    /* ignore */
  }
}

// A ghost drifting up the screen, fading in and out — pairs with the ghost sound.
function floatGhost() {
  try {
    if (typeof document === "undefined" || reducedMotion()) return;
    const g = document.createElement("div");
    g.textContent = "👻";
    g.setAttribute("aria-hidden", "true");
    const left = 8 + Math.random() * 74;
    const size = 34 + Math.random() * 22;
    g.style.cssText = `position:fixed;left:${left}vw;top:105vh;font-size:${size}px;z-index:9998;pointer-events:none;opacity:0;will-change:transform,opacity;`;
    document.body.appendChild(g);
    const anim = g.animate(
      [
        { transform: "translate(0,0) rotate(-5deg)", opacity: 0 },
        { transform: "translate(6vw,-32vh) rotate(5deg)", opacity: 0.85, offset: 0.3 },
        { transform: "translate(-6vw,-72vh) rotate(-5deg)", opacity: 0.7, offset: 0.7 },
        { transform: "translate(4vw,-116vh) rotate(4deg)", opacity: 0 },
      ],
      { duration: 3600, easing: "ease-in-out" }
    );
    anim.onfinish = () => g.remove();
  } catch {
    /* ignore */
  }
}

// Alternate bat / ghost on each trigger.
let fxCount = 0;

export function spookyFx() {
  const ghostTurn = fxCount % 2 === 1;
  fxCount++;
  if (ghostTurn) {
    playGhostSound();
    flyBats(); // still a colony of bats…
    floatGhost(); // …plus a drifting ghost to match the sound
  } else {
    playBatSound();
    flyBats();
  }
}
