// Shared helpers: terrain height, palette, deterministic random numbers.

export const WORLD_RADIUS = 118;

// Landmarks. Positions are on the XZ plane; r is the radius that counts as "inside".
export const ZONES = [
  { id: "welcome", name: "Start", sub: "About me", x: 0, z: 0, r: 11 },
  { id: "rstad", name: "RSTAD Lab", sub: "Research", x: -50, z: -38, r: 13 },
  { id: "shed", name: "Tool Shed", sub: "Skills and early projects", x: -8, z: -82, r: 11 },
  { id: "guard", name: "Guardrail Gate", sub: "mcp-guardrail and agents", x: 42, z: -54, r: 12 },
  { id: "warehouse", name: "Snapshot Warehouse", sub: "DuckDB analytical layer", x: 74, z: -8, r: 14 },
  { id: "arcade", name: "Arcade", sub: "Anomaly Hunter", x: 60, z: 46, r: 19 },
  { id: "career", name: "Career Road", sub: "Experience and education", x: 0, z: 74, r: 12 },
  { id: "audit", name: "Audit Hall", sub: "Responsible AI", x: -64, z: 34, r: 14 },
  { id: "radio", name: "Radio Tower", sub: "Contact", x: -96, z: -6, r: 10 },
];
export const zoneById = Object.fromEntries(ZONES.map((z) => [z.id, z]));

// The order the glowing signal road visits the landmarks (a loop).
export const ROAD_ORDER = ["welcome", "rstad", "shed", "guard", "warehouse", "arcade", "career", "audit", "radio", "welcome"];

const rawHeight = (x, z) =>
  1.7 * Math.sin(x * 0.045) + 1.2 * Math.sin(z * 0.06 + 1) + 0.7 * Math.sin((x + z) * 0.1) + 0.35 * Math.sin(x * 0.21 - z * 0.17);

export const smoothstep = (a, b, t) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

// Each landmark sits on a flattened pad; the terrain blends into it.
const pads = ZONES.map((z) => ({ x: z.x, z: z.z, r: z.r + (z.id === "arcade" ? 2 : 4), h: rawHeight(z.x, z.z) }));

export function terrainHeight(x, z) {
  let h = rawHeight(x, z);
  for (const p of pads) {
    const d = Math.hypot(x - p.x, z - p.z);
    const w = 1 - smoothstep(p.r, p.r + 10, d);
    if (w > 0) h = h * (1 - w) + p.h * w;
  }
  // Rise gently at the rim so the world reads as an island.
  const rim = Math.hypot(x, z);
  h += smoothstep(WORLD_RADIUS - 6, WORLD_RADIUS + 20, rim) * 14;
  return h;
}
export const padHeight = (id) => pads[ZONES.findIndex((z) => z.id === id)].h;

export function prng(seed = 1) {
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  return { rand, range: (a, b) => a + (b - a) * rand() };
}

// Colors follow the site's CSS tokens so the world matches light and dark themes.
export function palette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  const dark = cs.colorScheme?.includes("dark") || v("--paper").toLowerCase() === "#10161f";
  return {
    dark,
    paper: v("--paper") || "#eef1f4",
    sheet: v("--sheet") || "#f8f9fb",
    ink: v("--ink") || "#18202e",
    muted: v("--muted") || "#566176",
    trace: v("--trace") || "#2c6a8a",
    anomaly: v("--anomaly") || "#c8325f",
    grid: v("--grid") || "#d3d9e1",
  };
}

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
