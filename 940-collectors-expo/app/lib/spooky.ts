"use client";

// Halloween flourish: a screeching WAVE of bats sweeps across the screen on fun
// moments (selecting a table, adding a ticket) — a Batman-style bat swarm. Each
// trigger ALTERNATES the sound between a bat screech and a ghostly "wooo". Fails
// silently and skips the animation when the user prefers reduced motion.

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

// A big, layered bat SCREECH — detuned sawtooths sweeping down with a fast
// screech vibrato, plus a cloud of chittering squeaks on top. Dramatic, ~0.9s.
function playBatScreech() {
  const ac = getCtx();
  if (!ac) return;
  try {
    const now = ac.currentTime;
    const master = ac.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.11, now + 0.05);
    master.gain.setValueAtTime(0.11, now + 0.55);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
    // keep it thin & screechy
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 550;
    hp.connect(ac.destination);
    master.connect(hp);

    // Layered screech — three detuned saws descending from a shriek.
    for (const detune of [-28, 4, 33]) {
      const osc = ac.createOscillator();
      osc.type = "sawtooth";
      osc.detune.value = detune;
      const top = 2800 + Math.random() * 500;
      osc.frequency.setValueAtTime(top, now);
      osc.frequency.exponentialRampToValueAtTime(650, now + 0.85);
      // fast, harsh screech wobble
      const lfo = ac.createOscillator();
      const lfoGain = ac.createGain();
      lfo.type = "sine";
      lfo.frequency.value = 42 + Math.random() * 12;
      lfoGain.gain.value = 130;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(master);
      osc.start(now);
      lfo.start(now);
      osc.stop(now + 0.9);
      lfo.stop(now + 0.9);
    }

    // A cloud of chittering squeaks = the swarm.
    for (let i = 0; i < 16; i++) {
      const t = now + Math.random() * 0.8;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "square";
      const f = 2400 + Math.random() * 2600;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.03);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.03, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      o.connect(g);
      g.connect(ac.destination);
      o.start(t);
      o.stop(t + 0.06);
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

// A giant WAVE of bats surging across the screen — released in a tight stagger
// so they read as one swarm, spread over the full height, flapping as they go.
function flyBatSwarm(n = 32) {
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

// Alternate the SOUND (bat screech / ghost wooo) on each trigger — but every
// trigger unleashes the bat swarm.
let fxCount = 0;

export function spookyFx() {
  const ghostTurn = fxCount % 2 === 1;
  fxCount++;
  if (ghostTurn) {
    playGhostSound();
    flyBatSwarm(24); // still a wave…
    floatGhost(); // …plus a drifting ghost to match the sound
  } else {
    playBatScreech();
    flyBatSwarm(34); // the full screeching wave
  }
}
