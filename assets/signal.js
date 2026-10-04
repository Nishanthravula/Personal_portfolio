// Figure 1: a live anomaly detector running on a synthetic store-demand signal.
//
// Detector (the classical baseline): learn a seasonal profile online, take the residual
// from it, and score each residual with a robust z-score (median / MAD over a trailing
// window). Points with |z| above the threshold are flagged and kept out of the profile
// and the residual window, so one anomaly does not mask the next.

(() => {
  "use strict";

  const canvas = document.getElementById("signal");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const injectBtn = document.getElementById("inject");
  const pauseBtn = document.getElementById("pause");
  const readout = document.getElementById("readout");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const PERIOD = 48; // points per seasonal cycle
  const WINDOW = 200; // points visible
  const RESID_WINDOW = 144;
  const THRESHOLD = 3.5;
  const STEP_MS = 110;

  // Deterministic PRNG so the first frame always looks the same.
  let seed = 7;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const gauss = () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  let t = 0;
  const pending = []; // queued anomaly offsets to add to upcoming points
  const profile = new Float64Array(PERIOD);
  let profileReady = 0;
  const resid = [];
  const points = []; // { v, z, hit }
  let seen = 0;
  let flagged = 0;

  function truth(i) {
    const s = (2 * Math.PI * i) / PERIOD;
    return 100 + 16 * Math.sin(s) + 6 * Math.sin(2 * s + 1.1) + 4 * Math.sin(i / 260);
  }

  function median(a) {
    const s = [...a].sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function queueAnomaly(kind) {
    const k = kind || ["spike", "dip", "shift"][Math.floor(rand() * 3)];
    if (k === "spike") pending.push(26 + rand() * 14);
    else if (k === "dip") pending.push(-(28 + rand() * 14));
    else {
      const size = (rand() < 0.5 ? -1 : 1) * (16 + rand() * 6);
      for (let j = 0; j < 6; j++) pending.push(size);
    }
  }

  function step() {
    let v = truth(t) + gauss() * 2.4;
    if (pending.length) v += pending.shift();
    else if (t > PERIOD * 3 && rand() < 1 / 300) queueAnomaly();

    const phase = t % PERIOD;
    let z = 0;
    let hit = false;

    if (profileReady < PERIOD) {
      profile[phase] = v;
      profileReady++;
    } else {
      const r = v - profile[phase];
      if (resid.length >= 24) {
        const med = median(resid);
        const mad = median(resid.map((x) => Math.abs(x - med))) || 1e-6;
        z = (0.6745 * (r - med)) / mad;
        hit = Math.abs(z) > THRESHOLD;
      }
      if (!hit) {
        profile[phase] = 0.75 * profile[phase] + 0.25 * v;
        resid.push(r);
        if (resid.length > RESID_WINDOW) resid.shift();
      }
    }

    points.push({ v, z, hit });
    if (points.length > WINDOW + 1) points.shift();
    t++;
    if (t > PERIOD * 2) {
      seen++;
      if (hit) flagged++;
    }
  }

  // Warm up: two seasons of history so the detector is calibrated on first paint.
  // One seeded spike lands inside the first visible window so the figure is never blank.
  const WARM = PERIOD * 2 + WINDOW;
  for (let i = 0; i < WARM; i++) {
    if (i === WARM - 46) queueAnomaly("spike");
    step();
  }

  function tokens() {
    const cs = getComputedStyle(document.documentElement);
    return {
      trace: cs.getPropertyValue("--trace").trim(),
      anomaly: cs.getPropertyValue("--anomaly").trim(),
      grid: cs.getPropertyValue("--grid").trim(),
      muted: cs.getPropertyValue("--muted").trim(),
      ink: cs.getPropertyValue("--ink").trim(),
      ui: cs.getPropertyValue("--ui").trim(),
    };
  }

  let W = 0;
  let H = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(0);
  }

  function draw(frac) {
    if (!W) return;
    const c = tokens();
    ctx.clearRect(0, 0, W, H);

    const labelW = 0;
    const gap = 18;
    const topH = Math.round((H - gap) * 0.68);
    const botY = topH + gap;
    const botH = H - botY;
    const dx = (W - labelW) / (WINDOW - 1);
    const x = (i) => labelW + (i - frac) * dx;

    // value range for the top track
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of points) {
      lo = Math.min(lo, p.v);
      hi = Math.max(hi, p.v);
    }
    lo = Math.min(lo, 60);
    hi = Math.max(hi, 140);
    const pad = 8;
    const y = (v) => pad + (1 - (v - lo) / (hi - lo)) * (topH - pad * 2);

    // grid
    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let g = 0; g <= 3; g++) {
      const gy = Math.round(pad + (g / 3) * (topH - pad * 2)) + 0.5;
      ctx.moveTo(0, gy);
      ctx.lineTo(W, gy);
    }
    ctx.stroke();

    // season boundaries as faint verticals
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const absolute = t - points.length + i;
      if (absolute % PERIOD === 0) {
        const gx = Math.round(x(i)) + 0.5;
        ctx.moveTo(gx, pad);
        ctx.lineTo(gx, topH - pad);
      }
    }
    ctx.globalAlpha = 0.6;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // trace
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    ctx.strokeStyle = c.trace;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = "round";
    ctx.beginPath();
    points.forEach((p, i) => {
      const px = x(i);
      const py = y(p.v);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // flagged points
    ctx.strokeStyle = c.anomaly;
    ctx.fillStyle = c.anomaly;
    ctx.lineWidth = 1.5;
    points.forEach((p, i) => {
      if (!p.hit) return;
      const px = x(i);
      const py = y(p.v);
      ctx.beginPath();
      ctx.arc(px, py, 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px, py + (p.z > 0 ? 7 : -7));
      ctx.lineTo(px, topH + gap / 2);
      ctx.globalAlpha = 0.35;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    // score track
    const zMax = 8;
    const by = (z) => botY + botH - Math.min(Math.abs(z), zMax) / zMax * botH;
    const barW = Math.max(1, dx * 0.55);
    points.forEach((p, i) => {
      ctx.fillStyle = p.hit ? c.anomaly : c.muted;
      ctx.globalAlpha = p.hit ? 1 : 0.45;
      const top = by(p.z);
      ctx.fillRect(x(i) - barW / 2, top, barW, botY + botH - top);
    });
    ctx.globalAlpha = 1;
    ctx.restore();

    // baseline and threshold
    ctx.strokeStyle = c.grid;
    ctx.beginPath();
    ctx.moveTo(0, botY + botH - 0.5);
    ctx.lineTo(W, botY + botH - 0.5);
    ctx.stroke();

    const ty = Math.round(by(THRESHOLD)) + 0.5;
    ctx.strokeStyle = c.ink;
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, ty);
    ctx.lineTo(W, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // track labels
    ctx.font = `500 12px ${c.ui}`;
    ctx.textBaseline = "top";
    const label = (text, lx, ly) => {
      const w = ctx.measureText(text).width;
      ctx.fillStyle = getComputedStyle(canvas.parentElement).backgroundColor;
      ctx.fillRect(lx - 4, ly - 2, w + 8, 17);
      ctx.fillStyle = c.muted;
      ctx.fillText(text, lx, ly);
    };
    label("Units sold per hour", 0, 0);
    label("Anomaly score |z|", 0, botY);
    const thr = `threshold ${THRESHOLD}`;
    label(thr, W - ctx.measureText(thr).width - 4, ty - 17);
  }

  function updateReadout() {
    if (!readout) return;
    readout.innerHTML = `Flagged <span class="hit">${flagged}</span> of ${seen.toLocaleString()} points`;
  }

  // ---------- animation loop ----------
  let running = !reduceMotion;
  let visible = true;
  let last = 0;
  let acc = 0;
  let raf = 0;

  function frame(now) {
    raf = 0;
    if (!running || !visible || document.hidden) {
      last = 0;
      return;
    }
    if (last) acc += now - last;
    last = now;
    let advanced = false;
    while (acc >= STEP_MS) {
      step();
      acc -= STEP_MS;
      advanced = true;
    }
    draw(acc / STEP_MS);
    if (advanced) updateReadout();
    raf = requestAnimationFrame(frame);
  }
  const start = () => {
    if (!raf && running) raf = requestAnimationFrame(frame);
  };

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      start();
    }).observe(canvas);
  }
  document.addEventListener("visibilitychange", start);

  injectBtn?.addEventListener("click", () => {
    queueAnomaly();
    if (!running) {
      // Static mode: advance enough to show the injected anomaly and its effect.
      for (let i = 0; i < 24; i++) step();
      draw(0);
      updateReadout();
    }
  });

  if (pauseBtn) {
    if (reduceMotion) {
      pauseBtn.hidden = true;
    }
    pauseBtn.addEventListener("click", () => {
      running = !running;
      pauseBtn.textContent = running ? "Pause" : "Resume";
      pauseBtn.setAttribute("aria-pressed", String(!running));
      start();
    });
  }

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener?.("change", () => draw(0));

  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener("resize", resize);

  // Fonts change the label metrics; redraw once they are in.
  document.fonts?.ready.then(() => draw(0));

  resize();
  updateReadout();
  start();
})();
