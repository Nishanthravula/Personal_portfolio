// DOM side of the world: intro, zone panels, prompt, places menu, minimap, toasts, arcade HUD.

import { ZONES, zoneById, WORLD_RADIUS } from "./common.js";

const $ = (id) => document.getElementById(id);

export function makeUI(handlers) {
  const el = {
    intro: $("intro"),
    enter: $("enter-world"),
    panel: $("panel"),
    panelTitle: $("panel-title"),
    panelSub: $("panel-sub"),
    panelBody: $("panel-body"),
    prev: $("panel-prev"),
    next: $("panel-next"),
    close: $("panel-close"),
    prompt: $("prompt"),
    promptBtn: $("prompt-open"),
    places: $("places"),
    placesBtn: $("places-btn"),
    placesList: $("places-list"),
    toast: $("toast"),
    minimap: $("minimap"),
    soundBtn: $("sound-btn"),
    fade: $("fade"),
    ahud: $("arcade-hud"),
    aScore: $("a-score"),
    aWave: $("a-wave"),
    aMult: $("a-mult"),
    aInt: $("a-integrity"),
    aIntBar: $("a-integrity-bar"),
    aBest: $("a-best"),
    aBanner: $("a-banner"),
    aPop: $("a-pop"),
    aFire: $("a-fire"),
    aPause: $("a-pause"),
    aOver: $("a-over"),
    aOverBody: $("a-over-body"),
    aAgain: $("a-again"),
    aExit: $("a-exit"),
    aExit2: $("a-exit-2"),
    aPaused: $("a-paused"),
    aResume: $("a-resume"),
  };

  let openZone = null;
  const order = ZONES.map((z) => z.id);

  // ---- panel
  function openPanel(id) {
    const z = zoneById[id];
    if (!z) return;
    openZone = id;
    el.panelTitle.textContent = z.name;
    el.panelSub.textContent = z.sub;
    el.panelBody.querySelectorAll("[data-zone]").forEach((s) => (s.hidden = s.dataset.zone !== id));
    el.panel.hidden = false;
    el.panelBody.scrollTop = 0;
    document.body.classList.add("panel-open");
    el.prompt.hidden = true;
    requestAnimationFrame(() => el.panel.classList.add("open"));
    el.close.focus({ preventScroll: true });
    history.replaceState(null, "", `#${id}`);
    handlers.onPanel?.(true, id);
  }
  function closePanel() {
    if (!openZone) return;
    const was = openZone;
    openZone = null;
    el.panel.classList.remove("open");
    document.body.classList.remove("panel-open");
    setTimeout(() => {
      if (!openZone) el.panel.hidden = true;
    }, 260);
    history.replaceState(null, "", location.pathname);
    handlers.onPanel?.(false, was);
    handlers.focusWorld?.();
  }
  el.close.addEventListener("click", closePanel);
  const step = (d) => {
    const i = order.indexOf(openZone);
    const id = order[(i + d + order.length) % order.length];
    closePanel();
    handlers.travel(id, { open: true, teleport: true });
  };
  el.prev.addEventListener("click", () => step(-1));
  el.next.addEventListener("click", () => step(1));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!el.places.hidden) togglePlaces(false);
      else if (openZone) closePanel();
      else handlers.onEscape?.();
    }
  });

  // ---- prompt
  let promptZone = null;
  function setPrompt(id) {
    if (id === promptZone) return;
    promptZone = id;
    if (!id || openZone) {
      el.prompt.hidden = true;
      return;
    }
    const z = zoneById[id];
    el.promptBtn.innerHTML = "";
    const name = document.createElement("span");
    name.textContent = id === "arcade" ? "Play Anomaly Hunter" : `Open ${z.name}`;
    const key = document.createElement("kbd");
    key.textContent = "E";
    el.promptBtn.append(name, key);
    el.prompt.hidden = false;
  }
  el.promptBtn.addEventListener("click", () => promptZone && openPanel(promptZone));
  document.addEventListener("keydown", (e) => {
    if ((e.key === "e" || e.key === "E" || e.key === "Enter") && promptZone && !openZone && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "BUTTON" && !document.body.classList.contains("arcade-mode") && el.intro.hidden) {
      e.preventDefault();
      openPanel(promptZone);
    }
  });

  // ---- places menu
  ZONES.forEach((z) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = `<b></b><span></span>`;
    b.firstChild.textContent = z.name;
    b.lastChild.textContent = z.sub;
    b.addEventListener("click", () => {
      togglePlaces(false);
      closePanel();
      handlers.travel(z.id, { open: true });
    });
    li.append(b);
    el.placesList.append(li);
  });
  function togglePlaces(v) {
    const show = v ?? el.places.hidden;
    el.places.hidden = !show;
    el.placesBtn.setAttribute("aria-expanded", String(show));
    if (show) el.placesList.querySelector("button")?.focus();
  }
  el.placesBtn.addEventListener("click", () => togglePlaces());
  document.addEventListener("click", (e) => {
    if (!el.places.hidden && !el.places.contains(e.target) && e.target !== el.placesBtn && !el.placesBtn.contains(e.target)) togglePlaces(false);
  });

  // ---- sound
  const syncSound = (on) => {
    el.soundBtn.textContent = on ? "Sound on" : "Sound off";
    el.soundBtn.setAttribute("aria-pressed", String(on));
  };
  el.soundBtn.addEventListener("click", () => syncSound(handlers.toggleSound()));
  syncSound(handlers.soundEnabled());

  // ---- toast
  let toastTimer = 0;
  function toast(title, text) {
    el.toast.innerHTML = "<b></b><span></span>";
    el.toast.firstChild.textContent = title;
    el.toast.lastChild.textContent = text;
    el.toast.hidden = false;
    el.toast.classList.remove("show");
    void el.toast.offsetWidth;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.classList.remove("show");
      setTimeout(() => (el.toast.hidden = true), 300);
    }, 3400);
  }

  // ---- fade for teleports
  function fade(fn) {
    el.fade.classList.add("on");
    setTimeout(() => {
      fn();
      el.fade.classList.remove("on");
    }, 220);
  }

  // ---- minimap
  const mm = el.minimap.getContext("2d");
  let mmSize = 0;
  function sizeMinimap() {
    const r = el.minimap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    mmSize = r.width;
    el.minimap.width = Math.round(r.width * dpr);
    el.minimap.height = Math.round(r.height * dpr);
    mm.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const W = WORLD_RADIUS + 8;
  const toMap = (x, z) => [((x + W) / (2 * W)) * mmSize, ((z + W) / (2 * W)) * mmSize];
  const fromMap = (mx, my) => [(mx / mmSize) * 2 * W - W, (my / mmSize) * 2 * W - W];
  function drawMinimap(player, roadSamples, colors, current) {
    if (!mmSize) sizeMinimap();
    const s = mmSize;
    mm.clearRect(0, 0, s, s);
    mm.fillStyle = colors.sheet;
    mm.globalAlpha = 0.92;
    mm.beginPath();
    mm.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2);
    mm.fill();
    mm.globalAlpha = 1;
    mm.strokeStyle = colors.grid;
    mm.lineWidth = 1;
    mm.stroke();
    mm.strokeStyle = colors.trace;
    mm.lineWidth = 1.5;
    mm.beginPath();
    roadSamples.forEach((p, i) => {
      const [x, y] = toMap(p.x, p.z);
      if (i % 41 === 0) mm.moveTo(x, y);
      else mm.lineTo(x, y);
    });
    mm.stroke();
    mm.font = `600 9px ${colors.ui}`;
    mm.textAlign = "center";
    mm.textBaseline = "middle";
    ZONES.forEach((z) => {
      const [x, y] = toMap(z.x, z.z);
      mm.fillStyle = z.id === current ? colors.anomaly : z.id === "arcade" ? colors.anomaly : colors.ink;
      mm.beginPath();
      mm.arc(x, y, z.id === current ? 6.5 : 5, 0, Math.PI * 2);
      mm.fill();
      mm.fillStyle = colors.sheet;
      mm.fillText(z.name[0], x, y + 0.5);
    });
    const [px, py] = toMap(player.pos.x, player.pos.z);
    mm.save();
    mm.translate(px, py);
    mm.rotate(-player.heading);
    mm.fillStyle = colors.trace;
    mm.strokeStyle = colors.sheet;
    mm.lineWidth = 1.5;
    mm.beginPath();
    mm.moveTo(7, 0);
    mm.lineTo(-5, -4.5);
    mm.lineTo(-3, 0);
    mm.lineTo(-5, 4.5);
    mm.closePath();
    mm.fill();
    mm.stroke();
    mm.restore();
  }
  el.minimap.addEventListener("click", (e) => {
    const r = el.minimap.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let bestZ = null;
    let bestD = 14;
    ZONES.forEach((z) => {
      const [x, y] = toMap(z.x, z.z);
      const d = Math.hypot(mx - x, my - y);
      if (d < bestD) {
        bestD = d;
        bestZ = z;
      }
    });
    closePanel();
    if (bestZ) handlers.travel(bestZ.id, { open: true });
    else {
      const [x, z] = fromMap(mx, my);
      handlers.driveTo(x, z);
    }
  });
  window.addEventListener("resize", () => (mmSize = 0));

  // ---- arcade HUD
  let popTimer = 0;
  let bannerTimer = 0;
  const arcade = {
    arcadeHud({ score, wave, integrity, mult, best }) {
      el.aScore.textContent = score.toLocaleString();
      el.aWave.textContent = String(Math.max(1, wave));
      el.aMult.textContent = mult > 1 ? `×${mult}` : "";
      el.aInt.textContent = `${integrity}%`;
      el.aIntBar.style.width = `${integrity}%`;
      el.aIntBar.classList.toggle("low", integrity <= 30);
      el.aBest.textContent = best.toLocaleString();
    },
    arcadeBanner(title, sub) {
      el.aBanner.innerHTML = "<b></b><span></span>";
      el.aBanner.firstChild.textContent = title;
      el.aBanner.lastChild.textContent = sub || "";
      el.aBanner.hidden = false;
      el.aBanner.classList.remove("show");
      void el.aBanner.offsetWidth;
      el.aBanner.classList.add("show");
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => (el.aBanner.hidden = true), 1900);
    },
    arcadePop(text, bad) {
      el.aPop.textContent = text;
      el.aPop.classList.toggle("bad", !!bad);
      el.aPop.hidden = false;
      el.aPop.classList.remove("show");
      void el.aPop.offsetWidth;
      el.aPop.classList.add("show");
      clearTimeout(popTimer);
      popTimer = setTimeout(() => (el.aPop.hidden = true), 900);
    },
    arcadeOver({ score, wave, kills, falsePositives, best, newBest }) {
      el.aOverBody.innerHTML = `
        <p class="a-final">${score.toLocaleString()}</p>
        <p class="a-final-sub">${newBest ? "New high score" : `High score ${best.toLocaleString()}`}</p>
        <dl class="a-stats">
          <div><dt>Waves survived</dt><dd>${Math.max(0, wave - 1)}</dd></div>
          <div><dt>Anomalies destroyed</dt><dd>${kills}</dd></div>
          <div><dt>False positives</dt><dd>${falsePositives}</dd></div>
        </dl>`;
      el.aOver.hidden = false;
      el.aAgain.focus({ preventScroll: true });
    },
  };
  el.aFire.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handlers.fire();
  });
  el.aPause.addEventListener("click", () => handlers.pause(true));
  el.aResume.addEventListener("click", () => handlers.pause(false));
  el.aAgain.addEventListener("click", () => {
    el.aOver.hidden = true;
    handlers.startArcade();
  });
  [el.aExit, el.aExit2].forEach((b) =>
    b.addEventListener("click", () => {
      el.aOver.hidden = true;
      el.aPaused.hidden = true;
      handlers.exitArcade();
    })
  );
  document.querySelectorAll("[data-start-arcade]").forEach((b) =>
    b.addEventListener("click", () => {
      closePanel();
      handlers.startArcade();
    })
  );

  return {
    el,
    openPanel,
    closePanel,
    get openZone() {
      return openZone;
    },
    setPrompt,
    toast,
    fade,
    drawMinimap,
    togglePlaces,
    setArcadeMode(on) {
      document.body.classList.toggle("arcade-mode", on);
      el.ahud.hidden = !on;
      el.aOver.hidden = true;
      el.aPaused.hidden = true;
      if (on) setPrompt(null);
    },
    setPaused(on) {
      el.aPaused.hidden = !on;
      if (on) el.aResume.focus({ preventScroll: true });
    },
    ...arcade,
  };
}
