// "Drive the road of my career": a simple car game.
// One loop road, a low-poly car with a chase camera, eight billboards that open the sections of
// the site, coins to collect and a lap timer.

import * as THREE from "three";
import { sfx, sound } from "./audio.js";

// ------------------------------------------------------------ the stops on the road
// Each id matches a panel in index.html (generated from the classic page).
const STOPS = [
  { id: "welcome", title: "About me", sub: "Who I am and what I build" },
  { id: "rstad", title: "RSTAD", sub: "My anomaly detection research" },
  { id: "audit", title: "Responsible AI", sub: "Six audits of real AI systems" },
  { id: "guard", title: "mcp-guardrail", sub: "Open source for AI agents" },
  { id: "warehouse", title: "Analytical layer", sub: "DuckDB, Parquet and FastAPI" },
  { id: "career", title: "Career", sub: "Experience and education" },
  { id: "shed", title: "Skills", sub: "Tools and earlier projects" },
  { id: "radio", title: "Contact", sub: "Let's talk" },
];

const $ = (id) => document.getElementById(id);
const canvas = $("world-canvas");
const enterBtn = $("enter-world");

function webglOK() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (e) {
    return false;
  }
}

function palette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    dark: matchMedia("(prefers-color-scheme: dark)").matches && document.documentElement.dataset.theme !== "light" || document.documentElement.dataset.theme === "dark",
    paper: v("--paper"),
    sheet: v("--sheet"),
    ink: v("--ink"),
    muted: v("--muted"),
    trace: v("--trace"),
    anomaly: v("--anomaly"),
    grid: v("--grid"),
    text: v("--text"),
    ui: v("--ui"),
  };
}

if (!canvas || !webglOK()) {
  document.body.classList.add("no-webgl");
  const note = $("intro-note");
  if (note) note.textContent = "Your browser can't show the 3D game. The classic view has everything.";
  if (enterBtn) enterBtn.hidden = true;
} else {
  start();
}

function start() {
  const pal = palette();
  const coarse = matchMedia("(pointer: coarse)").matches;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------- renderer, scene, light
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const sky = new THREE.Color(pal.dark ? "#162232" : "#cfe0ee");
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, 90, 260);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 500);

  scene.add(new THREE.HemisphereLight(pal.dark ? "#9fb3d1" : "#ffffff", pal.dark ? "#1b2a1f" : "#6f8f6a", pal.dark ? 1.1 : 1.3));
  const sun = new THREE.DirectionalLight(pal.dark ? "#c8d4ff" : "#fff4e2", pal.dark ? 1.3 : 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 150 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, ...extra });
  const M = {
    grass: new THREE.MeshStandardMaterial({ color: pal.dark ? "#22382b" : "#9cc58f", roughness: 1 }),
    road: mat(pal.dark ? "#2a3240" : "#4a5260", { roughness: 0.95 }),
    line: mat("#f4f1e8"),
    curb: mat(pal.anomaly),
    curb2: mat("#f4f1e8"),
    trunk: mat("#7a5a3c"),
    leaf: mat(pal.dark ? "#2f5a3d" : "#4f8f55"),
    leaf2: mat(pal.dark ? "#3a6b46" : "#6aa864"),
    post: mat(pal.ink),
    car: mat(pal.anomaly, { roughness: 0.45, metalness: 0.2, flatShading: false }),
    glass: mat(pal.dark ? "#9fc2e0" : "#28394d", { roughness: 0.2, metalness: 0.4, flatShading: false }),
    tire: mat("#1d1f24"),
    light: new THREE.MeshStandardMaterial({ color: "#fff6cc", emissive: "#fff2b0", emissiveIntensity: 1.2 }),
    tail: new THREE.MeshStandardMaterial({ color: "#ff3b3b", emissive: "#ff2222", emissiveIntensity: 0.8 }),
    coin: new THREE.MeshStandardMaterial({ color: "#f2c230", emissive: "#d99a00", emissiveIntensity: 0.45, metalness: 0.6, roughness: 0.3 }),
  };

  // ---------------------------------------------------------- ground
  const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 64), M.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------------------------------------------------------- the road
  const control = [
    [0, 62], [42, 56], [78, 26], [80, -20], [52, -58], [10, -52], [-26, -76], [-72, -54], [-88, -6], [-64, 38], [-30, 52],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(control, true, "centripetal");
  const N = 900;
  const pts = curve.getSpacedPoints(N).slice(0, N);
  const tangents = pts.map((_, i) => pts[(i + 1) % N].clone().sub(pts[(i - 1 + N) % N]).normalize());
  const normals = tangents.map((t) => new THREE.Vector3(t.z, 0, -t.x)); // points to the left of travel
  const ROAD_HALF = 5;

  function ribbon(offsetA, offsetB, y, material) {
    const pos = [];
    const idx = [];
    for (let i = 0; i <= N; i++) {
      const k = i % N;
      const a = pts[k].clone().addScaledVector(normals[k], offsetA);
      const b = pts[k].clone().addScaledVector(normals[k], offsetB);
      pos.push(a.x, y, a.z, b.x, y, b.z);
      if (i < N) {
        const j = i * 2;
        idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    material.side = THREE.DoubleSide;
    return m;
  }
  scene.add(ribbon(ROAD_HALF, -ROAD_HALF, 0.02, M.road));

  // curbs: alternating red and white blocks on both edges
  {
    const geo = new THREE.BoxGeometry(0.6, 0.2, 2.2);
    const count = Math.floor(N / 4);
    const red = new THREE.InstancedMesh(geo, M.curb, count * 2);
    const white = new THREE.InstancedMesh(geo, M.curb2, count * 2);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    let r = 0;
    let w = 0;
    for (let k = 0; k < count; k++) {
      const i = k * 4;
      const ang = Math.atan2(tangents[i].x, tangents[i].z);
      q.setFromAxisAngle(up, ang);
      for (const side of [1, -1]) {
        const p = pts[i].clone().addScaledVector(normals[i], side * (ROAD_HALF + 0.3));
        m.compose(p.setY(0.1), q, new THREE.Vector3(1, 1, 1));
        if (k % 2) red.setMatrixAt(r++, m);
        else white.setMatrixAt(w++, m);
      }
    }
    red.count = r;
    white.count = w;
    scene.add(red, white);
  }
  // dashed centre line
  {
    const geo = new THREE.BoxGeometry(0.25, 0.02, 2.4);
    const count = Math.floor(N / 6);
    const dashes = new THREE.InstancedMesh(geo, M.line, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (let k = 0; k < count; k++) {
      const i = k * 6;
      q.setFromAxisAngle(up, Math.atan2(tangents[i].x, tangents[i].z));
      m.compose(pts[i].clone().setY(0.05), q, new THREE.Vector3(1, 1, 1));
      dashes.setMatrixAt(k, m);
    }
    scene.add(dashes);
  }
  // start and finish line with an arch
  {
    const i = 0;
    const ang = Math.atan2(tangents[i].x, tangents[i].z);
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 32;
    const g = c.getContext("2d");
    for (let x = 0; x < 16; x++)
      for (let y = 0; y < 2; y++) {
        g.fillStyle = (x + y) % 2 ? "#111" : "#fff";
        g.fillRect(x * 16, y * 16, 16, 16);
      }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 1.25), new THREE.MeshStandardMaterial({ map: tex }));
    line.rotation.set(-Math.PI / 2, 0, ang);
    line.position.copy(pts[i]).setY(0.06);
    scene.add(line);
    const arch = new THREE.Group();
    for (const s of [1, -1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 0.5), M.post);
      p.position.set(s * (ROAD_HALF + 1), 3, 0);
      p.castShadow = true;
      arch.add(p);
    }
    const banner = billboardTexture("Start", "Drive the road of my career", pal.ink, "#ffffff", 1024, 160);
    const top = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 3, 1.4, 0.3), [M.post, M.post, M.post, M.post, banner, banner]);
    top.position.y = 6.2;
    top.castShadow = true;
    arch.add(top);
    arch.position.copy(pts[i]);
    arch.rotation.y = ang;
    scene.add(arch);
  }

  // ---------------------------------------------------------- billboards
  function billboardTexture(title, sub, bg, fg, w = 1024, h = 512, num = "") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.textBaseline = "middle";
    const font = (pal.text || "Georgia, serif").replace(/"/g, "'");
    const ui = (pal.ui || "Arial, sans-serif").replace(/"/g, "'");
    if (h < 300) {
      g.font = `600 ${h * 0.42}px ${ui}`;
      g.textAlign = "center";
      g.fillText(`${title}  ·  ${sub}`.replace("  ·  ", "   "), w / 2, h / 2);
    } else {
      g.textAlign = "left";
      if (num) {
        g.globalAlpha = 0.75;
        g.font = `500 ${h * 0.09}px ${ui}`;
        g.fillText(num, w * 0.07, h * 0.18);
        g.globalAlpha = 1;
      }
      let size = h * 0.24;
      g.font = `400 ${size}px ${font}`;
      while (g.measureText(title).width > w * 0.86 && size > 40) {
        size -= 4;
        g.font = `400 ${size}px ${font}`;
      }
      g.fillText(title, w * 0.07, h * 0.47);
      g.globalAlpha = 0.85;
      g.font = `500 ${h * 0.1}px ${ui}`;
      g.fillText(sub, w * 0.07, h * 0.74);
      g.globalAlpha = 1;
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
  }

  const colliders = [];
  const stops = STOPS.map((s, k) => {
    const i = Math.round(((k + 0.08) / STOPS.length) * N) % N;
    const side = 1; // billboards on the left of the road
    const base = pts[i].clone().addScaledVector(normals[i], side * (ROAD_HALF + 8));
    const ang = Math.atan2(tangents[i].x, tangents[i].z);
    const g = new THREE.Group();
    g.position.copy(base);
    // face the oncoming car: turn toward the road and slightly back down it
    g.rotation.y = ang - Math.PI / 2 - 0.45;
    const bg = k % 2 ? pal.trace : pal.ink;
    const face = billboardTexture(s.title, s.sub, bg, "#ffffff", 1024, 512, `Stop ${k + 1} of ${STOPS.length}`);
    const board = new THREE.Mesh(new THREE.BoxGeometry(9, 4.5, 0.3), [M.post, M.post, M.post, M.post, face, M.post]);
    board.position.y = 5.2;
    board.castShadow = true;
    g.add(board);
    for (const x of [-3, 3]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.2, 0.35), M.post);
      leg.position.set(x, 1.6, -0.1);
      leg.castShadow = true;
      g.add(leg);
      const wp = new THREE.Vector3(x, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(base);
      colliders.push({ x: wp.x, z: wp.z, r: 0.5 });
    }
    scene.add(g);
    return { ...s, index: i, group: g, face };
  });
  // redraw billboard text once web fonts are ready
  document.fonts?.ready.then(() => {
    stops.forEach((st, k) => {
      const fresh = billboardTexture(st.title, st.sub, k % 2 ? pal.trace : pal.ink, "#ffffff", 1024, 512, `Stop ${k + 1} of ${STOPS.length}`);
      st.face.map.dispose();
      st.face.map = fresh.map;
      st.face.needsUpdate = true;
    });
  });

  // ---------------------------------------------------------- trees
  {
    const rand = (() => {
      let s = 7;
      return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    })();
    const spots = [];
    let guard = 0;
    while (spots.length < 170 && guard++ < 6000) {
      const x = (rand() - 0.5) * 300;
      const z = (rand() - 0.5) * 300;
      let near = Infinity;
      for (let i = 0; i < N; i += 6) near = Math.min(near, Math.hypot(pts[i].x - x, pts[i].z - z));
      if (near < ROAD_HALF + 7) continue;
      if (stops.some((s) => s.group.position.distanceTo(new THREE.Vector3(x, 0, z)) < 9)) continue;
      if (spots.some((p) => Math.hypot(p.x - x, p.z - z) < 4)) continue;
      spots.push({ x, z, s: 0.8 + rand() * 0.9, alt: rand() < 0.5 });
    }
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2, 6);
    trunkGeo.translate(0, 1, 0);
    const leafGeo = new THREE.ConeGeometry(1.8, 4.2, 7);
    leafGeo.translate(0, 3.9, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, M.trunk, spots.length);
    const leavesA = new THREE.InstancedMesh(leafGeo, M.leaf, spots.length);
    const leavesB = new THREE.InstancedMesh(leafGeo, M.leaf2, spots.length);
    const m = new THREE.Matrix4();
    let a = 0;
    let b = 0;
    spots.forEach((p, i) => {
      m.makeScale(p.s, p.s, p.s).setPosition(p.x, 0, p.z);
      trunks.setMatrixAt(i, m);
      if (p.alt) leavesA.setMatrixAt(a++, m);
      else leavesB.setMatrixAt(b++, m);
      colliders.push({ x: p.x, z: p.z, r: 0.7 * p.s });
    });
    leavesA.count = a;
    leavesB.count = b;
    [trunks, leavesA, leavesB].forEach((o) => {
      o.castShadow = true;
      scene.add(o);
    });
  }

  // ---------------------------------------------------------- coins
  const coins = [];
  {
    for (let k = 0; k < STOPS.length; k++) {
      const from = stops[k].index + 40;
      for (let j = 0; j < 6; j++) {
        const i = (from + j * 9) % N;
        const lateral = Math.sin((k + j * 0.6) * 1.3) * 2.6;
        coins.push({ p: pts[i].clone().addScaledVector(normals[i], lateral).setY(1.1), taken: false });
      }
    }
  }
  const coinMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 0.6, 0.14, 18), M.coin, coins.length);
  coinMesh.castShadow = true;
  scene.add(coinMesh);
  const coinM = new THREE.Matrix4();
  const coinQ = new THREE.Quaternion();
  const coinE = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Vector3(0, 0, 0);

  // ---------------------------------------------------------- the car
  const car = new THREE.Group();
  const body = new THREE.Group();
  {
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.7, 4.2), M.car);
    chassis.position.y = 0.75;
    const hood = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.25, 1.4), M.car);
    hood.position.set(0, 1.18, 1.25);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.75, 1.9), M.glass);
    cabin.position.set(0, 1.45, -0.3);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.12, 1.7), M.car);
    roof.position.set(0, 1.86, -0.35);
    const lights = [-0.65, 0.65].map((x) => {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.08), M.light);
      l.position.set(x, 0.85, 2.12);
      return l;
    });
    const tails = [-0.7, 0.7].map((x) => {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), M.tail);
      l.position.set(x, 0.85, -2.12);
      return l;
    });
    body.add(chassis, hood, cabin, roof, ...lights, ...tails);
    body.traverse((o) => o.isMesh && (o.castShadow = true));
  }
  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [
    [-1.05, 1.35, true],
    [1.05, 1.35, true],
    [-1.05, -1.35, false],
    [1.05, -1.35, false],
  ].map(([x, z, front]) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.45, z);
    const w = new THREE.Mesh(wheelGeo, M.tire);
    w.castShadow = true;
    pivot.add(w);
    car.add(pivot);
    return { pivot, w, front };
  });
  car.add(body);
  scene.add(car);

  const shadowBlob = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 4.8),
    new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.18, depthWrite: false })
  );
  shadowBlob.rotation.x = -Math.PI / 2;
  scene.add(shadowBlob);

  const startHeading = Math.atan2(tangents[0].x, tangents[0].z);
  const S = {
    x: pts[N - 12].x,
    z: pts[N - 12].z,
    heading: startHeading,
    speed: 0,
    steer: 0,
    idx: N - 12,
    lapStart: null,
    halfway: false,
    lap: 0,
    collected: 0,
  };

  // ---------------------------------------------------------- input
  const keys = { up: false, down: false, left: false, right: false };
  let controlsOn = false;
  const map = { arrowup: "up", w: "up", arrowdown: "down", s: "down", arrowleft: "left", a: "left", arrowright: "right", d: "right" };
  const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  window.addEventListener("keydown", (e) => {
    const k = map[e.key.toLowerCase()];
    if (!k || typing() || !controlsOn) return;
    keys[k] = true;
    if (e.key.startsWith("Arrow")) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => {
    const k = map[e.key.toLowerCase()];
    if (k) keys[k] = false;
  });
  window.addEventListener("blur", () => Object.keys(keys).forEach((k) => (keys[k] = false)));
  document.querySelectorAll("[data-key]").forEach((btn) => {
    const k = btn.dataset.key;
    const on = (e) => {
      e.preventDefault();
      if (!controlsOn) return;
      keys[k] = true;
      btn.classList.add("down");
      try {
        btn.setPointerCapture(e.pointerId);
      } catch (err) {
        /* synthetic events have no capturable pointer */
      }
    };
    const off = () => {
      keys[k] = false;
      btn.classList.remove("down");
    };
    btn.addEventListener("pointerdown", on);
    btn.addEventListener("pointerup", off);
    btn.addEventListener("pointercancel", off);
    btn.addEventListener("lostpointercapture", off);
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  });

  // ---------------------------------------------------------- UI: HUD, stop card, panel
  const ui = {
    coins: $("hud-coins"),
    lap: $("hud-lap"),
    best: $("hud-best"),
    card: $("stop-card"),
    cardNum: $("stop-num"),
    cardTitle: $("stop-title"),
    cardSub: $("stop-sub"),
    cardOpen: $("stop-open"),
    toast: $("toast"),
    panel: $("panel"),
    panelTitle: $("panel-title"),
    panelSub: $("panel-sub"),
    panelBody: $("panel-body"),
    sound: $("sound-btn"),
  };
  ui.coins.textContent = `0 / ${coins.length}`;
  const BEST_KEY = "career-road-best-lap";
  let best = null;
  try {
    best = Number(localStorage.getItem(BEST_KEY)) || null;
  } catch (e) {
    best = null;
  }
  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const r = s - m * 60;
    return `${m}:${r.toFixed(1).padStart(4, "0")}`;
  };
  ui.best.textContent = best ? fmt(best) : "–";

  let toastTimer = 0;
  function toast(title, text) {
    ui.toast.innerHTML = "<b></b><span></span>";
    ui.toast.firstChild.textContent = title;
    ui.toast.lastChild.textContent = text || "";
    ui.toast.hidden = false;
    ui.toast.classList.remove("show");
    void ui.toast.offsetWidth;
    ui.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove("show"), 3200);
  }

  let cardStop = null;
  function showCard(stop) {
    if (stop === cardStop) return;
    cardStop = stop;
    if (!stop) {
      ui.card.classList.remove("show");
      return;
    }
    const k = stops.indexOf(stop);
    ui.cardNum.textContent = `Stop ${k + 1} of ${stops.length}`;
    ui.cardTitle.textContent = stop.title;
    ui.cardSub.textContent = stop.sub;
    ui.card.hidden = false;
    ui.card.classList.add("show");
    sfx.stop();
  }

  let openStop = null;
  function openPanel(stop) {
    openStop = stop;
    controlsOn = false;
    Object.keys(keys).forEach((k) => (keys[k] = false));
    ui.panelTitle.textContent = stop.title;
    ui.panelSub.textContent = stop.sub;
    ui.panelBody.querySelectorAll("[data-zone]").forEach((s) => (s.hidden = s.dataset.zone !== stop.id));
    ui.panel.hidden = false;
    ui.panelBody.scrollTop = 0;
    document.body.classList.add("panel-open");
    void ui.panel.offsetWidth; // start the slide-in from the closed position
    ui.panel.classList.add("open");
    $("panel-close").focus({ preventScroll: true });
    sfx.open();
  }
  function closePanel() {
    if (!openStop) return;
    openStop = null;
    ui.panel.classList.remove("open");
    document.body.classList.remove("panel-open");
    setTimeout(() => !openStop && (ui.panel.hidden = true), 260);
    controlsOn = true;
    canvas.focus({ preventScroll: true });
  }
  ui.cardOpen.addEventListener("click", () => cardStop && openPanel(cardStop));
  $("panel-close").addEventListener("click", closePanel);
  const step = (d) => {
    const k = (stops.indexOf(openStop) + d + stops.length) % stops.length;
    openPanel(stops[k]);
  };
  $("panel-prev").addEventListener("click", () => step(-1));
  $("panel-next").addEventListener("click", () => step(1));
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openStop) closePanel();
    else if ((e.key === "Enter" || e.key === "e" || e.key === "E") && cardStop && !openStop && controlsOn && !typing() && document.activeElement?.tagName !== "BUTTON") {
      e.preventDefault();
      openPanel(cardStop);
    }
  });
  const syncSound = () => {
    ui.sound.textContent = sound.enabled ? "Sound on" : "Sound off";
    ui.sound.setAttribute("aria-pressed", String(sound.enabled));
  };
  ui.sound.addEventListener("click", () => {
    sound.toggle();
    syncSound();
  });
  syncSound();

  // ---------------------------------------------------------- resize
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 68 : 55;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------------------------------------------------------- loop
  const fwd = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const clock = new THREE.Clock();
  let t = 0;
  let first = true;

  function nearestIndex() {
    let bestI = S.idx;
    let bestD = Infinity;
    for (let o = -60; o <= 60; o++) {
      const i = (S.idx + o + N) % N;
      const d = (pts[i].x - S.x) ** 2 + (pts[i].z - S.z) ** 2;
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    // if we lost track (e.g. drove far off-road), search everything
    if (bestD > 400) {
      for (let i = 0; i < N; i++) {
        const d = (pts[i].x - S.x) ** 2 + (pts[i].z - S.z) ** 2;
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      }
    }
    return { i: bestI, d: Math.sqrt(bestD) };
  }

  function frame() {
    const dt = Math.min(0.05, clock.getDelta());
    t += dt;

    // --- driving model
    const near = nearestIndex();
    const offRoad = near.d > ROAD_HALF + 0.8;
    const maxF = offRoad ? 13 : 30;
    const throttle = keys.up ? 1 : 0;
    const brake = keys.down ? 1 : 0;
    if (throttle) S.speed += (S.speed < 0 ? 40 : 16) * dt;
    if (brake) S.speed -= (S.speed > 0 ? 34 : 10) * dt;
    if (!throttle && !brake) S.speed -= Math.sign(S.speed) * Math.min(Math.abs(S.speed), 7 * dt);
    if (offRoad && Math.abs(S.speed) > maxF) S.speed -= Math.sign(S.speed) * 30 * dt;
    S.speed = Math.max(-9, Math.min(maxF + (offRoad ? 0 : 0), S.speed));
    const steerIn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
    S.steer += (steerIn * 0.6 - S.steer) * Math.min(1, dt * 8);
    const turn = S.steer * Math.min(1, Math.abs(S.speed) / 6) * Math.sign(S.speed || 1) * 2.1;
    S.heading += turn * dt;
    fwd.set(Math.sin(S.heading), 0, Math.cos(S.heading));
    S.x += fwd.x * S.speed * dt;
    S.z += fwd.z * S.speed * dt;

    // collisions with trees and billboard legs
    for (const c of colliders) {
      const dx = S.x - c.x;
      const dz = S.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + 1.3;
      if (d < min) {
        S.x = c.x + (dx / (d || 1)) * min;
        S.z = c.z + (dz / (d || 1)) * min;
        if (Math.abs(S.speed) > 4) sfx.bump();
        S.speed *= -0.25;
      }
    }
    const R = 150;
    if (Math.hypot(S.x, S.z) > R) {
      const a = Math.atan2(S.z, S.x);
      S.x = Math.cos(a) * R;
      S.z = Math.sin(a) * R;
      S.speed *= 0.3;
    }

    // --- progress, laps, stops
    const prev = S.idx;
    S.idx = near.i;
    if (S.lapStart === null && Math.abs(S.speed) > 1) S.lapStart = t;
    if (S.idx > N * 0.45 && S.idx < N * 0.55) S.halfway = true;
    if (prev > N * 0.9 && S.idx < N * 0.1 && S.halfway) {
      S.lap++;
      S.halfway = false;
      const lapTime = t - S.lapStart;
      S.lapStart = t;
      const isBest = !best || lapTime < best;
      if (isBest) {
        best = lapTime;
        try {
          localStorage.setItem(BEST_KEY, String(best));
        } catch (e) {
          /* not saved */
        }
        ui.best.textContent = fmt(best);
      }
      toast(`Lap ${S.lap}: ${fmt(lapTime)}`, isBest ? "New best lap. The coins are back for another round." : "The coins are back for another round.");
      sfx.lap();
      coins.forEach((c) => (c.taken = false));
    }
    ui.lap.textContent = S.lapStart === null ? "0:00.0" : fmt(t - S.lapStart);

    let here = null;
    for (const st of stops) {
      const d = (S.idx - st.index + N) % N;
      const ahead = (st.index - S.idx + N) % N;
      if (ahead < 70 || d < 20) here = st;
    }
    if (!openStop) showCard(here);

    // coins
    let got = 0;
    coins.forEach((c, i) => {
      if (!c.taken && Math.hypot(c.p.x - S.x, c.p.z - S.z) < 2.1) {
        c.taken = true;
        S.collected++;
        sfx.coin();
      }
      if (!c.taken) got++;
      coinE.set(Math.PI / 2, t * 3 + i, 0);
      coinQ.setFromEuler(coinE);
      coinM.compose(c.p.clone().setY(1.1 + Math.sin(t * 3 + i) * 0.15), coinQ, c.taken ? zero : one);
      coinMesh.setMatrixAt(i, coinM);
    });
    coinMesh.instanceMatrix.needsUpdate = true;
    ui.coins.textContent = `${coins.length - got} / ${coins.length}`;

    // --- car visuals
    car.position.set(S.x, 0, S.z);
    car.rotation.y = S.heading;
    body.rotation.z = -S.steer * Math.min(1, Math.abs(S.speed) / 20) * 0.12;
    body.rotation.x = (throttle ? -0.03 : 0) + (brake && S.speed > 1 ? 0.05 : 0);
    body.position.y = offRoad ? Math.sin(t * 30) * 0.03 * Math.min(1, Math.abs(S.speed) / 8) : 0;
    wheels.forEach((w) => {
      w.w.rotation.x += (S.speed * dt) / 0.45;
      if (w.front) w.pivot.rotation.y = S.steer * 0.9;
    });
    shadowBlob.position.set(S.x, 0.04, S.z);
    shadowBlob.rotation.z = S.heading;

    // --- camera: behind and above the car
    const portrait = window.innerWidth < window.innerHeight;
    const back = portrait ? 15 : 12.5;
    const up = portrait ? 8 : 6;
    const desired = new THREE.Vector3(S.x - fwd.x * back, up, S.z - fwd.z * back);
    const look = new THREE.Vector3(S.x + fwd.x * 6, 1.2, S.z + fwd.z * 6);
    if (first) {
      camPos.copy(desired);
      camLook.copy(look);
      first = false;
    }
    const k = reduce ? 1 : Math.min(1, dt * 4.5);
    camPos.lerp(desired, k);
    camLook.lerp(look, Math.min(1, dt * 6));
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    sun.position.set(S.x + 25, 60, S.z + 15);
    sun.target.position.set(S.x, 0, S.z);

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------------------------------------------------------- intro
  document.body.classList.add("world-ready");
  if (enterBtn) {
    enterBtn.disabled = false;
    enterBtn.textContent = "Start driving";
    enterBtn.addEventListener("click", () => {
      sound.unlock();
      const intro = $("intro");
      intro.classList.add("leaving");
      setTimeout(
        () => {
          intro.hidden = true;
          document.body.classList.add("in-world");
          controlsOn = true;
          canvas.focus({ preventScroll: true });
          toast(coarse ? "Use the buttons to drive" : "Drive with the arrow keys or WASD", "Stop at each billboard to read about my work. Grab the coins.");
        },
        reduce ? 0 : 400
      );
    });
  }
}
