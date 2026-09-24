/**
 * Deterministyczne losowanie i szum dla generatorów scen (render/).
 * Czyste funkcje — bez DOM i bez three.js (testowalne w node).
 */

export interface SceneRng {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
}

export function mulberry32(seed: number): SceneRng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick<T>(items: readonly T[]): T {
      const v = items[Math.floor(next() * items.length)];
      if (v === undefined) throw new RangeError('pick: pusta tablica');
      return v;
    },
    chance: (p) => next() < p,
  };
}

/** Szybki hash całkowity 3D → [0, 1). */
export function hash3(x: number, y: number, z: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647) + Math.imul(seed | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function hash2(x: number, z: number, seed = 0): number {
  return hash3(x, 7919, z, seed);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Szum wartości 2D (gładki), wynik w [0, 1). */
export function valueNoise2(x: number, z: number, seed = 0): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = smooth(x - x0);
  const fz = smooth(z - z0);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/** Fraktalny szum (fbm), wynik ~[0, 1]. */
export function fbm2(x: number, z: number, seed = 0, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2(x * freq, z * freq, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Wygładzanie wykładnicze niezależne od klatek: współczynnik dla dt przy „szybkości” k (1/s). */
export function damp(k: number, dt: number): number {
  return 1 - Math.exp(-k * dt);
}

/** Najkrótsza różnica kątów (radiany) w (−π, π]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}
