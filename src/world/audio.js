// Tiny synthesized sound effects (no audio files). Off until the visitor interacts.

const KEY = "world-sound";
let ctx = null;
let master = null;
let enabled = (() => {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch (e) {
    return true;
  }
})();

function ensure() {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone({ type = "sine", from = 440, to = from, dur = 0.15, gain = 0.4, delay = 0 }) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.2, gain = 0.3, freq = 1200, delay = 0 }) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  pulse: () => tone({ type: "sine", from: 880, to: 140, dur: 0.22, gain: 0.35 }),
  hit: () => {
    noise({ dur: 0.12, gain: 0.5, freq: 1800 });
    tone({ type: "square", from: 660, to: 990, dur: 0.07, gain: 0.08 });
  },
  boss: () => tone({ type: "sawtooth", from: 120, to: 60, dur: 0.5, gain: 0.25 }),
  core: () => {
    tone({ type: "sine", from: 120, to: 40, dur: 0.35, gain: 0.6 });
    noise({ dur: 0.25, gain: 0.3, freq: 300 });
  },
  falsePositive: () => tone({ type: "square", from: 220, to: 160, dur: 0.25, gain: 0.15 }),
  wave: () => [523, 659, 784, 1047].forEach((f, i) => tone({ type: "triangle", from: f, dur: 0.14, gain: 0.25, delay: i * 0.08 })),
  over: () => [392, 330, 262, 196].forEach((f, i) => tone({ type: "triangle", from: f, dur: 0.22, gain: 0.25, delay: i * 0.14 })),
  open: () => tone({ type: "triangle", from: 520, to: 780, dur: 0.12, gain: 0.15 }),
  milestone: () => [660, 880].forEach((f, i) => tone({ type: "sine", from: f, dur: 0.12, gain: 0.18, delay: i * 0.07 })),
  quack: () => {
    tone({ type: "sawtooth", from: 620, to: 380, dur: 0.16, gain: 0.25 });
    tone({ type: "square", from: 900, to: 500, dur: 0.12, gain: 0.08 });
  },
  bump: () => noise({ dur: 0.08, gain: 0.25, freq: 500 }),
};

export const sound = {
  get enabled() {
    return enabled;
  },
  toggle() {
    enabled = !enabled;
    try {
      localStorage.setItem(KEY, enabled ? "on" : "off");
    } catch (e) {
      /* not saved */
    }
    if (enabled) ensure();
    return enabled;
  },
  unlock: ensure,
};
