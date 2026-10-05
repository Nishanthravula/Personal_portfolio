// Interactive figures 2 to 5. Every figure runs on synthetic data and is labeled that way
// on the page. Each block is independent: if its markup is missing, it does nothing.

(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const tok = () => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    return {
      trace: v("--trace"),
      anomaly: v("--anomaly"),
      grid: v("--grid"),
      muted: v("--muted"),
      ink: v("--ink"),
      sheet: v("--sheet"),
      ui: v("--ui"),
    };
  };

  // Size a canvas for the device and call draw(ctx, w, h) whenever it changes size,
  // the color theme changes, or fonts finish loading. Returns a redraw function.
  function canvasFigure(canvas, draw) {
    const ctx = canvas.getContext("2d");
    let w = 0;
    let h = 0;
    const redraw = () => {
      if (!w) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      draw(ctx, w, h, tok());
    };
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      redraw();
    };
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
    else window.addEventListener("resize", resize);
    document.addEventListener("themechange", redraw);
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", redraw);
    document.fonts?.ready.then(redraw);
    resize();
    return redraw;
  }

  function prng(seed) {
    let s = seed >>> 0;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const gauss = () => {
      let u = 0;
      let v = 0;
      while (u === 0) u = rand();
      while (v === 0) v = rand();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    return { rand, gauss };
  }

  function smallLabel(ctx, c, text, x, y, color) {
    ctx.font = `500 12px ${c.ui}`;
    ctx.textBaseline = "top";
    ctx.fillStyle = color || c.muted;
    ctx.fillText(text, x, y);
  }

  const safely = (fn) => {
    try {
      fn();
    } catch (err) {
      console.error(err);
    }
  };

  // ---------------------------------------------------------------------------
  // Figure 2. RSTAD: dual-branch scoring
  // ---------------------------------------------------------------------------
  safely(() => {
    const seriesCanvas = document.getElementById("rstad-series");
    const latentCanvas = document.getElementById("rstad-latent");
    if (!seriesCanvas || !latentCanvas) return;

    const maskInput = document.getElementById("rstad-mask");
    const maskOut = document.getElementById("rstad-mask-value");
    const anomInput = document.getElementById("rstad-anomaly");
    const overInput = document.getElementById("rstad-overgen");
    const verdict = document.getElementById("rstad-verdict");
    const bars = {
      recon: document.getElementById("rstad-recon"),
      latent: document.getElementById("rstad-latent-score"),
      combined: document.getElementById("rstad-combined"),
    };

    const L = 96;
    const PATCH = 8;
    const NP = L / PATCH;
    const ANOM_PATCH = 7;
    const THRESH = 2;
    // Fixed masking order: which patches get masked first as the ratio rises.
    const ORDER = [3, ANOM_PATCH, 10, 0, 5, 9, 1, 11, 6, 2, 8, 4];

    const { gauss } = prng(42);
    const clean = Array.from({ length: L }, (_, i) => {
      const s = (2 * Math.PI * i) / 48;
      return 0.55 * Math.sin(s) + 0.22 * Math.sin(2 * s + 0.9);
    });
    const noise = clean.map(() => gauss() * 0.06);
    const wobble = clean.map((_, i) => 0.05 * Math.sin(i * 0.9) + 0.03 * Math.sin(i * 2.3));
    const anomalyShape = (i) => {
      const j = i - ANOM_PATCH * PATCH;
      if (j < 0 || j >= PATCH) return 0;
      return [-0.15, -0.55, -0.9, -0.95, -0.92, -0.6, -0.25, -0.05][j];
    };

    // Latent space: a memory bank of embeddings of normal windows (two regimes).
    const bank = [];
    {
      const r = prng(9);
      for (let i = 0; i < 70; i++) {
        const regime = i % 3 === 0 ? [0.68, 0.36] : [0.36, 0.56];
        bank.push([regime[0] + r.gauss() * 0.055, regime[1] + r.gauss() * 0.055]);
      }
    }
    const K = 5;
    const knn = (q) =>
      bank
        .map((b, i) => ({ i, d: Math.hypot(b[0] - q[0], b[1] - q[1]) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, K);
    const NORMAL_Q = [0.39, 0.53];
    const ANOM_Q = [0.47, 0.68];
    const normalKnn = knn(NORMAL_Q).reduce((s, n) => s + n.d, 0) / K;

    let state = null;

    function compute() {
      const ratio = Number(maskInput.value);
      const nMasked = Math.max(1, Math.round(ratio * NP));
      const masked = new Set(ORDER.slice(0, nMasked));
      const anomalous = anomInput.checked;
      const over = overInput.checked;

      const x = clean.map((v, i) => v + noise[i] + (anomalous ? anomalyShape(i) : 0));
      // Less visible context means a less faithful reconstruction.
      const recon = clean.map((v, i) => v + wobble[i] * (0.4 + ratio * 1.8));
      if (anomalous && over) {
        // An over-general decoder reproduces the anomaly almost perfectly.
        for (let i = ANOM_PATCH * PATCH; i < (ANOM_PATCH + 1) * PATCH; i++) recon[i] = x[i] + noise[i] * 0.4;
      }

      // Score = worst masked patch, relative to a typical normal patch error.
      let err = 0;
      masked.forEach((p) => {
        let e = 0;
        for (let i = p * PATCH; i < (p + 1) * PATCH; i++) e += Math.abs(x[i] - recon[i]);
        err = Math.max(err, e / PATCH);
      });
      const reconScore = err / 0.09;

      const q = anomalous ? ANOM_Q : NORMAL_Q;
      const neighbors = knn(q);
      const latentScore = neighbors.reduce((s, nb) => s + nb.d, 0) / K / normalKnn;
      const combined = (reconScore + latentScore) / 2;

      state = { ratio, masked, x, recon, q, neighbors, reconScore, latentScore, combined, anomalous, over };
    }

    compute();
    const drawSeries = canvasFigure(seriesCanvas, (ctx, w, h, c) => {
      const { masked, x, recon, anomalous } = state;
      const top = 22;
      const bottom = h - 8;
      const y = (v) => top + (1 - (v + 1.3) / 2.6) * (bottom - top);
      const px = (i) => (i / (L - 1)) * w;
      const pw = w / NP;

      // patches
      for (let p = 0; p < NP; p++) {
        const isM = masked.has(p);
        ctx.fillStyle = isM ? c.grid : "transparent";
        ctx.globalAlpha = isM ? 0.55 : 1;
        ctx.fillRect(p * pw + 1, top, pw - 2, bottom - top);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = c.grid;
        ctx.strokeRect(p * pw + 1.5, top + 0.5, pw - 3, bottom - top - 1);
      }

      // input series: visible parts solid, masked parts faint
      ctx.lineWidth = 1.6;
      for (let p = 0; p < NP; p++) {
        ctx.strokeStyle = c.trace;
        ctx.globalAlpha = masked.has(p) ? 0.3 : 1;
        ctx.beginPath();
        for (let i = p * PATCH; i <= Math.min(L - 1, (p + 1) * PATCH); i++) {
          if (i === p * PATCH) ctx.moveTo(px(i), y(x[i]));
          else ctx.lineTo(px(i), y(x[i]));
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // reconstruction, only for masked patches
      ctx.strokeStyle = c.ink;
      ctx.setLineDash([5, 3]);
      ctx.lineWidth = 1.5;
      masked.forEach((p) => {
        ctx.beginPath();
        for (let i = p * PATCH; i < (p + 1) * PATCH; i++) {
          if (i === p * PATCH) ctx.moveTo(px(i), y(recon[i]));
          else ctx.lineTo(px(i), y(recon[i]));
        }
        ctx.stroke();
      });
      ctx.setLineDash([]);

      if (anomalous) {
        const ax = ANOM_PATCH * pw;
        ctx.strokeStyle = c.anomaly;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(ax + 1.5, top + 0.5, pw - 3, bottom - top - 1);
      }

      smallLabel(ctx, c, "Input window, patched", 0, 0);
      const key = "dashed: decoder output on masked patches";
      ctx.font = `500 12px ${c.ui}`;
      if (w > 420) smallLabel(ctx, c, key, w - ctx.measureText(key).width, 0);
    });

    const drawLatent = canvasFigure(latentCanvas, (ctx, w, h, c) => {
      const { q, neighbors } = state;
      const pad = 10;
      const top = 22;
      const sx = (v) => pad + v * (w - pad * 2);
      const sy = (v) => top + (1 - v) * (h - top - pad);

      ctx.strokeStyle = c.grid;
      ctx.strokeRect(0.5, top - 4.5, w - 1, h - top + 4);

      ctx.fillStyle = c.muted;
      ctx.globalAlpha = 0.6;
      bank.forEach((b) => {
        ctx.beginPath();
        ctx.arc(sx(b[0]), sy(b[1]), 2.4, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      const qc = state.anomalous ? c.anomaly : c.trace;
      ctx.strokeStyle = qc;
      ctx.lineWidth = 1;
      neighbors.forEach((nb) => {
        const b = bank[nb.i];
        ctx.beginPath();
        ctx.moveTo(sx(q[0]), sy(q[1]));
        ctx.lineTo(sx(b[0]), sy(b[1]));
        ctx.stroke();
      });
      ctx.fillStyle = qc;
      ctx.beginPath();
      ctx.arc(sx(q[0]), sy(q[1]), 5, 0, Math.PI * 2);
      ctx.fill();

      smallLabel(ctx, c, `Latent space, ${K} nearest in memory bank`, 0, 0);
    });

    function setBar(el, value) {
      if (!el) return;
      const max = 6;
      const fill = el.querySelector(".bar-fill");
      const num = el.querySelector(".bar-value");
      fill.style.width = `${(Math.min(value, max) / max) * 100}%`;
      el.classList.toggle("over", value > THRESH);
      num.textContent = value.toFixed(2);
    }

    function render() {
      compute();
      maskOut.textContent = `${Math.round(state.ratio * 100)}%`;
      setBar(bars.recon, state.reconScore);
      setBar(bars.latent, state.latentScore);
      setBar(bars.combined, state.combined);
      const reconFlags = state.reconScore > THRESH;
      const dualFlags = state.combined > THRESH;
      let text;
      if (!state.anomalous) text = dualFlags ? "Normal window flagged: too much masking adds noise." : "Normal window: neither branch fires.";
      else if (!state.masked.has(ANOM_PATCH))
        text = "The anomalous patch is not masked, so the reconstruction branch never sees it. The latent branch still flags the window.";
      else if (!reconFlags && dualFlags)
        text = "Reconstruction alone misses it. The latent branch still sees a window unlike anything in memory, so RSTAD flags it.";
      else if (reconFlags && dualFlags) text = "Anomaly flagged by both branches.";
      else text = "Anomaly missed.";
      verdict.textContent = text;
      verdict.classList.toggle("hit", state.anomalous && dualFlags);
      drawSeries();
      drawLatent();
    }

    [maskInput, anomInput, overInput].forEach((el) => el.addEventListener("input", render));
    render();
  });

  // ---------------------------------------------------------------------------
  // Figure 3. Fairness: threshold policies and a three-level challenge
  // ---------------------------------------------------------------------------
  safely(() => {
    const canvas = document.getElementById("fair-plot");
    if (!canvas) return;
    const $ = (id) => document.getElementById(id);
    const thrA = $("fair-threshold");
    const thrAOut = $("fair-threshold-value");
    const thrALabel = $("fair-a-label");
    const thrB = $("fair-threshold-b");
    const thrBOut = $("fair-threshold-b-value");
    const bWrap = $("fair-b-wrap");
    const policyBtns = document.querySelectorAll("#fig-fair [data-policy]");
    const table = $("fair-table");
    const summary = $("fair-summary");
    const ui = {
      label: $("fair-level-label"),
      pips: [...document.querySelectorAll("#fair-pips li")],
      goal: $("fair-goal"),
      checks: $("fair-checks"),
      next: $("fair-next"),
      why: $("fair-why"),
      restart: $("fair-restart"),
      reveal: $("fair-reveal"),
    };

    // Synthetic risk scores. The model over-scores Group B, more for people who did not reoffend.
    const G = {
      A: { neg: [0.36, 0.12], pos: [0.62, 0.12], base: 0.4 },
      B: { neg: [0.5, 0.12], pos: [0.7, 0.11], base: 0.5 },
    };
    let policy = "shared";

    const erf = (x) => {
      // Abramowitz and Stegun 7.1.26
      const sg = Math.sign(x);
      x = Math.abs(x);
      const t = 1 / (1 + 0.3275911 * x);
      const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
      return sg * y;
    };
    const cdf = (x, [m, sd]) => 0.5 * (1 + erf((x - m) / (sd * Math.SQRT2)));
    const pdf = (x, [m, sd]) => Math.exp(-0.5 * ((x - m) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
    const rates = (g, t) => {
      const tpr = 1 - cdf(t, g.pos);
      const fpr = 1 - cdf(t, g.neg);
      return { tpr, fpr, acc: g.base * tpr + (1 - g.base) * (1 - fpr) };
    };

    function thresholds() {
      const tA = Number(thrA.value);
      if (policy === "shared") return { A: tA, B: tA };
      if (policy === "manual") return { A: tA, B: Number(thrB.value) };
      // Equal opportunity: B's threshold that gives the same true positive rate as A.
      const z = (tA - G.A.pos[0]) / G.A.pos[1];
      return { A: tA, B: G.B.pos[0] + z * G.B.pos[1] };
    }

    const pct = (v) => `${(v * 100).toFixed(1)}%`;
    const pts = (v) => `${(v * 100).toFixed(1)} points`;

    // ---- challenge levels ----
    const LEVELS = [
      {
        goal: "A regulator says Group B is wrongly flagged far too often. With one shared threshold, bring Group B's false positive rate under 15% while overall accuracy stays at 77% or better.",
        checks: (m) => [
          ["Using one shared threshold", m.policy === "shared"],
          [`Group B false positive rate under 15% (now ${pct(m.b.fpr)})`, m.b.fpr < 0.15],
          [`Overall accuracy 77% or better (now ${pct(m.acc)})`, m.acc >= 0.77],
        ],
      },
      {
        goal: "People who do reoffend should be caught equally often in both groups. Get the true positive rates within 1 point of each other, with each group's accuracy at least 75%.",
        checks: (m) => [
          [`True positive rates within 1 point (gap ${pts(m.tprGap)})`, m.tprGap < 0.01],
          [`Group A accuracy at least 75% (now ${pct(m.a.acc)})`, m.a.acc >= 0.75],
          [`Group B accuracy at least 75% (now ${pct(m.b.acc)})`, m.b.acc >= 0.75],
        ],
      },
      {
        goal: "Final challenge: be fair on every metric at once. True positive rates and false positive rates both within 1 point, and each group's accuracy at least 70%. Use “Set each group” to move both thresholds.",
        checks: (m) => [
          [`True positive rates within 1 point (gap ${pts(m.tprGap)})`, m.tprGap < 0.01],
          [`False positive rates within 1 point (gap ${pts(m.fprGap)})`, m.fprGap < 0.01],
          [`Each group's accuracy at least 70%`, m.a.acc >= 0.7 && m.b.acc >= 0.7],
        ],
        impossible: true,
      },
    ];
    let level = 0;
    let attempts = 0;
    let revealed = false;
    const solved = [false, false, false];

    function setPolicy(p) {
      policy = p;
      policyBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.policy === p)));
      bWrap.hidden = p !== "manual";
      thrALabel.textContent = p === "shared" ? "Decision threshold" : "Group A threshold";
      if (p === "manual") {
        thrB.value = thresholds().A.toFixed(2);
        thrB.dispatchEvent(new Event("input"));
      }
    }

    function showLevel(i) {
      level = i;
      attempts = 0;
      revealed = false;
      ui.label.textContent = `Challenge ${i + 1} of ${LEVELS.length}`;
      ui.goal.textContent = LEVELS[i].goal;
      ui.next.hidden = true;
      ui.why.hidden = true;
      ui.restart.hidden = true;
      ui.reveal.hidden = true;
      ui.pips.forEach((li, k) => {
        li.classList.toggle("done", solved[k]);
        li.classList.toggle("current", k === i);
      });
    }

    const redraw = canvasFigure(canvas, (ctx, w, h, c) => {
      const t = thresholds();
      const rowH = (h - 12) / 2;
      const sx = (v) => v * w;
      ["A", "B"].forEach((name, r) => {
        const g = G[name];
        const top = r * (rowH + 12) + 18;
        const base = top + rowH - 18;
        const peak = 3.7;
        const sy = (d) => base - (d / peak) * (rowH - 26);

        ctx.strokeStyle = c.grid;
        ctx.beginPath();
        ctx.moveTo(0, base + 0.5);
        ctx.lineTo(w, base + 0.5);
        ctx.stroke();

        const curve = (params, color, fill) => {
          ctx.beginPath();
          for (let i = 0; i <= 200; i++) {
            const v = i / 200;
            if (i === 0) ctx.moveTo(sx(v), sy(pdf(v, params)));
            else ctx.lineTo(sx(v), sy(pdf(v, params)));
          }
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.6;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(sx(t[name]), base);
          for (let i = Math.ceil(t[name] * 200); i <= 200; i++) ctx.lineTo(sx(i / 200), sy(pdf(i / 200, params)));
          ctx.lineTo(sx(1), base);
          ctx.closePath();
          ctx.fillStyle = fill;
          ctx.globalAlpha = 0.22;
          ctx.fill();
          ctx.globalAlpha = 1;
        };
        curve(g.neg, c.muted, c.anomaly);
        curve(g.pos, c.trace, c.trace);

        const tx = Math.round(sx(t[name])) + 0.5;
        ctx.strokeStyle = c.ink;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tx, top);
        ctx.lineTo(tx, base);
        ctx.stroke();

        smallLabel(ctx, c, `Group ${name}`, 0, top - 16, c.ink);
        const lab = `threshold ${t[name].toFixed(2)}`;
        ctx.font = `500 12px ${c.ui}`;
        const lw = ctx.measureText(lab).width;
        smallLabel(ctx, c, lab, Math.min(Math.max(tx + 6, 70), w - lw), top - 16);
      });
    });

    function render(fromUser) {
      const t = thresholds();
      const a = rates(G.A, t.A);
      const b = rates(G.B, t.B);
      const m = {
        policy,
        a,
        b,
        acc: (a.acc + b.acc) / 2,
        tprGap: Math.abs(a.tpr - b.tpr),
        fprGap: Math.abs(a.fpr - b.fpr),
      };
      thrAOut.textContent = t.A.toFixed(2);
      thrBOut.textContent = Number(thrB.value).toFixed(2);
      table.innerHTML = `
        <tr><th scope="col"></th><th scope="col">True positive rate</th><th scope="col">False positive rate</th><th scope="col">Accuracy</th></tr>
        <tr><th scope="row">Group A</th><td>${pct(a.tpr)}</td><td>${pct(a.fpr)}</td><td>${pct(a.acc)}</td></tr>
        <tr><th scope="row">Group B</th><td>${pct(b.tpr)}</td><td>${pct(b.fpr)}</td><td>${pct(b.acc)}</td></tr>`;
      summary.innerHTML =
        policy === "shared"
          ? `With one shared threshold, Group B is wrongly flagged <b>${pts(b.fpr - a.fpr)}</b> more often than Group A.`
          : policy === "eo"
            ? `Equal opportunity sets Group B's threshold to ${t.B.toFixed(2)} so true positive rates match. The false positive gap is now <b>${pts(m.fprGap)}</b>.`
            : `True positive gap <b>${pts(m.tprGap)}</b>, false positive gap <b>${pts(m.fprGap)}</b>.`;

      // challenge
      const L = LEVELS[level];
      const checks = L.checks(m);
      ui.checks.innerHTML = "";
      checks.forEach(([text, ok]) => {
        const li = document.createElement("li");
        li.className = ok ? "ok" : "";
        li.textContent = text;
        const sr = document.createElement("span");
        sr.className = "hp";
        sr.textContent = ok ? " (met)" : " (not met)";
        li.append(sr);
        ui.checks.append(li);
      });
      const done = checks.every(([, ok]) => ok);
      if (done && !L.impossible) {
        solved[level] = true;
        ui.pips[level].classList.add("done");
        ui.next.hidden = false;
      }
      if (fromUser && L.impossible) attempts++;
      if (L.impossible && !revealed && attempts >= 6) ui.why.hidden = false;
      redraw();
    }

    thrA.addEventListener("input", () => render(true));
    thrB.addEventListener("input", () => render(true));
    policyBtns.forEach((btn) =>
      btn.addEventListener("click", () => {
        setPolicy(btn.dataset.policy);
        render(true);
      })
    );
    ui.next.addEventListener("click", () => {
      showLevel(level + 1);
      if (level === 2) setPolicy("manual");
      render(false);
      ui.goal.focus?.();
    });
    ui.why.addEventListener("click", () => {
      revealed = true;
      solved[2] = true;
      ui.pips[2].classList.add("done");
      ui.reveal.hidden = false;
      ui.why.hidden = true;
      ui.restart.hidden = false;
    });
    ui.restart.addEventListener("click", () => {
      solved.fill(false);
      thrA.value = "0.55";
      thrA.dispatchEvent(new Event("input"));
      setPolicy("shared");
      showLevel(0);
      render(false);
    });
    document.addEventListener("start-challenge", () => {
      document.getElementById("fig-fair")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    setPolicy("shared");
    showLevel(0);
    render(false);
  });

  // ---------------------------------------------------------------------------
  // Figure 4. mcp-guardrail: live redaction
  // ---------------------------------------------------------------------------
  safely(() => {
    const input = document.getElementById("guard-in");
    const output = document.getElementById("guard-out");
    const counts = document.getElementById("guard-counts");
    if (!input || !output) return;

    const luhn = (digits) => {
      let sum = 0;
      let alt = false;
      for (let i = digits.length - 1; i >= 0; i--) {
        let d = digits.charCodeAt(i) - 48;
        if (alt) {
          d *= 2;
          if (d > 9) d -= 9;
        }
        sum += d;
        alt = !alt;
      }
      return sum % 10 === 0;
    };

    // Order matters: more specific secrets first.
    const RULES = [
      { type: "JWT", kind: "secret", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
      { type: "AWS_KEY", kind: "secret", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
      { type: "GITHUB_TOKEN", kind: "secret", re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
      { type: "SLACK_TOKEN", kind: "secret", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
      { type: "API_KEY", kind: "secret", re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
      { type: "BEARER", kind: "secret", re: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g },
      { type: "PASSWORD", kind: "secret", re: /("?(?:password|passwd|secret)"?\s*[:=]\s*")([^"]{4,})(")/gi, group: 2 },
      { type: "EMAIL", kind: "personal", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
      { type: "SSN", kind: "personal", re: /\b\d{3}-\d{2}-\d{4}\b/g },
      {
        type: "CARD",
        kind: "personal",
        re: /\b(?:\d[ -]?){12,18}\d\b/g,
        test: (m) => luhn(m.replace(/\D/g, "")),
      },
      { type: "PHONE", kind: "personal", re: /(?:\+1[ .-]?)?\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/g },
    ];

    const esc = (s) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

    function sanitize(text) {
      // Collect non-overlapping spans, first rule wins.
      const spans = [];
      const taken = (a, b) => spans.some((s) => a < s.end && b > s.start);
      for (const rule of RULES) {
        rule.re.lastIndex = 0;
        let m;
        while ((m = rule.re.exec(text))) {
          let start = m.index;
          let value = m[0];
          if (rule.group) {
            start = m.index + m[1].length;
            value = m[rule.group];
          }
          const end = start + value.length;
          if (rule.test && !rule.test(value)) continue;
          if (taken(start, end)) continue;
          spans.push({ start, end, type: rule.type, kind: rule.kind });
        }
      }
      spans.sort((a, b) => a.start - b.start);
      let html = "";
      let i = 0;
      const tally = {};
      for (const s of spans) {
        html += esc(text.slice(i, s.start));
        html += `<mark class="redact ${s.kind}" title="${s.type}">[REDACTED:${s.type}]</mark>`;
        i = s.end;
        tally[s.type] = (tally[s.type] || 0) + 1;
      }
      html += esc(text.slice(i));
      return { html, tally, total: spans.length };
    }

    function render() {
      const { html, tally, total } = sanitize(input.value);
      output.innerHTML = html;
      const parts = Object.entries(tally).map(([k, v]) => `${v} ${k.toLowerCase().replace(/_/g, " ")}`);
      counts.textContent = total
        ? `${total} redaction${total === 1 ? "" : "s"}: ${parts.join(", ")}.`
        : "Nothing sensitive found. Try pasting a key or an email address.";
    }
    input.addEventListener("input", render);
    render();
  });

  // ---------------------------------------------------------------------------
  // Figure 5. Analytical layer: trace a request through each design
  // ---------------------------------------------------------------------------
  safely(() => {
    const fig = document.getElementById("fig-serve");
    if (!fig) return;
    const modeBtns = fig.querySelectorAll("[data-mode]");
    const paths = fig.querySelectorAll(".hops");
    const traceBtn = document.getElementById("serve-trace");
    const log = document.getElementById("serve-log");
    let mode = "after";
    let timer = 0;

    function setMode(m) {
      mode = m;
      clearTimeout(timer);
      modeBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
      const pipe = fig.querySelector(".pipeline");
      if (pipe) pipe.hidden = m !== "after";
      paths.forEach((p) => {
        p.hidden = p.dataset.path !== m;
        p.querySelectorAll("li").forEach((li) => li.classList.remove("lit", "done"));
      });
      log.textContent = "Press “Trace a request” to follow one through the system.";
    }

    function trace() {
      clearTimeout(timer);
      const hops = [...fig.querySelectorAll(`.hops[data-path="${mode}"] li`)];
      hops.forEach((li) => li.classList.remove("lit", "done"));
      let i = 0;
      const delay = reduceMotion ? 0 : 650;
      const next = () => {
        if (i > 0) {
          hops[i - 1].classList.remove("lit");
          hops[i - 1].classList.add("done");
        }
        if (i >= hops.length) {
          log.textContent = hops.at(-1).dataset.end || "Done.";
          return;
        }
        hops[i].classList.add("lit");
        log.textContent = hops[i].dataset.log;
        i++;
        if (delay) timer = setTimeout(next, delay);
        else next();
      };
      next();
    }

    modeBtns.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
    traceBtn.addEventListener("click", trace);
    setMode("after");
  });
})();
