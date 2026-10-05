// Entry point: renderer, camera, lights, physics, and the frame loop.

import * as THREE from "three";
import * as CANNON from "cannon-es";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ZONES, zoneById, terrainHeight, padHeight, palette, reducedMotion } from "./common.js";
import { makeMaterials, makeTerrain, makeRoad, makeTrees, makeClouds, makeProps, makeLandmarks } from "./scenery.js";
import { makePlayer, makeInput, makeParticles } from "./player.js";
import { makeArcade } from "./arcade.js";
import { makeUI } from "./ui.js";
import { sfx, sound } from "./audio.js";

const canvas = document.getElementById("world-canvas");
const introNote = document.getElementById("intro-note");
const enterBtn = document.getElementById("enter-world");

function webglOK() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (e) {
    return false;
  }
}

if (!canvas || !webglOK()) {
  document.body.classList.add("no-webgl");
  if (introNote) introNote.textContent = "Your browser can't show the 3D world. The classic view has everything.";
  if (enterBtn) enterBtn.hidden = true;
} else {
  boot();
}

function boot() {
  const coarse = matchMedia("(pointer: coarse)").matches;
  const lowEnd = coarse || (navigator.hardwareConcurrency || 8) <= 4;
  const rm = reducedMotion();
  let pal = palette();

  // ---------------------------------------------------------- renderer and scene
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowEnd, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowEnd ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 600);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x8899aa, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowEnd ? 1024 : 2048, lowEnd ? 1024 : 2048);
  const sc = sun.shadow.camera;
  sc.left = -45;
  sc.right = 45;
  sc.top = 45;
  sc.bottom = -45;
  sc.near = 1;
  sc.far = 160;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(hemi, sun, sun.target);

  function applyLighting() {
    scene.background = new THREE.Color(pal.dark ? "#111925" : "#e6ebf1");
    scene.fog = new THREE.Fog(scene.background, 150, 330);
    hemi.color.set(pal.dark ? "#8fa6c2" : "#ffffff");
    hemi.groundColor.set(pal.dark ? "#141c27" : "#9aa8b8");
    hemi.intensity = pal.dark ? 1.05 : 1.15;
    sun.intensity = pal.dark ? 1.25 : 1.7;
    sun.color.set(pal.dark ? "#b9c9ff" : "#fff6ea");
  }
  applyLighting();

  // ---------------------------------------------------------- physics
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
  world.allowSleep = true;
  world.broadphase = new CANNON.SAPBroadphase(world);
  const physicsMats = { ground: new CANNON.Material("ground"), prop: new CANNON.Material("prop"), player: new CANNON.Material("player") };
  world.addContactMaterial(new CANNON.ContactMaterial(physicsMats.ground, physicsMats.prop, { friction: 0.4, restitution: 0.15 }));
  world.addContactMaterial(new CANNON.ContactMaterial(physicsMats.prop, physicsMats.prop, { friction: 0.35, restitution: 0.1 }));
  world.addContactMaterial(new CANNON.ContactMaterial(physicsMats.player, physicsMats.prop, { friction: 0.1, restitution: 0.45 }));

  // ---------------------------------------------------------- content
  let mats = makeMaterials(pal);
  const terrain = makeTerrain(pal);
  scene.add(terrain);
  const road = makeRoad(mats);
  scene.add(road.group);
  const colliders = [];
  const trees = makeTrees(mats, pal, colliders);
  scene.add(trees.group);
  const clouds = makeClouds(pal);
  scene.add(clouds.group);
  const land = makeLandmarks(mats, pal);
  land.items.forEach((it) => scene.add(it.group));
  colliders.push(...land.colliders);
  const props = makeProps(world, mats, physicsMats);
  props.props.forEach((p) => scene.add(p.mesh));
  const player = makePlayer(scene, world, mats, pal, physicsMats);
  const particles = makeParticles(scene);

  // Labels above landmarks, clickable to travel there.
  const labelRenderer = new CSS2DRenderer({ element: document.getElementById("labels") });
  ZONES.forEach((z) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `zlabel${z.id === "arcade" ? " hot" : ""}`;
    b.innerHTML = "<b></b><span></span>";
    b.firstChild.textContent = z.name;
    b.lastChild.textContent = z.sub;
    b.tabIndex = -1;
    b.addEventListener("click", () => travel(z.id, { open: true }));
    const o = new CSS2DObject(b);
    const heights = { rstad: 12, audit: 12, guard: 13, radio: 21, arcade: 8, career: 7, warehouse: 9, shed: 9, welcome: 9 };
    o.position.set(z.x, padHeight(z.id) + (heights[z.id] || 9), z.z);
    scene.add(o);
  });
  land.milestones.forEach((ms) => {
    const d = document.createElement("div");
    d.className = `mlabel${ms.now ? " now" : ""}`;
    d.innerHTML = "<b></b> <span></span>";
    d.firstChild.textContent = ms.year;
    d.lastChild.textContent = ms.title;
    const o = new CSS2DObject(d);
    o.position.copy(ms.pos);
    scene.add(o);
  });

  // ---------------------------------------------------------- postprocessing (desktop, dark theme)
  let composer = null;
  let bloom = null;
  function setupComposer() {
    composer = null;
    if (lowEnd || !pal.dark) return;
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.55, 0.72);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    resize();
  }

  // ---------------------------------------------------------- input, UI, arcade
  const input = makeInput(canvas, camera, terrain);
  let arcade;
  const ui = makeUI({
    travel,
    driveTo: (x, z) => (input.s.autopilot = { x, z, stop: 1.5, boost: true }),
    toggleSound: () => sound.toggle(),
    soundEnabled: () => sound.enabled,
    onPanel: (open, id) => {
      input.s.enabled = !open;
      if (open) sfx.open();
      if (!open && id) lastPromptClosed = id;
      resize();
    },
    focusWorld: () => canvas.focus({ preventScroll: true }),
    onEscape: () => {
      if (arcade.active && !arcade.over) setPaused(!arcade.paused);
    },
    fire: () => arcade.fire(),
    pause: (v) => setPaused(v),
    startArcade,
    exitArcade,
  });
  arcade = makeArcade({ scene, mats, pal, player, particles, ui, reduceMotion: rm });
  let lastPromptClosed = null;

  input.s.clickables.push({
    object: land.duck,
    onClick: () => {
      land.duck.userData.hop = 1;
      sfx.quack();
      particles.burst(land.duck.getWorldPosition(new THREE.Vector3()), "#e9b73a", 10, 5, 0.6);
      ui.toast("Quack.", "DuckDB says hi. Analytical queries, in process, no server.");
    },
  });

  function setPaused(v) {
    arcade.pause(v);
    ui.setPaused(v);
  }

  function startArcade() {
    sound.unlock();
    input.s.autopilot = null;
    input.s.enabled = true;
    ui.setArcadeMode(true);
    input.s.onFire = () => arcade.fire();
    arcade.start();
    canvas.focus({ preventScroll: true });
  }
  function exitArcade() {
    arcade.stop();
    ui.setArcadeMode(false);
    input.s.onFire = null;
    const z = zoneById.arcade;
    player.teleport(z.x - z.r - 5, z.z);
    canvas.focus({ preventScroll: true });
  }

  function travel(id, { open = false, teleport = false } = {}) {
    const z = zoneById[id];
    if (!z) return;
    if (arcade.active) exitArcade();
    const p = player.state.pos;
    const dir = new THREE.Vector2(p.x - z.x, p.z - z.z);
    if (dir.length() < 0.1) dir.set(0, 1);
    dir.normalize();
    const edge = { x: z.x + dir.x * (z.r * 0.6), z: z.z + dir.y * (z.r * 0.6) };
    const far = Math.hypot(p.x - z.x, p.z - z.z) > 28;
    const arrive = () => open && !ui.openZone && ui.openPanel(id);
    if (teleport || far) {
      ui.fade(() => {
        player.teleport(edge.x, edge.z);
        input.s.autopilot = null;
        arrive();
      });
    } else {
      input.s.autopilot = { x: edge.x, z: edge.z, stop: 1.5, boost: true, onArrive: arrive };
      // Safety net: if something blocks the way, jump the rest of the way.
      const started = performance.now();
      const check = () => {
        if (!input.s.autopilot || input.s.autopilot.onArrive !== arrive) return;
        if (performance.now() - started > 4000) {
          input.s.autopilot = null;
          ui.fade(() => {
            player.teleport(edge.x, edge.z);
            arrive();
          });
        } else setTimeout(check, 250);
      };
      setTimeout(check, 250);
    }
  }

  // ---------------------------------------------------------- theme changes
  function onTheme() {
    pal = palette();
    const fresh = makeMaterials(pal);
    for (const k of Object.keys(mats)) {
      mats[k].color.copy(fresh[k].color);
      if (mats[k].emissive && fresh[k].emissive) mats[k].emissive.copy(fresh[k].emissive);
      if ("opacity" in fresh[k]) mats[k].opacity = fresh[k].opacity;
    }
    const t2 = makeTerrain(pal);
    terrain.geometry.attributes.color.copy(t2.geometry.attributes.color);
    terrain.geometry.attributes.color.needsUpdate = true;
    t2.geometry.dispose();
    player.setColors(pal);
    applyLighting();
    setupComposer();
  }
  document.addEventListener("themechange", onTheme);
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", onTheme);

  // ---------------------------------------------------------- sizing
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    // With a panel open on a wide screen, shift the view so the probe stays visible beside it.
    const panelW = ui.openZone && w > 900 ? Math.min(w * 0.5, 760) : 0;
    if (panelW) camera.setViewOffset(w, h, panelW / 2, 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    composer?.setSize(w, h);
  }
  window.addEventListener("resize", resize);
  setupComposer();
  resize();

  // ---------------------------------------------------------- start position (deep links)
  const hashZone = location.hash.slice(1);
  if (zoneById[hashZone]) {
    const z = zoneById[hashZone];
    player.teleport(z.x, z.z + z.r * 0.6 + 2);
  }

  // ---------------------------------------------------------- loop
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  camLook.copy(player.state.pos);
  camPos.copy(player.state.pos).add(new THREE.Vector3(0, 34, 30));
  const clock = new THREE.Clock();
  let t = 0;
  let mmTick = 0;
  let currentZone = null;
  const seen = new Map();
  const uiFont = getComputedStyle(document.documentElement).getPropertyValue("--ui");

  // Steer around trees and landmarks when driving by pointer or autopilot.
  function avoid(want) {
    const p = player.state.pos;
    let ax = 0;
    let az = 0;
    for (const c of colliders) {
      const dx = c.x - p.x;
      const dz = c.z - p.z;
      const d = Math.hypot(dx, dz);
      const reach = c.r + 5;
      if (d > reach || d < 1e-3) continue;
      const ahead = (dx * want.x + dz * want.z) / d;
      if (ahead < 0.2) continue;
      // push sideways, away from the obstacle
      const side = Math.sign(want.x * dz - want.z * dx) || 1;
      const k = (1 - d / reach) * ahead * 1.6;
      ax += -dz / d * side * k;
      az += dx / d * side * k;
    }
    if (ax || az) {
      const l = Math.hypot(want.x, want.z) || 1;
      const nx = want.x + ax;
      const nz = want.z + az;
      const nl = Math.hypot(nx, nz) || 1;
      want.x = (nx / nl) * l;
      want.z = (nz / nl) * l;
    }
  }

  function frame() {
    const dt = Math.min(0.05, clock.getDelta());
    t += rm ? dt * 0.6 : dt;

    // player
    const want = input.desire(player.state.pos);
    if (want.steered && !arcade.active) avoid(want);
    const ap = arcade.active ? arcade.update(dt) : null;
    const allColliders = arcade.active ? [{ ...zoneById.arcade, r: 2.4 }] : colliders;
    const speed = player.update(dt, arcade.paused || arcade.over ? { x: 0, z: 0 } : want, allColliders, t);
    if (speed > 22 && Math.random() < 0.3) {
      particles.burst(tmp.copy(player.state.pos).setY(player.state.pos.y - 1), pal.trace, 1, 2, 0.5);
    }

    // physics
    world.step(1 / 60, dt, 3);
    props.sync();

    // scenery
    for (const it of land.items) it.update(t, dt, { player });
    clouds.update(t);
    particles.update(dt);

    // zones and prompts
    if (!arcade.active) {
      let zone = null;
      for (const z of ZONES) if (Math.hypot(player.state.pos.x - z.x, player.state.pos.z - z.z) < z.r) zone = z.id;
      if (zone !== currentZone) {
        currentZone = zone;
        if (zone !== lastPromptClosed) lastPromptClosed = null;
      }
      ui.setPrompt(ui.openZone || zone === lastPromptClosed ? null : zone);
      // career milestones
      for (const ms of land.milestones) {
        const d = Math.hypot(player.state.pos.x - ms.pos.x, player.state.pos.z - (ms.pos.z + 4));
        if (d < 4.5 && (!seen.has(ms) || t - seen.get(ms) > 25)) {
          seen.set(ms, t);
          ui.toast(`${ms.year}: ${ms.title}`, ms.text);
          sfx.milestone();
        }
      }
    }

    // sun follows the probe so shadows stay sharp nearby
    sun.position.set(player.state.pos.x + 30, 70, player.state.pos.z + 22);
    sun.target.position.copy(player.state.pos);

    // camera
    const zoom = arcade.active ? 0.95 : input.s.zoom;
    const focus = arcade.active && ap ? tmp.copy(ap.center).lerp(player.state.pos, 0.35) : player.state.pos;
    const off = new THREE.Vector3(0, 34 * zoom, 30 * zoom);
    camLook.lerp(focus, Math.min(1, dt * 4));
    camPos.lerp(tmp.copy(camLook).add(off), Math.min(1, dt * 3));
    camera.position.copy(camPos);
    if (ap?.shake) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * ap.shake, (Math.random() - 0.5) * ap.shake, 0));
    camera.lookAt(camLook);

    // render
    if (composer) composer.render();
    else renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    if (++mmTick % 3 === 0) ui.drawMinimap(player.state, road.samples, { ...pal, ui: uiFont }, ui.openZone || currentZone);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------------------------------------------------------- intro
  const intro = document.getElementById("intro");
  document.body.classList.add("world-ready");
  if (enterBtn) {
    enterBtn.disabled = false;
    enterBtn.textContent = "Enter the world";
    enterBtn.addEventListener("click", () => {
      sound.unlock();
      intro.classList.add("leaving");
      setTimeout(() => {
        intro.hidden = true;
        document.body.classList.add("in-world");
        canvas.focus({ preventScroll: true });
        if (zoneById[hashZone]) ui.openPanel(hashZone);
        else ui.toast("Drive with arrow keys or WASD", coarse ? "Touch and hold to drive. Tap a sign to travel." : "Or hold the mouse button to drive toward the cursor.");
      }, rm ? 0 : 450);
    });
  }
}
