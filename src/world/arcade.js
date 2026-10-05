// Anomaly Hunter: anomalies rise out of the arena floor and rush the data core.
// Drive, ram and fire shockwave pulses. Blue normal points are innocent: hitting one is a
// false positive. Waves speed up, combos multiply the score, and every fourth wave brings a
// "concept drift" boss that splits when it is hit.

import * as THREE from "three";
import { zoneById, padHeight } from "./common.js";
import { sfx } from "./audio.js";

const BEST_KEY = "anomaly-hunter-best";

export function makeArcade({ scene, mats, pal, player, particles, ui, reduceMotion }) {
  const Z = zoneById.arcade;
  const H = padHeight("arcade");
  const center = new THREE.Vector3(Z.x, H, Z.z);
  const R = Z.r - 1.5;

  const geoGrunt = new THREE.IcosahedronGeometry(0.85, 0);
  const geoRunner = new THREE.OctahedronGeometry(0.65, 0);
  const geoBoss = new THREE.DodecahedronGeometry(2.1, 0);
  const geoNormal = new THREE.SphereGeometry(0.6, 12, 10);
  const matNormal = new THREE.MeshStandardMaterial({ color: pal.trace, emissive: new THREE.Color(pal.trace), emissiveIntensity: 0.5, roughness: 0.4 });

  const pulseRing = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1, 48),
    new THREE.MeshBasicMaterial({ color: pal.trace, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
  );
  pulseRing.rotation.x = -Math.PI / 2;
  pulseRing.visible = false;
  const ready = new THREE.Mesh(
    new THREE.RingGeometry(1.7, 1.95, 40, 1, 0, Math.PI * 2),
    new THREE.MeshBasicMaterial({ color: pal.trace, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
  );
  ready.rotation.x = -Math.PI / 2;
  ready.visible = false;
  scene.add(pulseRing, ready);

  let G = null; // game state
  let best = 0;
  try {
    best = Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch (e) {
    best = 0;
  }

  const enemies = [];
  const normals = [];

  function clearEntities() {
    for (const e of enemies) scene.remove(e.mesh);
    for (const n of normals) scene.remove(n.mesh);
    enemies.length = 0;
    normals.length = 0;
  }

  function spawnEnemy(kind, at) {
    const ang = Math.random() * Math.PI * 2;
    const pos = at ? at.clone() : new THREE.Vector3(center.x + Math.cos(ang) * R, H - 1.5, center.z + Math.sin(ang) * R);
    const geo = kind === "boss" ? geoBoss : kind === "runner" ? geoRunner : geoGrunt;
    const mesh = new THREE.Mesh(geo, mats.anomaly);
    mesh.castShadow = true;
    mesh.position.copy(pos);
    scene.add(mesh);
    const wave = G.wave;
    const base = 2.4 + wave * 0.45;
    enemies.push({
      kind,
      mesh,
      hp: kind === "boss" ? 6 + wave : 1,
      speed: kind === "boss" ? base * 0.45 : kind === "runner" ? base * 1.75 : base,
      rise: at ? 1 : 0,
      wobble: Math.random() * 10,
      radius: kind === "boss" ? 2.1 : kind === "runner" ? 0.7 : 0.9,
      flash: 0,
    });
  }

  function spawnNormal() {
    const ang = Math.random() * Math.PI * 2;
    const rr = 4 + Math.random() * (R - 6);
    const mesh = new THREE.Mesh(geoNormal, matNormal);
    mesh.position.set(center.x + Math.cos(ang) * rr, H + 1.1, center.z + Math.sin(ang) * rr);
    scene.add(mesh);
    normals.push({ mesh, dir: Math.random() * Math.PI * 2, t: Math.random() * 10 });
  }

  function hud() {
    ui.arcadeHud({
      score: G.score,
      wave: G.wave,
      integrity: G.integrity,
      mult: G.mult,
      best,
    });
  }

  function start() {
    clearEntities();
    G = {
      wave: 0,
      score: 0,
      integrity: 100,
      combo: 0,
      mult: 1,
      lastKill: -10,
      toSpawn: 0,
      spawnTimer: 0,
      cooldown: 0,
      pulse: null,
      t: 0,
      between: 1.2,
      over: false,
      paused: false,
      shake: 0,
      kills: 0,
      falsePositives: 0,
    };
    player.teleport(center.x, center.z + R - 3);
    player.state.bounds = { x: center.x, z: center.z, r: R };
    ready.visible = true;
    for (let i = 0; i < 4; i++) spawnNormal();
    hud();
    ui.arcadeBanner("Get ready", "Defend the data core");
  }

  function nextWave() {
    G.wave++;
    G.toSpawn = 5 + G.wave * 3;
    G.spawnTimer = 0.4;
    const bossWave = G.wave % 4 === 0;
    if (bossWave) spawnEnemy("boss");
    while (normals.length < 4 + Math.floor(G.wave / 2)) spawnNormal();
    ui.arcadeBanner(`Wave ${G.wave}`, bossWave ? "Concept drift incoming" : G.wave === 1 ? "Ram them or press Space to pulse" : "Faster now");
    bossWave ? sfx.boss() : sfx.wave();
    hud();
  }

  function fire() {
    if (!G || G.over || G.paused || G.cooldown > 0) return;
    G.cooldown = 0.5;
    G.pulse = { r: 1, hitSet: new Set() };
    pulseRing.visible = true;
    sfx.pulse();
  }

  function kill(e, viaPulse) {
    e.hp -= 1;
    e.flash = 0.12;
    if (e.hp > 0) {
      sfx.hit();
      particles.burst(e.mesh.position, pal.anomaly, 8, 7, 0.8);
      if (e.kind === "boss") {
        // Concept drift splits off new anomalies when hit.
        for (let i = 0; i < 2; i++) spawnEnemy("grunt", e.mesh.position.clone().add(new THREE.Vector3(Math.random() * 4 - 2, 0, Math.random() * 4 - 2)));
      }
      return false;
    }
    const idx = enemies.indexOf(e);
    if (idx >= 0) enemies.splice(idx, 1);
    scene.remove(e.mesh);
    particles.burst(e.mesh.position, pal.anomaly, e.kind === "boss" ? 70 : 22, e.kind === "boss" ? 14 : 9, e.kind === "boss" ? 1.6 : 1);
    sfx.hit();
    G.combo = G.t - G.lastKill < 2.2 ? G.combo + 1 : 1;
    G.lastKill = G.t;
    G.mult = Math.min(5, 1 + Math.floor(G.combo / 4));
    const pts = (e.kind === "boss" ? 1500 : e.kind === "runner" ? 150 : 100) * G.mult * (viaPulse ? 1 : 1.2);
    G.score += Math.round(pts);
    G.kills++;
    ui.arcadePop(`+${Math.round(pts)}${G.mult > 1 ? ` ×${G.mult}` : ""}`, false);
    hud();
    return true;
  }

  function falsePositive(n) {
    G.score = Math.max(0, G.score - 250);
    G.combo = 0;
    G.mult = 1;
    G.falsePositives++;
    particles.burst(n.mesh.position, pal.trace, 16, 6, 0.8);
    scene.remove(n.mesh);
    normals.splice(normals.indexOf(n), 1);
    sfx.falsePositive();
    ui.arcadePop("False positive −250", true);
    hud();
    setTimeout(() => G && !G.over && spawnNormal(), 2500);
  }

  function gameOver() {
    G.over = true;
    ready.visible = false;
    pulseRing.visible = false;
    sfx.over();
    const newBest = G.score > best;
    if (newBest) {
      best = G.score;
      try {
        localStorage.setItem(BEST_KEY, String(best));
      } catch (e) {
        /* not saved */
      }
    }
    ui.arcadeOver({ score: G.score, wave: G.wave, kills: G.kills, falsePositives: G.falsePositives, best, newBest });
  }

  function stop() {
    clearEntities();
    G = null;
    ready.visible = false;
    pulseRing.visible = false;
    player.state.bounds = null;
  }

  function update(dt) {
    if (!G || G.paused) return null;
    if (G.over) return { center, shake: 0 };
    G.t += dt;
    G.cooldown = Math.max(0, G.cooldown - dt);
    G.shake = Math.max(0, G.shake - dt * 2.5);
    const p = player.state.pos;

    // ready ring under the probe shows the pulse cooldown
    ready.position.set(p.x, H + 0.25, p.z);
    ready.material.opacity = G.cooldown > 0 ? 0.15 : 0.8;
    if (G.mult > 1 && G.t - G.lastKill > 2.2) {
      G.combo = 0;
      G.mult = 1;
      hud();
    }

    // waves
    if (G.toSpawn === 0 && enemies.length === 0) {
      G.between -= dt;
      if (G.between <= 0) {
        if (G.wave > 0) {
          const bonus = 250 * G.wave + Math.round(G.integrity * 5);
          G.score += bonus;
          ui.arcadePop(`Wave cleared +${bonus}`, false);
        }
        G.between = 2.2;
        nextWave();
      }
    } else if (G.toSpawn > 0) {
      G.spawnTimer -= dt;
      if (G.spawnTimer <= 0) {
        G.toSpawn--;
        spawnEnemy(G.wave >= 3 && Math.random() < 0.3 ? "runner" : "grunt");
        G.spawnTimer = Math.max(0.28, 1 - G.wave * 0.07) * (0.6 + Math.random() * 0.8);
      }
    }

    // pulse
    if (G.pulse) {
      G.pulse.r += dt * 26;
      pulseRing.position.set(p.x, H + 0.4, p.z);
      pulseRing.scale.setScalar(G.pulse.r);
      pulseRing.material.opacity = Math.max(0, 1 - G.pulse.r / 6.2);
      for (const e of [...enemies]) {
        if (G.pulse.hitSet.has(e)) continue;
        if (e.mesh.position.distanceTo(p) < G.pulse.r + e.radius && e.rise >= 0.6) {
          G.pulse.hitSet.add(e);
          kill(e, true);
        }
      }
      for (const n of [...normals]) {
        if (n.mesh.position.distanceTo(p) < G.pulse.r + 0.6) falsePositive(n);
      }
      if (G.pulse.r > 6.2) {
        G.pulse = null;
        pulseRing.visible = false;
      }
    }

    // enemies
    for (const e of [...enemies]) {
      const m = e.mesh;
      if (e.rise < 1) {
        e.rise = Math.min(1, e.rise + dt * 1.6);
        m.position.y = H - 1.5 + e.rise * 2.6 + (e.kind === "boss" ? 1.2 : 0);
        m.rotation.y += dt * 4;
        continue;
      }
      e.wobble += dt;
      const to = new THREE.Vector3(center.x - m.position.x, 0, center.z - m.position.z);
      const d = to.length();
      to.normalize();
      const side = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(Math.sin(e.wobble * 3) * (e.kind === "runner" ? 0.9 : 0.4));
      m.position.addScaledVector(to.add(side), e.speed * dt);
      m.position.y = H + 1.1 + (e.kind === "boss" ? 1.4 : 0) + Math.sin(e.wobble * 5) * 0.25;
      m.rotation.x += dt * 2;
      m.rotation.y += dt * 3;
      const s = e.flash > 0 ? 1.35 : 1;
      e.flash = Math.max(0, e.flash - dt);
      m.scale.setScalar(s);
      // ram
      if (e.kind !== "boss" && m.position.distanceTo(p) < e.radius + 1.3) {
        kill(e, false);
        continue;
      }
      if (e.kind === "boss" && m.position.distanceTo(p) < e.radius + 1.3) {
        player.state.vel.multiplyScalar(-0.8);
        player.state.stunned = 0.35;
      }
      if (d < 2.6) {
        G.integrity = Math.max(0, G.integrity - (e.kind === "boss" ? 35 : 10));
        enemies.splice(enemies.indexOf(e), 1);
        scene.remove(m);
        particles.burst(new THREE.Vector3(center.x, H + 3, center.z), pal.anomaly, 30, 12, 1.2);
        G.shake = reduceMotion ? 0 : 1;
        sfx.core();
        ui.arcadePop(`Core hit −${e.kind === "boss" ? 35 : 10}%`, true);
        hud();
        if (G.integrity <= 0) {
          gameOver();
          break;
        }
      }
    }

    // normals wander
    for (const n of normals) {
      n.t += dt;
      n.dir += Math.sin(n.t * 0.7) * dt;
      const mpos = n.mesh.position;
      mpos.x += Math.cos(n.dir) * dt * 2.2;
      mpos.z += Math.sin(n.dir) * dt * 2.2;
      const dx = mpos.x - center.x;
      const dz = mpos.z - center.z;
      const d = Math.hypot(dx, dz);
      if (d > R - 2 || d < 3.5) n.dir += Math.PI * 0.9;
      mpos.y = H + 1.1 + Math.sin(n.t * 2) * 0.2;
    }

    return { center, shake: G.shake };
  }

  return {
    start,
    stop,
    fire,
    update,
    get active() {
      return !!G;
    },
    get over() {
      return !!G?.over;
    },
    pause(v) {
      if (G && !G.over) G.paused = v;
    },
    get paused() {
      return !!G?.paused;
    },
    get best() {
      return best;
    },
  };
}
