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
    master.gain.value = 0.3;
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
  coin: () => {
    tone({ type: "square", from: 988, dur: 0.06, gain: 0.08 });
    tone({ type: "square", from: 1319, dur: 0.12, gain: 0.08, delay: 0.06 });
  },
  stop: () => [660, 880].forEach((f, i) => tone({ type: "sine", from: f, dur: 0.12, gain: 0.18, delay: i * 0.07 })),
  bump: () => noise({ dur: 0.1, gain: 0.35, freq: 400 }),
  lap: () => [523, 659, 784, 1047].forEach((f, i) => tone({ type: "triangle", from: f, dur: 0.14, gain: 0.22, delay: i * 0.08 })),
  open: () => tone({ type: "triangle", from: 520, to: 780, dur: 0.12, gain: 0.15 }),
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
