// Deterministic 2D value noise & FBM for realistic rolling forest terrain

function hash2D(ix: number, iz: number): number {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);

  const a = hash2D(ix, iz);
  const b = hash2D(ix + 1, iz);
  const c = hash2D(ix, iz + 1);
  const d = hash2D(ix + 1, iz + 1);

  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function fbm2D(x: number, z: number, octaves = 4): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += amp * (smoothNoise(x * freq, z * freq) * 2 - 1);
    freq *= 2.04;
    amp *= 0.48;
  }
  return value;
}

export const WORLD_PLAY_RADIUS = 72;
export const TERRAIN_SIZE = 220;

/**
 * Computes exact terrain height at world (x, z).
 * Central campsite clearing (r < 12) is gently flattened for lobby & starter camp.
 * Perimeter (r > 72) rises into natural rocky wooded ridges so the forest never ends in a void.
 */
export function groundHeightAt(x: number, z: number): number {
  const dist = Math.hypot(x, z);

  // Gentle rolling hills across playable forest
  const rolling = fbm2D(x * 0.022 + 11.3, z * 0.022 - 4.7, 4) * 3.4;
  const micro = fbm2D(x * 0.11, z * 0.11, 2) * 0.25;

  // Flatten center campsite clearing smoothly
  const clearingBlend = Math.min(1, Math.max(0, (dist - 7.5) / 14));
  const smoothClearing = clearingBlend * clearingBlend * (3 - 2 * clearingBlend);

  // Natural perimeter ridge rising beyond playable radius
  let ridge = 0;
  if (dist > 64) {
    const t = Math.min(1.6, (dist - 64) / 28);
    ridge = t * t * (10.5 + fbm2D(x * 0.05, z * 0.05, 3) * 4.2);
  }

  return (rolling + micro) * smoothClearing + ridge;
}

/**
 * Estimates terrain surface normal Y & mossiness factor for vertex coloring & foliage placement.
 */
export function terrainSurfaceInfo(x: number, z: number): {
  height: number;
  slope: number;
  mossFactor: number;
  pathFactor: number;
} {
  const h = groundHeightAt(x, z);
  const eps = 0.6;
  const hx = groundHeightAt(x + eps, z);
  const hz = groundHeightAt(x, z + eps);
  const dx = (hx - h) / eps;
  const dz = (hz - h) / eps;
  const slope = Math.sqrt(dx * dx + dz * dz);

  const dist = Math.hypot(x, z);
  const n = fbm2D(x * 0.06 + 3.1, z * 0.06 + 7.9, 3);
  const mossFactor = Math.max(0, Math.min(1, 0.55 + n * 0.6 - slope * 0.45));

  // Subtle dirt trail radiating from campsite
  const angle = Math.atan2(z, x);
  const trailWave = Math.sin(angle * 2 + dist * 0.06);
  const isTrail = dist < 11 ? 1 - dist / 11 : Math.max(0, 1 - Math.abs(trailWave) * 5.2) * Math.max(0, 1 - dist / 58);

  return {
    height: h,
    slope,
    mossFactor,
    pathFactor: Math.max(0, Math.min(1, isTrail)),
  };
}
