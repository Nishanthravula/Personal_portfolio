// Game: "Spot the anomaly" — the visitor versus the Figure 1 detector on the same live stream.
//
// A 30-second round. Anomalies of five kinds are injected and get subtler as the round goes on.
// The visitor taps (or presses Space) when they see one; the robust z-score detector scores the
// same points in parallel. At the end both are scored on catches, false alarms and F1, and the
// round is replayed as a strip so you can see what each of you caught.

(() => {
  "use strict";

  const stage = document.getElementById("game-stage");
  const canvas = document.getElementById("game-canvas");
  if (!stage || !canvas) return;
  const ctx = canvas.getContext("2d");

  const el = (id) => document.getElementById(id);
  const startPanel = el("game-start");
  const playBtn = el("game-play");
  const results = el("game-results");
  const againBtn = el("game-again");
  const shareBtn = el("game-share");
  const feed = el("game-feed");
  const hud = { time: el("hud-time"), caught: el("hud-caught"), false: el("hud-false"), best: el("hud-best") };

  const ROUND_S = 30;
  const PERIOD = 48;
  const WINDOW = 150;
  const RESID_WINDOW = 144;
  const THRESHOLD = 3.5;
  const BEST_KEY = "spot-the-anomaly-best";

  const KINDS = {
    spike: "spike",
    dip: "drop",
    shift: "level shift",
    stuck: "stuck sensor",
    peak: "missing peak",
  };

  // ---------- random numbers ----------
  let seed = (Date.now() % 100000) >>> 0;
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

  const level = (i) => 100 + 4 * Math.sin(i / 260);
  const truth = (i) => {
    const s = (2 * Math.PI * i) / PERIOD;
    return level(i) + 16 * Math.sin(s) + 6 * Math.sin(2 * s + 1.1);
  };

  const median = (a) => {
    const s = [...a].sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  // ---------- best score ----------
  const readBest = () => {
    try {
      const v = Number(localStorage.getItem(BEST_KEY));
      return Number.isFinite(v) && v > 0 ? v : null;
    } catch (e) {
      return null;
    }
  };
  const writeBest = (v) => {
    try {
      localStorage.setItem(BEST_KEY, String(v));
    } catch (e) {
      /* not saved; fine */
    }
  };

  // ---------- game state ----------
  let S = null;

  function newState() {
    const st = {
      phase: "ready", // ready | running | done
      t: 0, // index of the next point
      roundStart: 0, // index of the first scored point
      pts: [], // { v, z, flag }
      anomalies: [], // { kind, start, end, startMs, user: ms|null, model: bool }
      taps: [], // { i, hit, ms }
      floats: [], // feedback labels { i, text, born, good }
      profile: new Float64Array(PERIOD),
      profileReady: 0,
      resid: [],
      active: null, // anomaly currently being written into the stream
      nextAnomalyS: 2.2,
      elapsed: 0,
      lastFrame: 0,
      acc: 0,
      lastCatchAt: -1e9,
    };
    return st;
  }

  function detector(st, v) {
    const phase = st.t % PERIOD;
    let z = 0;
    let flag = false;
    if (st.profileReady < PERIOD) {
      st.profile[phase] = v;
      st.profileReady++;
    } else {
      const r = v - st.profile[phase];
      if (st.resid.length >= 24) {
        const med = median(st.resid);
        const mad = median(st.resid.map((x) => Math.abs(x - med))) || 1e-6;
        z = (0.6745 * (r - med)) / mad;
        flag = Math.abs(z) > THRESHOLD;
      }
      if (!flag) {
        st.profile[phase] = 0.75 * st.profile[phase] + 0.25 * v;
        st.resid.push(r);
        if (st.resid.length > RESID_WINDOW) st.resid.shift();
      }
    }
    return { z, flag };
  }

  function pushPoint(st, nowMs) {
    const i = st.t;
    let v = truth(i) + gauss() * 2.2;
    const a = st.active;
    if (a && i >= a.start && i <= a.end) {
      if (a.start === i) {
        a.startMs = nowMs;
        a.base = v;
      }
      if (a.kind === "spike") v += a.amp;
      else if (a.kind === "dip") v -= a.amp;
      else if (a.kind === "shift") v += a.amp;
      else if (a.kind === "stuck") v = a.base;
      else if (a.kind === "peak") v = level(i) + (v - level(i)) * 0.4;
    }
    if (a && i === a.end) a.endMs = nowMs;
    if (a && i >= a.end) st.active = null;
    const d = detector(st, v);
    st.pts.push({ v, z: d.z, flag: d.flag && i >= st.roundStart });
    st.t++;
  }

  function scheduleAnomaly(st) {
    // Later in the round anomalies are smaller and the subtle kinds are more common.
    const k = Math.min(1, st.elapsed / ROUND_S);
    const pool = k < 0.3 ? ["spike", "dip", "shift", "stuck"] : ["spike", "dip", "shift", "stuck", "peak", "peak", "stuck"];
    const kind = pool[Math.floor(rand() * pool.length)];
    // Sizes tuned by simulation: early anomalies are obvious to both players; by the end the
    // detector catches roughly 60% of spikes and shifts, 70% of stuck sensors and a third of
    // missing peaks, all of which stay visible to a careful human.
    let start = st.t + 2;
    let len = 1;
    let amp = 0;
    if (kind === "spike" || kind === "dip") amp = 24 - 12 * k + rand() * 2;
    if (kind === "shift") {
      len = 9;
      amp = (rand() < 0.5 ? -1 : 1) * (14 - 7 * k + rand());
    }
    if (kind === "stuck") len = 14;
    if (kind === "peak") {
      // Start just before the next daily peak so the missing peak is what you notice.
      len = 18;
      const target = Math.round(PERIOD / 4) - 9;
      while ((start % PERIOD + PERIOD) % PERIOD !== (target + PERIOD) % PERIOD) start++;
    }
    const a = { kind, start, end: start + len - 1, amp, startMs: null, endMs: null, user: null, model: false };
    st.active = a;
    st.anomalies.push(a);
    st.nextAnomalyS = st.elapsed + 2.6 + rand() * 2.4 + (start - st.t) / rate(st);
  }

  const rate = (st) => 11 + 6 * Math.min(1, st.elapsed / ROUND_S); // points per second

  // ---------- sizing and colors ----------
  let W = 0;
  let H = 0;
  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width;
    H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  const tok = () => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    return { trace: v("--trace"), anomaly: v("--anomaly"), grid: v("--grid"), muted: v("--muted"), ink: v("--ink"), ui: v("--ui"), sheet: v("--sheet") };
  };

  // ---------- drawing ----------
  function draw() {
    if (!W || !S) return;
    ctx.clearRect(0, 0, W, H);
    if (S.phase === "done") drawReplay();
    else drawLive();
  }

  function yScale(top, bottom, pts) {
    let lo = 60;
    let hi = 140;
    for (const p of pts) {
      lo = Math.min(lo, p.v);
      hi = Math.max(hi, p.v);
    }
    return (v) => top + (1 - (v - lo) / (hi - lo)) * (bottom - top);
  }

  function drawLive() {
    const c = tok();
    const n = S.pts.length;
    const first = Math.max(0, n - WINDOW);
    const view = S.pts.slice(first);
    const frac = S.phase === "running" ? S.acc * rate(S) / 1000 : 0;
    const dx = W / (WINDOW - 1);
    const x = (i) => (i - first - frac) * dx;
    const top = 26;
    const bottom = H - 34;
    const y = yScale(top, bottom, view);

    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let g = 0; g <= 3; g++) {
      const gy = Math.round(top + (g / 3) * (bottom - top)) + 0.5;
      ctx.moveTo(0, gy);
      ctx.lineTo(W, gy);
    }
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    ctx.strokeStyle = c.trace;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    view.forEach((p, k) => {
      const px = x(first + k);
      const py = y(p.v);
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // the visitor's taps, on a strip along the bottom
    ctx.font = `500 12px ${c.ui}`;
    ctx.textBaseline = "alphabetic";
    for (const tap of S.taps) {
      if (tap.i < first) continue;
      const px = x(tap.i);
      ctx.fillStyle = tap.hit >= 0 ? c.ink : c.muted;
      ctx.globalAlpha = tap.hit >= 0 ? 1 : 0.7;
      ctx.beginPath();
      ctx.moveTo(px, H - 8);
      ctx.lineTo(px - 6, H - 20);
      ctx.lineTo(px + 6, H - 20);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // short-lived feedback near the tap
    const now = performance.now();
    S.floats = S.floats.filter((f) => now - f.born < 1100);
    for (const f of S.floats) {
      const age = (now - f.born) / 1100;
      const px = Math.min(Math.max(x(f.i), 40), W - 70);
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = f.good ? c.ink : c.anomaly;
      ctx.font = `600 14px ${c.ui}`;
      ctx.fillText(f.text, px - 30, H - 26 - age * 18);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.font = `500 12px ${c.ui}`;
    ctx.textBaseline = "top";
    ctx.fillStyle = c.muted;
    ctx.fillText("Live demand signal", 0, 4);
    const tapLabel = "your taps";
    ctx.fillText(tapLabel, W - ctx.measureText(tapLabel).width, H - 16);
  }

  function drawReplay() {
    const c = tok();
    const pts = S.pts.slice(S.roundStart);
    const n = pts.length;
    if (n < 2) return;
    const left = 0;
    const rowH = 18;
    const top = 26;
    const bottom = H - rowH * 2 - 18;
    const dx = (W - left) / (n - 1);
    const x = (i) => left + (i - S.roundStart) * dx;
    const y = yScale(top, bottom, pts);

    // anomaly spans
    ctx.font = `500 11px ${c.ui}`;
    ctx.textBaseline = "top";
    for (const a of S.anomalies) {
      if (a.start < S.roundStart || a.start >= S.roundStart + n) continue;
      const x0 = x(a.start) - dx * 1.5;
      const x1 = x(Math.min(a.end, S.roundStart + n - 1)) + dx * 1.5;
      ctx.fillStyle = c.grid;
      ctx.globalAlpha = 0.65;
      ctx.fillRect(x0, top - 4, Math.max(4, x1 - x0), bottom - top + 8);
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = c.trace;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    pts.forEach((p, k) => {
      const px = x(S.roundStart + k);
      const py = y(p.v);
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // rows: you, detector
    const youY = bottom + 14;
    const detY = youY + rowH;
    ctx.fillStyle = c.muted;
    ctx.font = `500 12px ${c.ui}`;
    ctx.textBaseline = "middle";
    const lblW = Math.max(ctx.measureText("You").width, ctx.measureText("Detector").width) + 10;
    ctx.fillStyle = c.sheet;
    ctx.fillRect(0, youY - 8, lblW, rowH * 2);
    ctx.fillStyle = c.ink;
    ctx.fillText("You", 0, youY);
    ctx.fillStyle = c.anomaly;
    ctx.fillText("Detector", 0, detY);

    for (const tap of S.taps) {
      const px = x(tap.i);
      if (px < lblW) continue;
      ctx.fillStyle = tap.hit >= 0 ? c.ink : c.muted;
      ctx.globalAlpha = tap.hit >= 0 ? 1 : 0.6;
      ctx.fillRect(px - 1.5, youY - 6, 3, 12);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = c.anomaly;
    pts.forEach((p, k) => {
      if (!p.flag) return;
      const px = x(S.roundStart + k);
      if (px < lblW) return;
      ctx.beginPath();
      ctx.arc(px, detY, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.textBaseline = "top";
    ctx.fillStyle = c.muted;
    ctx.fillText("Replay: shaded bands are the anomalies", 0, 4);
  }

  // ---------- loop ----------
  let raf = 0;
  function frame(now) {
    raf = 0;
    if (!S || S.phase !== "running") return;
    if (document.hidden) {
      S.lastFrame = 0;
      return;
    }
    if (S.lastFrame) {
      const dt = Math.min(100, now - S.lastFrame);
      S.elapsed += dt / 1000;
      S.acc += dt;
      const stepMs = 1000 / rate(S);
      while (S.acc >= stepMs) {
        S.acc -= stepMs;
        if (!S.active && S.elapsed >= S.nextAnomalyS && S.elapsed < ROUND_S - 1.5) scheduleAnomaly(S);
        pushPoint(S, now);
      }
    }
    S.lastFrame = now;
    hud.time.textContent = Math.max(0, ROUND_S - S.elapsed).toFixed(1);
    draw();
    if (S.elapsed >= ROUND_S) finish();
    else raf = requestAnimationFrame(frame);
  }

  function start() {
    S = newState();
    // Two seasons of clean history fill the screen and calibrate the detector.
    for (let i = 0; i < PERIOD * 2 + WINDOW; i++) pushPoint(S, 0);
    S.roundStart = S.t;
    S.phase = "running";
    startPanel.hidden = true;
    results.hidden = true;
    stage.classList.add("running");
    hud.caught.textContent = "0";
    hud.false.textContent = "0";
    feed.textContent = "Round started. Tap the chart or press Space when you see an anomaly.";
    canvas.focus({ preventScroll: true });
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function tap() {
    if (!S || S.phase !== "running") return;
    const now = performance.now();
    const T = S.t - 1;
    // Catchable from the moment it starts until 1.2 s after it ends, so speed matters
    // and tapping at random mostly produces false alarms.
    const CATCH_AFTER_END_MS = 1200;
    const candidates = S.anomalies.filter(
      (a) => a.user === null && a.startMs !== null && (a.endMs === null || now - a.endMs <= CATCH_AFTER_END_MS)
    );
    if (candidates.length) {
      const a = candidates[0];
      a.user = Math.max(0, Math.round(now - a.startMs));
      S.taps.push({ i: T, hit: S.anomalies.indexOf(a), ms: a.user });
      S.floats.push({ i: T, text: `Caught, ${a.user} ms`, born: now, good: true });
      S.lastCatchAt = now;
      hud.caught.textContent = String(S.anomalies.filter((x) => x.user !== null).length);
    } else if (now - S.lastCatchAt < 450) {
      // A quick double tap on the same anomaly is forgiven.
    } else {
      S.taps.push({ i: T, hit: -1, ms: null });
      S.floats.push({ i: T, text: "False alarm", born: now, good: false });
      hud.false.textContent = String(S.taps.filter((x) => x.hit < 0).length);
    }
  }

  function f1(caught, falseAlarms, total) {
    if (!total) return 0;
    const p = caught + falseAlarms ? caught / (caught + falseAlarms) : 0;
    const r = caught / total;
    return p + r ? (2 * p * r) / (p + r) : 0;
  }

  function finish() {
    S.phase = "done";
    stage.classList.remove("running");
    const end = S.t - 1;
    const scored = S.anomalies.filter((a) => a.startMs !== null && a.start <= end - 2);
    const total = scored.length;

    // Detector: an anomaly is caught if any of its points (or the two after) were flagged.
    const near = (i) => S.anomalies.some((a) => i >= a.start - 1 && i <= a.end + 2);
    let modelFalse = 0;
    let inRun = false;
    for (let i = S.roundStart; i <= end; i++) {
      const p = S.pts[i];
      if (p.flag && !near(i)) {
        if (!inRun) modelFalse++;
        inRun = true;
      } else inRun = false;
    }
    for (const a of scored) {
      for (let i = a.start; i <= Math.min(a.end + 2, end); i++) if (S.pts[i].flag) a.model = true;
    }
    const youCaught = scored.filter((a) => a.user !== null).length;
    const youFalse = S.taps.filter((x) => x.hit < 0).length;
    const modelCaught = scored.filter((a) => a.model).length;
    const times = scored.filter((a) => a.user !== null).map((a) => a.user);
    const avgMs = times.length ? Math.round(times.reduce((s, v) => s + v, 0) / times.length) : null;
    const you = f1(youCaught, youFalse, total);
    const model = f1(modelCaught, modelFalse, total);

    const best = readBest();
    const newBest = best === null || you > best;
    if (newBest && you > 0) writeBest(you);
    hud.best.textContent = (newBest && you > 0 ? you : best ?? 0).toFixed(2);

    // Which kinds did each side miss?
    const onlyYou = scored.filter((a) => a.user !== null && !a.model).map((a) => KINDS[a.kind]);
    const onlyModel = scored.filter((a) => a.user === null && a.model).map((a) => KINDS[a.kind]);
    const list = (arr) => {
      const uniq = [...new Set(arr)];
      return uniq.length > 1 ? `${uniq.slice(0, -1).join(", ")} and ${uniq.at(-1)}` : uniq[0];
    };

    const title =
      Math.abs(you - model) < 0.005
        ? "A tie."
        : you > model
          ? "You beat the detector."
          : "The detector wins this round.";
    let note = "";
    if (onlyYou.length)
      note += `You caught a ${list(onlyYou)} the z-score missed. Single-point scores can't see shape, which is why RSTAD learns what normal windows look like. `;
    if (onlyModel.length) note += `The detector caught a ${list(onlyModel)} you missed. `;
    if (!note) note = youCaught === total ? "Both of you caught everything. Try again: the stream changes every round." : "Neither of you caught everything. The subtle kinds near the end are hard.";

    el("result-title").textContent = title;
    el("result-table").innerHTML = `
      <tr><th scope="col"></th><th scope="col">You</th><th scope="col">Detector</th></tr>
      <tr><th scope="row">Anomalies caught</th><td>${youCaught} of ${total}</td><td>${modelCaught} of ${total}</td></tr>
      <tr><th scope="row">False alarms</th><td>${youFalse}</td><td>${modelFalse}</td></tr>
      <tr><th scope="row">Average reaction</th><td>${avgMs === null ? "–" : `${avgMs} ms`}</td><td>on arrival</td></tr>
      <tr><th scope="row">F1 score</th><td><b>${you.toFixed(2)}</b></td><td><b>${model.toFixed(2)}</b></td></tr>`;
    el("result-note").textContent = note + (newBest && you > 0 && best !== null ? " New personal best." : "");
    results.hidden = false;
    results.dataset.share = `I scored F1 ${you.toFixed(2)} against an anomaly detector's ${model.toFixed(2)} in Spot the Anomaly. Can you beat it?`;
    feed.textContent = `${title} Your F1 ${you.toFixed(2)}, detector ${model.toFixed(2)}.`;
    draw();
    againBtn.focus({ preventScroll: true });
  }

  // ---------- input ----------
  stage.addEventListener("pointerdown", (e) => {
    if (S?.phase !== "running") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    tap();
  });
  document.addEventListener("keydown", (e) => {
    if (S?.phase !== "running") return;
    if (e.key === " " || e.key === "Enter") {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
      if (typing) return;
      e.preventDefault();
      if (!e.repeat) tap();
    }
  });
  playBtn?.addEventListener("click", start);
  againBtn?.addEventListener("click", start);
  shareBtn?.addEventListener("click", async () => {
    const text = results.dataset.share || "";
    const url = "https://nishanthravula.netlify.app/#play";
    try {
      if (navigator.share) await navigator.share({ title: "Spot the anomaly", text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        shareBtn.textContent = "Copied";
        setTimeout(() => (shareBtn.textContent = "Share score"), 1600);
      }
    } catch (e) {
      /* share sheet dismissed */
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && S?.phase === "running" && !raf) raf = requestAnimationFrame(frame);
  });
  document.addEventListener("themechange", draw);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", draw);
  document.addEventListener("start-game", () => {
    stage.scrollIntoView({ behavior: "smooth", block: "center" });
    if (S?.phase !== "running") start();
  });

  // ---------- idle screen ----------
  S = newState();
  for (let i = 0; i < PERIOD * 2 + WINDOW; i++) pushPoint(S, 0);
  const best = readBest();
  hud.best.textContent = best === null ? "–" : best.toFixed(2);
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener("resize", resize);
  document.fonts?.ready.then(draw);
  resize();
})();
