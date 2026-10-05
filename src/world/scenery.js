// Terrain, road, ambient scenery and the landmarks. Each landmark returns its colliders and an
// update function so it can react to the probe (tilt, scatter, block particles, and so on).

import * as THREE from "three";
import * as CANNON from "cannon-es";
import { ZONES, zoneById, ROAD_ORDER, WORLD_RADIUS, terrainHeight, padHeight, prng, smoothstep } from "./common.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function makeMaterials(pal) {
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, flatShading: true, ...extra });
  return {
    ink: std(pal.ink),
    sheet: std(pal.sheet),
    paper: std(pal.paper),
    grid: std(pal.grid),
    muted: std(pal.muted),
    trace: std(pal.trace, { emissive: new THREE.Color(pal.trace), emissiveIntensity: 0.35 }),
    traceGlow: std(pal.trace, { emissive: new THREE.Color(pal.trace), emissiveIntensity: 1.2 }),
    anomaly: std(pal.anomaly, { emissive: new THREE.Color(pal.anomaly), emissiveIntensity: 0.9 }),
    duck: std("#e9b73a"),
    beak: std("#e0702c"),
    water: new THREE.MeshStandardMaterial({ color: pal.trace, transparent: true, opacity: 0.45, roughness: 0.2, metalness: 0.1 }),
    crate: std(pal.dark ? "#8a6d4a" : "#b48d5d"),
  };
}

// ---------------------------------------------------------------- terrain

export function makeTerrain(pal) {
  const size = 300;
  const seg = 150;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const lo = new THREE.Color(pal.dark ? "#1e2a39" : "#dfe5ec");
  const hi = new THREE.Color(pal.dark ? "#2b3b50" : "#c7d1dd");
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    c.copy(lo).lerp(hi, smoothstep(-3, 4, h));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true });
  const gridColor = { value: new THREE.Color(pal.dark ? "#3f5672" : "#b9c4d2") };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGrid = gridColor;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nuniform vec3 uGrid;")
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        vec2 c1 = vWPos.xz / 4.0;
        vec2 g1 = abs(fract(c1 - 0.5) - 0.5) / fwidth(c1);
        float l1 = 1.0 - min(min(g1.x, g1.y), 1.0);
        vec2 c2 = vWPos.xz / 20.0;
        vec2 g2 = abs(fract(c2 - 0.5) - 0.5) / fwidth(c2);
        float l2 = 1.0 - min(min(g2.x, g2.y), 1.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uGrid, clamp(l1 * 0.35 + l2 * 0.65, 0.0, 1.0));`
      );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = "terrain";
  return mesh;
}

// ---------------------------------------------------------------- road

export function makeRoad(mats) {
  const group = new THREE.Group();
  const samples = [];
  for (let k = 0; k < ROAD_ORDER.length - 1; k++) {
    const A = zoneById[ROAD_ORDER[k]];
    const B = zoneById[ROAD_ORDER[k + 1]];
    const dir = new THREE.Vector2(B.x - A.x, B.z - A.z).normalize();
    const nrm = new THREE.Vector2(-dir.y, dir.x);
    const a = new THREE.Vector2(A.x, A.z).addScaledVector(dir, A.r + 1.5);
    const b = new THREE.Vector2(B.x, B.z).addScaledVector(dir, -(B.r + 1.5));
    const pts = [];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = a.clone().lerp(b, t).addScaledVector(nrm, Math.sin(t * Math.PI * 2) * 3 * Math.sin(t * Math.PI));
      pts.push(V(p.x, terrainHeight(p.x, p.y) + 0.35, p.y));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.32, 6, false), mats.traceGlow);
    group.add(tube);
    for (let i = 0; i <= 40; i++) samples.push(curve.getPoint(i / 40));
  }
  return { group, samples };
}

// ---------------------------------------------------------------- ambient: trees and clouds

export function makeTrees(mats, pal, colliders) {
  const r = prng(11);
  const bars = [];
  const trees = [];
  let guard = 0;
  while (trees.length < 85 && guard++ < 4000) {
    const ang = r.rand() * Math.PI * 2;
    const rad = 16 + r.rand() * (WORLD_RADIUS - 24);
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    if (ZONES.some((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r + 9)) continue;
    if (trees.some((t) => Math.hypot(x - t.x, z - t.z) < 6)) continue;
    if (Math.abs(z - 74) < 6 && Math.abs(x) < 44) continue; // career road
    trees.push({ x, z });
  }
  for (const t of trees) {
    const n = 3 + Math.floor(r.rand() * 3);
    const y0 = terrainHeight(t.x, t.z);
    for (let i = 0; i < n; i++) {
      const h = 1.2 + r.rand() * 4.5;
      bars.push({ x: t.x + (i - (n - 1) / 2) * 0.95, z: t.z, y: y0, h, hot: r.rand() < 0.06 });
    }
    colliders.push({ x: t.x, z: t.z, r: 1.4 + n * 0.35 });
  }
  const geo = new THREE.BoxGeometry(0.8, 1, 0.8);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, bars.length);
  const m = new THREE.Matrix4();
  const cTrace = new THREE.Color(pal.trace);
  const cMuted = new THREE.Color(pal.dark ? "#3c4b5f" : "#9fb0c3");
  const cHot = new THREE.Color(pal.anomaly);
  bars.forEach((b, i) => {
    m.makeScale(1, b.h, 1).setPosition(b.x, b.y - 0.1, b.z);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, b.hot ? cHot : cMuted.clone().lerp(cTrace, Math.min(1, b.h / 6)));
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, update() {} };
}

export function makeClouds(pal) {
  const r = prng(5);
  const pts = [];
  for (let k = 0; k < 14; k++) {
    const cx = r.range(-120, 120);
    const cz = r.range(-120, 120);
    const cy = r.range(30, 40);
    const slope = r.range(-0.5, 0.5);
    for (let i = 0; i < 26; i++) {
      const dx = r.range(-9, 9);
      pts.push({ x: cx + dx, y: cy + dx * slope * 0.4 + r.range(-1.5, 1.5), z: cz + r.range(-3, 3), s: r.range(0.35, 0.8) });
    }
  }
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshBasicMaterial({ color: pal.dark ? "#56657a" : "#ffffff", transparent: true, opacity: pal.dark ? 0.55 : 0.85 });
  const mesh = new THREE.InstancedMesh(geo, mat, pts.length);
  const m = new THREE.Matrix4();
  const group = new THREE.Group();
  group.add(mesh);
  return {
    group,
    update(t) {
      pts.forEach((p, i) => {
        let x = p.x + t * 1.2;
        x = ((x + 150) % 300 + 300) % 300 - 150;
        m.makeScale(p.s, p.s, p.s).setPosition(x, p.y, p.z);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- physics props

export function makeProps(world, mats, physicsMats) {
  const props = [];
  const add = (mesh, body, zoneId) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    world.addBody(body);
    props.push({ mesh, body, home: body.position.clone(), homeQ: body.quaternion.clone(), zoneId });
  };
  // Floors: one static slab per landmark pad so props rest on flat ground.
  for (const z of ZONES) {
    const h = padHeight(z.id);
    const floor = new CANNON.Body({ mass: 0, material: physicsMats.ground });
    floor.addShape(new CANNON.Cylinder(z.r + 3, z.r + 3, 2, 24));
    floor.position.set(z.x, h - 1, z.z);
    world.addBody(floor);
  }
  // Bowling pins at the start plaza.
  {
    const z = zoneById.welcome;
    const h = padHeight("welcome");
    const pinGeo = new THREE.CylinderGeometry(0.28, 0.42, 1.6, 8);
    const rows = [[0], [-0.55, 0.55], [-1.1, 0, 1.1], [-1.65, -0.55, 0.55, 1.65]];
    rows.forEach((row, ri) =>
      row.forEach((dx) => {
        const mesh = new THREE.Mesh(pinGeo, ri === 0 ? mats.anomaly : mats.sheet);
        const body = new CANNON.Body({ mass: 0.6, material: physicsMats.prop, linearDamping: 0.2, angularDamping: 0.3 });
        body.addShape(new CANNON.Cylinder(0.28, 0.42, 1.6, 8));
        body.position.set(z.x + 6 + dx, h + 0.85, z.z - 5 - ri * 0.95);
        body.allowSleep = true;
        add(mesh, body, "welcome");
      })
    );
  }
  // Parquet crates at the warehouse.
  {
    const z = zoneById.warehouse;
    const h = padHeight("warehouse");
    const s = 1.3;
    const geo = new THREE.BoxGeometry(s, s, s);
    const layers = [3, 2, 1];
    layers.forEach((n, li) => {
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const mesh = new THREE.Mesh(geo, li === 2 ? mats.trace : mats.crate);
          const body = new CANNON.Body({ mass: 0.8, material: physicsMats.prop, linearDamping: 0.15, angularDamping: 0.2 });
          body.addShape(new CANNON.Box(new CANNON.Vec3(s / 2, s / 2, s / 2)));
          const off = (3 - n) * s * 0.5;
          body.position.set(z.x - 4 + off + i * s * 1.02, h + s / 2 + li * s * 1.01, z.z + 6 + off + j * s * 1.02);
          body.allowSleep = true;
          add(mesh, body, "warehouse");
        }
    });
  }
  // Skill blocks at the tool shed.
  {
    const z = zoneById.shed;
    const h = padHeight("shed");
    const s = 1.1;
    const geo = new THREE.BoxGeometry(s, s, s);
    for (let k = 0; k < 10; k++) {
      const mesh = new THREE.Mesh(geo, k % 3 === 0 ? mats.trace : k % 3 === 1 ? mats.sheet : mats.grid);
      const body = new CANNON.Body({ mass: 0.5, material: physicsMats.prop, linearDamping: 0.15, angularDamping: 0.2 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(s / 2, s / 2, s / 2)));
      body.position.set(z.x + 6 + (k % 2) * s, h + s / 2 + Math.floor(k / 2) * s * 1.01, z.z + 3);
      body.allowSleep = true;
      add(mesh, body, "shed");
    }
  }
  return {
    props,
    sync() {
      for (const p of props) {
        if (p.body.position.y < padHeight(p.zoneId) - 8) this.resetOne(p);
        p.mesh.position.copy(p.body.position);
        p.mesh.quaternion.copy(p.body.quaternion);
      }
    },
    resetOne(p) {
      p.body.position.copy(p.home);
      p.body.quaternion.copy(p.homeQ);
      p.body.velocity.setZero();
      p.body.angularVelocity.setZero();
      p.body.wakeUp();
    },
    reset(zoneId) {
      props.filter((p) => !zoneId || p.zoneId === zoneId).forEach((p) => this.resetOne(p));
    },
  };
}

// ---------------------------------------------------------------- landmarks

function placeAt(group, id) {
  const z = zoneById[id];
  group.position.set(z.x, padHeight(id), z.z);
  return z;
}

function pad(mats, id, extraR = 2) {
  const z = zoneById[id];
  const m = new THREE.Mesh(new THREE.CylinderGeometry(z.r + extraR, z.r + extraR + 0.6, 0.5, 40), mats.paper);
  m.position.y = -0.2;
  m.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(z.r + extraR, 0.12, 6, 64), mats.ink);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.06;
  const g = new THREE.Group();
  g.add(m, ring);
  return g;
}

const shadowy = (obj) => {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return obj;
};

export function makeLandmarks(mats, pal) {
  const items = [];
  const colliders = [];
  const col = (id, dx, dz, r) => {
    const z = zoneById[id];
    colliders.push({ x: z.x + dx, z: z.z + dz, r });
  };

  // ---- Start plaza: a signpost pointing to every landmark
  {
    const g = new THREE.Group();
    const z = placeAt(g, "welcome");
    g.add(pad(mats, "welcome"));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 7, 8), mats.ink);
    pole.position.y = 3.5;
    g.add(pole);
    ZONES.filter((o) => o.id !== "welcome").forEach((o, i) => {
      const ang = Math.atan2(o.z - z.z, o.x - z.x);
      const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.45, 0.12), i % 2 ? mats.sheet : mats.trace);
      board.geometry.translate(1.3, 0, 0);
      board.position.y = 2.2 + i * 0.6;
      board.rotation.y = -ang;
      g.add(board);
    });
    items.push({ group: shadowy(g), update() {} });
    col("welcome", 0, 0, 1);
  }

  // ---- RSTAD Lab: a Transformer tower with an orbiting memory bank
  {
    const g = new THREE.Group();
    placeAt(g, "rstad");
    g.add(pad(mats, "rstad"));
    const layers = [];
    for (let i = 0; i < 6; i++) {
      const mat = (i % 2 ? mats.sheet : mats.trace).clone();
      mat.emissive = new THREE.Color(pal.trace);
      mat.emissiveIntensity = 0;
      const b = new THREE.Mesh(new THREE.BoxGeometry(7 - i * 0.5, 0.75, 7 - i * 0.5), mat);
      b.position.y = 0.6 + i * 1.35;
      b.rotation.y = i * 0.12;
      layers.push(b);
      g.add(b);
    }
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 8.5, 8), mats.ink);
    core.position.y = 4.2;
    g.add(core);
    const N = 54;
    const bank = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.32, 0), mats.muted, N);
    const query = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), mats.anomaly);
    g.add(bank, query);
    const m = new THREE.Matrix4();
    const offs = Array.from({ length: N }, (_, i) => ({ a: (i / N) * Math.PI * 2, r: 9.5 + (i % 3) * 0.7, y: 3 + (i % 5) * 0.55 }));
    const scatter = new Float32Array(N);
    items.push({
      group: shadowy(g),
      update(t, dt, ctx) {
        layers.forEach((l, i) => (l.material.emissiveIntensity = Math.max(0, Math.sin(t * 2.6 - i * 0.7)) * 0.9));
        const lp = ctx.player.local(g);
        offs.forEach((o, i) => {
          const a = o.a + t * 0.25;
          const x = Math.cos(a) * o.r;
          const z = Math.sin(a) * o.r;
          const d = Math.hypot(lp.x - x, lp.z - z);
          scatter[i] = Math.max(scatter[i] * 0.94, d < 3 ? 1 : 0);
          m.setPosition(x * (1 + scatter[i] * 0.4), o.y + scatter[i] * 3, z * (1 + scatter[i] * 0.4));
          bank.setMatrixAt(i, m);
        });
        bank.instanceMatrix.needsUpdate = true;
        const qa = -t * 0.6;
        query.position.set(Math.cos(qa) * 7, 5 + Math.sin(t * 1.7) * 1.2, Math.sin(qa) * 7);
        query.rotation.set(t, t * 1.3, 0);
      },
    });
    col("rstad", 0, 0, 5.2);
  }

  // ---- Audit Hall: a balance scale that tilts toward the probe, six audit columns
  {
    const g = new THREE.Group();
    placeAt(g, "audit");
    g.add(pad(mats, "audit"));
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 9, 10), mats.ink);
    pillar.position.y = 4.5;
    const pivot = new THREE.Group();
    pivot.position.y = 9;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(15, 0.5, 0.6), mats.trace);
    pivot.add(beam);
    const pans = [-7, 7].map((x) => {
      const hang = new THREE.Group();
      hang.position.x = x;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 4), mats.ink);
      rod.position.y = -2;
      const panMesh = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 1.8, 0.4, 16), x < 0 ? mats.sheet : mats.anomaly);
      panMesh.position.y = -4;
      hang.add(rod, panMesh);
      pivot.add(hang);
      return hang;
    });
    g.add(pillar, pivot);
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (0.15 + (i / 5) * 0.7) + Math.PI;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 3 + i * 0.4, 8), mats.sheet);
      c.position.set(Math.cos(a) * 11.5, (3 + i * 0.4) / 2, Math.sin(a) * 11.5);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 1.3), mats.trace);
      cap.position.set(c.position.x, 3 + i * 0.4 + 0.25, c.position.z);
      g.add(c, cap);
      col("audit", c.position.x, c.position.z, 1.2);
    }
    let tilt = 0;
    items.push({
      group: shadowy(g),
      update(t, dt, ctx) {
        const lp = ctx.player.local(g);
        const near = Math.hypot(lp.x, lp.z) < 28;
        const target = near ? Math.max(-1, Math.min(1, lp.x / 10)) * -0.32 : Math.sin(t * 0.6) * 0.08;
        tilt += (target - tilt) * Math.min(1, dt * 3);
        pivot.rotation.z = tilt;
        pans.forEach((p) => (p.rotation.z = -tilt));
      },
    });
    col("audit", 0, 0, 1.6);
  }

  // ---- Guardrail Gate: data flows through; red secrets are stopped at the gate
  {
    const g = new THREE.Group();
    placeAt(g, "guard");
    g.add(pad(mats, "guard"));
    for (const x of [-5, 5]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 10, 1.4), mats.ink);
      p.position.set(x, 5, 0);
      g.add(p);
      col("guard", x, 0, 1.3);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(14, 1, 1.8), mats.trace);
    top.position.y = 10.2;
    const mid = new THREE.Mesh(new THREE.BoxGeometry(11, 0.6, 1), mats.ink);
    mid.position.y = 8.3;
    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(8.6, 7.6),
      new THREE.MeshBasicMaterial({ color: pal.trace, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
    );
    field.position.y = 4;
    g.add(top, mid, field);
    const N = 80;
    const geo = new THREE.IcosahedronGeometry(0.28, 0);
    const blue = new THREE.InstancedMesh(geo, mats.traceGlow, N);
    const red = new THREE.InstancedMesh(geo, mats.anomaly, N);
    g.add(blue, red);
    const r = prng(3);
    const parts = Array.from({ length: N }, () => ({ z: r.range(-18, 18), x: r.range(-3.6, 3.6), y: r.range(0.8, 7.2), s: r.range(4, 7), bad: r.rand() < 0.2, pop: 0 }));
    const m = new THREE.Matrix4();
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    items.push({
      group: shadowy(g),
      update(t, dt) {
        field.material.opacity = 0.12 + Math.sin(t * 4) * 0.04;
        parts.forEach((p, i) => {
          p.z += p.s * dt;
          if (p.bad && p.z > -0.2 && p.pop === 0) p.pop = 0.001;
          if (p.pop > 0) p.pop += dt;
          if (p.z > 18 || p.pop > 0.35) {
            p.z = -18;
            p.pop = 0;
            p.bad = r.rand() < 0.2;
          }
          const sc = p.pop > 0 ? 1 + p.pop * 6 : 1;
          if (p.bad) {
            red.setMatrixAt(i, p.pop > 0.3 ? hidden : m.makeScale(sc, sc, sc).setPosition(p.x, p.y, Math.min(p.z, -0.2)));
            blue.setMatrixAt(i, hidden);
          } else {
            blue.setMatrixAt(i, m.makeScale(1, 1, 1).setPosition(p.x, p.y, p.z));
            red.setMatrixAt(i, hidden);
          }
        });
        blue.instanceMatrix.needsUpdate = true;
        red.instanceMatrix.needsUpdate = true;
      },
    });
  }

  // ---- Snapshot Warehouse: a shed, a DuckDB pond and a duck
  let duck;
  {
    const g = new THREE.Group();
    placeAt(g, "warehouse");
    g.add(pad(mats, "warehouse"));
    const posts = [
      [-6, -7],
      [6, -7],
      [-6, -1],
      [6, -1],
    ];
    posts.forEach(([x, z]) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 0.5), mats.ink);
      p.position.set(x, 3, z);
      g.add(p);
      col("warehouse", x, z, 0.6);
    });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, 8.5), mats.trace);
    roof.position.set(0, 6.2, -4);
    roof.rotation.x = 0.08;
    g.add(roof);
    for (let i = 0; i < 4; i++) {
      const stack = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4 + i * 0.9, 2.4), mats.crate);
      stack.position.set(-4.2 + i * 2.8, (1.4 + i * 0.9) / 2, -5);
      g.add(stack);
    }
    const pond = new THREE.Mesh(new THREE.CircleGeometry(4.2, 28), mats.water);
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(7, 0.08, 5);
    g.add(pond);
    col("warehouse", 7, 5, 4.2);
    duck = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), mats.duck);
    body.scale.set(1.25, 0.8, 1);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), mats.duck);
    head.position.set(0.75, 0.75, 0);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 6), mats.beak);
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(1.25, 0.7, 0);
    duck.add(body, head, beak);
    duck.position.set(7, 0.4, 5);
    duck.userData.hop = 0;
    duck.name = "duck";
    g.add(duck);
    items.push({
      group: shadowy(g),
      update(t, dt) {
        const a = t * 0.5;
        duck.userData.hop = Math.max(0, duck.userData.hop - dt * 2.2);
        const hop = Math.sin(duck.userData.hop * Math.PI) * 1.4;
        duck.position.set(7 + Math.cos(a) * 2.4, 0.4 + Math.sin(t * 3) * 0.05 + hop, 5 + Math.sin(a) * 2.4);
        duck.rotation.y = -a - Math.PI / 2 + duck.userData.hop * 12;
      },
    });
  }

  // ---- Arcade: an arena with a data core
  let arena;
  {
    const g = new THREE.Group();
    const z = placeAt(g, "arcade");
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(z.r, z.r + 0.8, 0.6, 48), mats.ink);
    floor.position.y = -0.15;
    floor.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(z.r, 0.2, 8, 96), mats.anomaly);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.2;
    const inner = new THREE.Mesh(new THREE.TorusGeometry(z.r * 0.55, 0.06, 6, 80), mats.traceGlow);
    inner.rotation.x = Math.PI / 2;
    inner.position.y = 0.18;
    const coreBase = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.4, 0.8, 12), mats.sheet);
    coreBase.position.y = 0.4;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 4.5, 12), mats.traceGlow);
    core.position.y = 3;
    const halos = [0, 1, 2].map((i) => {
      const h = new THREE.Mesh(new THREE.TorusGeometry(1.8 + i * 0.4, 0.07, 6, 40), mats.traceGlow);
      h.position.y = 2 + i * 1.2;
      g.add(h);
      return h;
    });
    g.add(floor, ring, inner, coreBase, core);
    arena = { group: g, core, ring, halos };
    items.push({
      group: shadowy(g),
      update(t) {
        halos.forEach((h, i) => {
          h.rotation.x = Math.PI / 2 + Math.sin(t + i) * 0.4;
          h.rotation.y = t * (0.6 + i * 0.3);
        });
      },
    });
    col("arcade", 0, 0, 2.4);
  }

  // ---- Career Road: a road along the north edge with milestone signs
  const milestones = [
    { x: -32, year: "2019", title: "PrimeFort", text: "Frontend developer intern. React interfaces for client sites." },
    { x: -16, year: "2020", title: "Halfway", text: "Web developer. React and Next.js, 35% faster pages." },
    { x: 0, year: "2021", title: "Tata Consultancy Services", text: "Deep learning for autonomous-vehicle perception. 20% better accuracy." },
    { x: 16, year: "2024", title: "Dollar General", text: "Anomaly detection and Oracle performance for retail ordering." },
    { x: 32, year: "Now", title: "PhD in Artificial Intelligence", text: "Self-supervised anomaly detection and responsible AI.", now: true },
  ];
  {
    const g = new THREE.Group();
    const z = zoneById.career;
    g.position.set(0, 0, 0);
    const len = 84;
    const geo = new THREE.PlaneGeometry(len, 5, 84, 1);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + z.x;
      const zz = p.getZ(i) + z.z;
      p.setXYZ(i, x, terrainHeight(x, zz) + 0.1, zz);
    }
    geo.computeVertexNormals();
    const road = new THREE.Mesh(geo, mats.ink);
    road.receiveShadow = true;
    g.add(road);
    for (let x = -40; x <= 40; x += 4) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(2, 0.06, 0.3), mats.sheet);
      dash.position.set(z.x + x, terrainHeight(z.x + x, z.z) + 0.16, z.z);
      g.add(dash);
    }
    milestones.forEach((ms) => {
      const x = z.x + ms.x;
      const zz = z.z - 4;
      const y = terrainHeight(x, zz);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 4.2, 6), mats.ink);
      post.position.set(x, y + 2.1, zz);
      const board = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.6, 0.2), ms.now ? mats.anomaly : mats.trace);
      board.position.set(x, y + 4.4, zz);
      g.add(post, board);
      ms.pos = new THREE.Vector3(x, y + 5.6, zz);
      colliders.push({ x, z: zz, r: 0.5 });
    });
    items.push({ group: shadowy(g), update() {} });
  }

  // ---- Tool Shed
  {
    const g = new THREE.Group();
    placeAt(g, "shed");
    g.add(pad(mats, "shed"));
    const house = new THREE.Mesh(new THREE.BoxGeometry(7, 4.2, 5.5), mats.sheet);
    house.position.set(-1, 2.1, -1.5);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 6.2, 3), mats.trace);
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.scale.set(1, 1, 0.62);
    roof.position.set(-1, 5.4, -1.5);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.8, 0.1), mats.ink);
    door.position.set(-1, 1.4, 1.27);
    g.add(house, roof, door);
    items.push({ group: shadowy(g), update() {} });
    col("shed", -1, -1.5, 4.4);
  }

  // ---- Radio Tower: blinking light and expanding rings
  {
    const g = new THREE.Group();
    placeAt(g, "radio");
    g.add(pad(mats, "radio"));
    const H = 17;
    for (const [x, z] of [
      [-1.8, -1.8],
      [1.8, -1.8],
      [-1.8, 1.8],
      [1.8, 1.8],
    ]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, H, 5), mats.ink);
      leg.position.set(x / 2, H / 2, z / 2);
      leg.rotation.set((-z / 1.8) * 0.1, 0, (x / 1.8) * 0.1);
      g.add(leg);
    }
    for (let i = 1; i < 6; i++) {
      const s = 3.6 * (1 - i / 7);
      const brace = new THREE.Mesh(new THREE.TorusGeometry(s * 0.72, 0.07, 4, 4), mats.trace);
      brace.rotation.x = Math.PI / 2;
      brace.rotation.z = Math.PI / 4;
      brace.position.y = (i / 6) * H;
      g.add(brace);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), mats.anomaly.clone());
    lamp.position.y = H + 0.4;
    g.add(lamp);
    const rings = [0, 1, 2].map(() => {
      const r = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.06, 4, 48),
        new THREE.MeshBasicMaterial({ color: pal.trace, transparent: true, opacity: 0.6, depthWrite: false })
      );
      r.rotation.x = Math.PI / 2;
      r.position.y = H + 0.4;
      g.add(r);
      return r;
    });
    items.push({
      group: shadowy(g),
      update(t) {
        lamp.material.emissiveIntensity = 0.3 + (Math.sin(t * 5) > 0.3 ? 1.6 : 0);
        rings.forEach((r, i) => {
          const k = ((t * 0.5 + i / 3) % 1 + 1) % 1;
          r.scale.setScalar(1 + k * 14);
          r.material.opacity = (1 - k) * 0.55;
        });
      },
    });
    col("radio", 0, 0, 2.6);
  }

  return { items, colliders, duck, arena, milestones };
}
