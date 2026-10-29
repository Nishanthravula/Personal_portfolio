// The page background: a slow aurora with faint data signals drifting through it.
// Now and then one signal spikes and the spike lights up amber, the way a detector flags a point.
// Drawn at reduced resolution and around 30 frames a second; it stops when the tab is hidden
// and draws one still frame when the visitor prefers reduced motion.

(() => {
  "use strict";

  const canvas = document.getElementById("ambient");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d", { alpha: true });
  const root = document.documentElement;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const SCALE = 0.5; // render at half resolution; the blur hides it
  const FRAME_MS = 1000 / 30;

  let w = 0;
  let h = 0;
  let colors = null;
  let lines = [];
  let flags = []; // { line, x, age }
  let last = 0;
  let t = 0;
  let raf = 0;

  const isLight = () => root.getAttribute("data-theme") === "light";

  function readColors() {
    const light = isLight();
    colors = light
      ? {
          blobs: ["rgba(99,116,255,0.16)", "rgba(168,120,255,0.12)", "rgba(56,189,248,0.10)"],
          line: "rgba(40,48,110,",
          flag: "rgba(217,119,6,",
        }
      : {
          blobs: ["rgba(88,101,242,0.30)", "rgba(147,92,255,0.20)", "rgba(34,160,220,0.14)"],
          line: "rgba(170,182,255,",
          flag: "rgba(255,181,71,",
        };
  }

  function makeLines() {
    const n = w < 700 * SCALE ? 4 : 6;
    lines = Array.from({ length: n }, (_, i) => ({
      y: (0.18 + (0.7 * i) / (n - 1)) * h,
      amp: (8 + Math.random() * 10) * SCALE * 2,
      freq: 0.006 + Math.random() * 0.006,
      speed: 0.25 + Math.random() * 0.35,
      phase: Math.random() * 1000,
      alpha: 0.07 + Math.random() * 0.06,
    }));
    flags = [];
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.max(1, Math.round(window.innerWidth * dpr * SCALE));
    h = Math.max(1, Math.round(window.innerHeight * dpr * SCALE));
    canvas.width = w;
    canvas.height = h;
    makeLines();
  }

  // Height of a line at x, including any spike that is passing through.
  function lineY(L, x, time) {
    const u = x + time * L.speed * 60;
    let y = L.y + Math.sin((u + L.phase) * L.freq) * L.amp + Math.sin((u + L.phase) * L.freq * 2.7) * L.amp * 0.35;
    for (const f of flags) {
      if (f.line !== L) continue;
      const d = (x - f.x) / (10 * SCALE * 2);
      y -= Math.exp(-d * d) * f.size * Math.min(1, f.age / 6) * Math.max(0, 1 - f.age / 120);
    }
    return y;
  }

  function draw(time) {
    ctx.clearRect(0, 0, w, h);

    // aurora: three soft blobs on slow orbits
    const s = Math.max(w, h);
    const orbit = [
      [0.22, 0.18, 0.55, 0.11],
      [0.78, 0.28, 0.5, 0.08],
      [0.5, 0.85, 0.6, 0.06],
    ];
    orbit.forEach(([cx, cy, r, sp], i) => {
      const x = (cx + Math.sin(time * sp + i * 2) * 0.08) * w;
      const y = (cy + Math.cos(time * sp * 1.3 + i) * 0.06) * h;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * s);
      g.addColorStop(0, colors.blobs[i]);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });

    // signals
    ctx.lineWidth = Math.max(1, 1.2 * SCALE * 2);
    const step = Math.max(3, Math.round(6 * SCALE * 2));
    for (const L of lines) {
      ctx.strokeStyle = colors.line + L.alpha + ")";
      ctx.beginPath();
      for (let x = 0; x <= w + step; x += step) {
        const y = lineY(L, x, time);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // flagged points: amber dot plus an expanding ring
    for (const f of flags) {
      const life = Math.max(0, 1 - f.age / 120);
      if (life <= 0) continue;
      const y = lineY(f.line, f.x, time);
      ctx.fillStyle = colors.flag + 0.85 * life + ")";
      ctx.beginPath();
      ctx.arc(f.x, y, 2.6 * SCALE * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colors.flag + 0.5 * life + ")";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(f.x, y, (4 + (f.age % 60) * 0.35) * SCALE * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (now - last < FRAME_MS) return;
    last = now;
    t += 1 / 30;
    flags.forEach((f) => {
      f.age += 1;
      f.x -= f.line.speed * 2 * SCALE; // drift with the signal
    });
    flags = flags.filter((f) => f.age < 120);
    if (flags.length < 2 && Math.random() < 1 / 110) {
      flags.push({
        line: lines[Math.floor(Math.random() * lines.length)],
        x: w * (0.35 + Math.random() * 0.55),
        size: (22 + Math.random() * 18) * SCALE * 2,
        age: 0,
      });
    }
    draw(t);
  }

  function start() {
    cancelAnimationFrame(raf);
    if (reduce.matches || document.hidden) {
      draw(t);
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  readColors();
  resize();
  if (reduce.matches) {
    // one still frame, with a single flagged point so the idea still reads
    flags.push({ line: lines[1] || lines[0], x: w * 0.72, size: 30 * SCALE * 2, age: 30 });
  }
  start();

  let rt = 0;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      resize();
      if (reduce.matches) draw(t);
    }, 150);
  });
  document.addEventListener("visibilitychange", start);
  reduce.addEventListener?.("change", start);
  document.addEventListener("themechange", () => {
    readColors();
    draw(t);
  });

  // Soft spotlight that follows the pointer (mouse and pen only).
  const spot = document.querySelector(".spot");
  if (spot && window.matchMedia("(hover: hover) and (pointer: fine)").matches && !reduce.matches) {
    let px = 0;
    let py = 0;
    let pending = false;
    window.addEventListener(
      "pointermove",
      (e) => {
        px = e.clientX;
        py = e.clientY;
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
          spot.style.setProperty("--mx", `${px}px`);
          spot.style.setProperty("--my", `${py}px`);
          spot.classList.add("on");
          pending = false;
        });
      },
      { passive: true }
    );
    document.documentElement.addEventListener("pointerleave", () => spot.classList.remove("on"));
  }
})();
