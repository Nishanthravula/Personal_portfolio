// The probe you drive, and the input that steers it: keyboard, hold-to-drive pointer, autopilot.

import * as THREE from "three";
import * as CANNON from "cannon-es";
import { terrainHeight, WORLD_RADIUS } from "./common.js";

export function makePlayer(scene, world, mats, pal, physicsMats) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mats.sheet);
  body.castShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.14, 8, 32), mats.traceGlow);
  ring.rotation.x = Math.PI / 2;
  const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 10), mats.ink);
  eye.rotation.z = Math.PI / 2;
  eye.position.set(0.95, 0.15, 0);
  const shadowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 24),
    new THREE.MeshBasicMaterial({ color: pal.trace, transparent: true, opacity: 0.25, depthWrite: false })
  );
  shadowDisc.rotation.x = -Math.PI / 2;
  g.add(body, ring, eye);
  scene.add(g, shadowDisc);

  // Trail: the probe plots its own path as a line, like a time series.
  const TRAIL = 70;
  const trailPos = new Float32Array(TRAIL * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: pal.trace, transparent: true, opacity: 0.7 }));
  trail.frustumCulled = false;
  scene.add(trail);

  // Kinematic physics body so the probe can knock props over.
  const kin = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: physicsMats.player });
  kin.addShape(new CANNON.Sphere(1.2));
  world.addBody(kin);

  const state = {
    pos: new THREE.Vector3(0, terrainHeight(0, 6) + 1.2, 6),
    vel: new THREE.Vector3(),
    heading: -Math.PI / 2,
    bounds: null, // { x, z, r } when confined (arcade)
    stunned: 0,
  };
  for (let i = 0; i < TRAIL; i++) trailPos.set([state.pos.x, state.pos.y - 0.6, state.pos.z], i * 3);

  const tmp = new THREE.Vector3();

  function update(dt, desire, colliders, t) {
    // desire: { x, z } direction (length 0..1) and boost flag
    const maxSpeed = desire.boost ? 34 : 17;
    const accel = desire.boost ? 70 : 46;
    const target = tmp.set(desire.x, 0, desire.z).multiplyScalar(maxSpeed);
    const k = state.stunned > 0 ? 0.2 : 1;
    state.stunned = Math.max(0, state.stunned - dt);
    const dv = target.sub(new THREE.Vector3(state.vel.x, 0, state.vel.z));
    const maxDv = accel * dt * k;
    if (dv.length() > maxDv) dv.setLength(maxDv);
    state.vel.x += dv.x;
    state.vel.z += dv.z;
    if (desire.x === 0 && desire.z === 0) state.vel.multiplyScalar(Math.pow(0.02, dt));

    state.pos.x += state.vel.x * dt;
    state.pos.z += state.vel.z * dt;

    // Static colliders and the edge of the world (or arena).
    for (const c of colliders) {
      const dx = state.pos.x - c.x;
      const dz = state.pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + 1.2;
      if (d < min && d > 1e-4) {
        state.pos.x = c.x + (dx / d) * min;
        state.pos.z = c.z + (dz / d) * min;
        const n = new THREE.Vector3(dx / d, 0, dz / d);
        const vn = state.vel.dot(n);
        if (vn < 0) state.vel.addScaledVector(n, -vn * 1.4);
      }
    }
    const B = state.bounds || { x: 0, z: 0, r: WORLD_RADIUS - 6 };
    const dx = state.pos.x - B.x;
    const dz = state.pos.z - B.z;
    const d = Math.hypot(dx, dz);
    if (d > B.r) {
      state.pos.x = B.x + (dx / d) * B.r;
      state.pos.z = B.z + (dz / d) * B.r;
      state.vel.multiplyScalar(0.5);
    }

    const ground = terrainHeight(state.pos.x, state.pos.z);
    state.pos.y = ground + 1.25 + Math.sin(t * 3) * 0.12;

    const speed = Math.hypot(state.vel.x, state.vel.z);
    if (speed > 0.5) {
      const want = Math.atan2(-state.vel.z, state.vel.x);
      let diff = want - state.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      state.heading += diff * Math.min(1, dt * 10);
    }
    g.position.copy(state.pos);
    g.rotation.set(0, state.heading, 0);
    body.rotation.z -= speed * dt * 0.8;
    ring.rotation.z += dt * (2 + speed * 0.2);
    ring.rotation.x = Math.PI / 2 + Math.sin(t * 2) * 0.15;
    shadowDisc.position.set(state.pos.x, ground + 0.12, state.pos.z);

    kin.position.set(state.pos.x, state.pos.y, state.pos.z);
    kin.velocity.set(state.vel.x, 0, state.vel.z);

    // Trail
    trailPos.copyWithin(3, 0, (TRAIL - 1) * 3);
    trailPos[0] = state.pos.x;
    trailPos[1] = ground + 0.45 + Math.min(3, speed * 0.08);
    trailPos[2] = state.pos.z;
    trailGeo.attributes.position.needsUpdate = true;
    return speed;
  }

  return {
    state,
    group: g,
    update,
    local: (obj) => ({ x: state.pos.x - obj.position.x, z: state.pos.z - obj.position.z }),
    teleport(x, z) {
      state.pos.set(x, terrainHeight(x, z) + 1.25, z);
      state.vel.set(0, 0, 0);
      for (let i = 0; i < TRAIL; i++) trailPos.set([x, state.pos.y - 0.6, z], i * 3);
      trailGeo.attributes.position.needsUpdate = true;
    },
    setColors(p) {
      trail.material.color.set(p.trace);
      shadowDisc.material.color.set(p.trace);
    },
  };
}

// ---------------------------------------------------------------- input

export function makeInput(canvas, camera, terrain) {
  const keys = new Set();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const s = {
    enabled: true,
    pointerHeld: false,
    pointerTarget: null, // THREE.Vector3 while holding
    autopilot: null, // { x, z, stop, onArrive }
    zoom: 1,
    onFire: null,
    onClickObject: null, // (event) => bool, for clickable things like the duck
    clickables: [],
  };

  const isTyping = () => /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(document.activeElement?.tagName) && document.activeElement !== canvas;

  window.addEventListener("keydown", (e) => {
    if (isTyping() || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", "shift"].includes(k)) {
      if (!s.enabled) return;
      keys.add(k);
      s.autopilot = null;
      if (k.startsWith("arrow")) e.preventDefault();
    }
    if ((k === " " || k === "f") && s.onFire) {
      e.preventDefault();
      s.onFire();
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => keys.clear());

  function groundPoint(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(terrain, false)[0];
    return hit ? hit.point : null;
  }
  function hitClickable(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    for (const c of s.clickables) if (raycaster.intersectObject(c.object, true).length) return c;
    return null;
  }

  const pointers = new Map();
  let pinchStart = 0;
  let pinchZoom = 1;
  canvas.addEventListener("pointerdown", (e) => {
    if (!s.enabled) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      pinchZoom = s.zoom;
      s.pointerHeld = false;
      return;
    }
    if (e.button === 2 && s.onFire) {
      s.onFire();
      return;
    }
    const c = hitClickable(e.clientX, e.clientY);
    if (c) {
      c.onClick();
      return;
    }
    s.autopilot = null;
    s.pointerHeld = true;
    s.pointerTarget = groundPoint(e.clientX, e.clientY);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart) s.zoom = Math.min(1.6, Math.max(0.55, pinchZoom * (pinchStart / d)));
      return;
    }
    if (s.pointerHeld) s.pointerTarget = groundPoint(e.clientX, e.clientY) || s.pointerTarget;
  });
  const release = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = 0;
    if (pointers.size === 0) {
      s.pointerHeld = false;
      // A quick tap keeps driving to that spot.
      if (s.pointerTarget) s.autopilot = { x: s.pointerTarget.x, z: s.pointerTarget.z, stop: 1.5 };
      s.pointerTarget = null;
    }
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      s.zoom = Math.min(1.6, Math.max(0.55, s.zoom * (1 + Math.sign(e.deltaY) * 0.08)));
    },
    { passive: false }
  );

  // Turn the current input into a direction for the probe.
  function desire(pos) {
    const out = { x: 0, z: 0, boost: keys.has("shift") };
    if (!s.enabled) return out;
    let kx = 0;
    let kz = 0;
    if (keys.has("arrowup") || keys.has("w")) kz -= 1;
    if (keys.has("arrowdown") || keys.has("s")) kz += 1;
    if (keys.has("arrowleft") || keys.has("a")) kx -= 1;
    if (keys.has("arrowright") || keys.has("d")) kx += 1;
    if (kx || kz) {
      const l = Math.hypot(kx, kz);
      out.x = kx / l;
      out.z = kz / l;
      return out;
    }
    const target = s.pointerHeld && s.pointerTarget ? s.pointerTarget : s.autopilot;
    if (target) {
      out.steered = true;
      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const d = Math.hypot(dx, dz);
      const stop = s.autopilot && target === s.autopilot ? s.autopilot.stop : 1.2;
      if (d > stop) {
        const slow = Math.min(1, d / 8);
        out.x = (dx / d) * slow;
        out.z = (dz / d) * slow;
        out.boost = !!(s.autopilot && target === s.autopilot && s.autopilot.boost && d > 14);
      } else if (s.autopilot && target === s.autopilot) {
        const done = s.autopilot.onArrive;
        s.autopilot = null;
        done?.();
      }
    }
    return out;
  }

  return { s, desire, keys, groundPoint };
}

// ---------------------------------------------------------------- particles

export function makeParticles(scene) {
  const N = 400;
  const geo = new THREE.TetrahedronGeometry(0.28, 0);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: false });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const parts = Array.from({ length: N }, () => ({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 1 }));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    mesh.setMatrixAt(i, m.makeScale(0, 0, 0));
    mesh.setColorAt(i, col.set("#ffffff"));
  }
  scene.add(mesh);
  let next = 0;
  return {
    burst(pos, color, count = 24, speed = 9, size = 1) {
      col.set(color);
      for (let k = 0; k < count; k++) {
        const pt = parts[next];
        const idx = next;
        next = (next + 1) % N;
        pt.life = pt.max = 0.6 + Math.random() * 0.5;
        pt.p.copy(pos);
        pt.v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
        pt.s = size * (0.6 + Math.random() * 0.8);
        mesh.setColorAt(idx, col);
      }
      mesh.instanceColor.needsUpdate = true;
    },
    update(dt) {
      for (let i = 0; i < N; i++) {
        const pt = parts[i];
        if (pt.life <= 0) continue;
        pt.life -= dt;
        pt.v.y -= 22 * dt;
        pt.p.addScaledVector(pt.v, dt);
        const k = Math.max(0, pt.life / pt.max) * pt.s;
        e.set(pt.life * 9, pt.life * 7, 0);
        q.setFromEuler(e);
        mesh.setMatrixAt(i, m.compose(pt.p, q, sc.set(k, k, k)));
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
