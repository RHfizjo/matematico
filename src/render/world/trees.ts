/**
 * Drzewa z kostek: generatory małych wolumenów (deterministyczne z ziarna), siatki przez greedyMesh (z AO).
 * Każde drzewo w scenie to osobny obiekt (wspólna geometria wariantu) — może się przyciemniać/zanikać,
 * gdy stoi między kamerą a bohaterem.
 */
import { B } from '../voxel/blocks';
import { mulberry32, type SceneRng } from '../util/rng';

export type TreeKind = 'oak' | 'birch' | 'pine' | 'blossom' | 'autumn' | 'bush' | 'bigOak' | 'fruit';

export interface TreeVolume {
  sx: number;
  sy: number;
  sz: number;
  dense: Uint8Array;
  /** Pozycja kolumny pnia (środek) w wolumenie. */
  cx: number;
  cz: number;
  /** Promień kolizji pnia. */
  collider: number;
  /** Wysokość (do testu zasłaniania). */
  height: number;
  /** Promień korony (do testu zasłaniania). */
  crown: number;
  /** Punkt obrotu/osadzenia w wolumenie (środek pnia, jednostki kostek). */
  px: number;
  pz: number;
}

class Vol {
  dense: Uint8Array;
  constructor(
    public sx: number,
    public sy: number,
    public sz: number,
  ) {
    this.dense = new Uint8Array(sx * sy * sz);
  }
  set(x: number, y: number, z: number, id: number): void {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return;
    this.dense[(y * this.sz + z) * this.sx + x] = id;
  }
  get(x: number, y: number, z: number): number {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return 0;
    return this.dense[(y * this.sz + z) * this.sx + x] ?? 0;
  }
  setIfEmpty(x: number, y: number, z: number, id: number): void {
    if (this.get(x, y, z) === 0) this.set(x, y, z, id);
  }
  /** Elipsoida liści z postrzępioną powierzchnią. */
  blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, ids: readonly number[], rng: SceneRng, rough = 0.28): void {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let z = Math.floor(cz - rz - 1); z <= Math.ceil(cz + rz + 1); z++)
        for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
          const dx = (x + 0.5 - cx) / rx;
          const dy = (y + 0.5 - cy) / ry;
          const dz = (z + 0.5 - cz) / rz;
          const d = dx * dx + dy * dy + dz * dz;
          const edge = 1 - rng.next() * rough;
          if (d < edge) {
            const id = ids[Math.floor(rng.next() * ids.length)] ?? B.leaves;
            this.setIfEmpty(x, y, z, id);
          }
        }
  }
}

function roundTree(rng: SceneRng, trunkId: number, leafIds: readonly number[], size: number): TreeVolume {
  const r = size;
  const trunkH = 3 + Math.floor(rng.next() * 2) + (size > 2.6 ? 1 : 0);
  const S = Math.ceil(r * 2 + 4);
  const sy = trunkH + Math.ceil(r * 2) + 3;
  const v = new Vol(S, sy, S);
  const c = Math.floor(S / 2);
  for (let y = 0; y < trunkH + 1; y++) v.set(c, y, c, trunkId);
  // Gałązki
  if (rng.chance(0.7)) {
    const dir = rng.int(0, 3);
    const dx = [1, -1, 0, 0][dir] ?? 0;
    const dz = [0, 0, 1, -1][dir] ?? 0;
    v.set(c + dx, trunkH - 1, c + dz, trunkId);
    v.set(c + dx * 2, trunkH, c + dz * 2, trunkId);
  }
  const cy = trunkH + r * 0.85;
  v.blob(c + 0.5, cy, c + 0.5, r, r * 0.82, r, leafIds, rng);
  // Druga, mniejsza kępa dla asymetrii.
  const ox = rng.range(-1.2, 1.2);
  const oz = rng.range(-1.2, 1.2);
  v.blob(c + 0.5 + ox, cy + r * 0.45, c + 0.5 + oz, r * 0.65, r * 0.55, r * 0.65, leafIds, rng);
  // Kilka zwisających liści.
  for (let i = 0; i < 4; i++) {
    const a = rng.range(0, Math.PI * 2);
    const x = Math.floor(c + 0.5 + Math.cos(a) * (r - 0.6));
    const z = Math.floor(c + 0.5 + Math.sin(a) * (r - 0.6));
    const yb = Math.floor(cy - r * 0.8);
    if (v.get(x, yb + 1, z)) v.setIfEmpty(x, yb, z, leafIds[0] ?? B.leaves);
  }
  return { sx: S, sy, sz: S, dense: v.dense, cx: c, cz: c, collider: 0.6, height: sy, crown: r, px: c + 0.5, pz: c + 0.5 };
}

function birch(rng: SceneRng): TreeVolume {
  const trunkH = 5 + rng.int(0, 2);
  const S = 7;
  const sy = trunkH + 5;
  const v = new Vol(S, sy, S);
  const c = 3;
  for (let y = 0; y < trunkH + 2; y++) v.set(c, y, c, B.birchLog);
  v.blob(c + 0.5, trunkH + 1.5, c + 0.5, 2.1, 2.8, 2.1, [B.leavesLight, B.leavesLight, B.leaves], rng, 0.3);
  return { sx: S, sy, sz: S, dense: v.dense, cx: c, cz: c, collider: 0.5, height: sy, crown: 2.1, px: c + 0.5, pz: c + 0.5 };
}

function pine(rng: SceneRng): TreeVolume {
  const layers = 4 + rng.int(0, 1);
  const S = 9;
  const sy = 2 + layers * 2 + 3;
  const v = new Vol(S, sy, S);
  const c = 4;
  for (let y = 0; y < sy - 2; y++) v.set(c, y, c, B.log);
  let y = 2;
  for (let l = 0; l < layers; l++) {
    const r = Math.max(1, 3 - Math.floor((l * 3) / layers));
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dz) > r + (r > 1 ? 1 : 0)) continue;
        v.setIfEmpty(c + dx, y, c + dz, B.leavesDark);
        if (Math.abs(dx) + Math.abs(dz) < r) v.setIfEmpty(c + dx, y + 1, c + dz, B.leavesDark);
      }
    y += 2;
  }
  v.set(c, y, c, B.leavesDark);
  v.set(c, y + 1, c, B.leavesDark);
  return { sx: S, sy, sz: S, dense: v.dense, cx: c, cz: c, collider: 0.6, height: sy, crown: 3, px: c + 0.5, pz: c + 0.5 };
}

function bush(rng: SceneRng): TreeVolume {
  const S = 5;
  const v = new Vol(S, 4, S);
  v.blob(2.5, 0.9, 2.5, 1.9, 1.5, 1.7, [B.leaves, B.leavesLight], rng, 0.35);
  return { sx: S, sy: 4, sz: S, dense: v.dense, cx: 2, cz: 2, collider: 1.0, height: 3, crown: 1.9, px: 2.5, pz: 2.5 };
}

function fruit(rng: SceneRng): TreeVolume {
  const t = roundTree(rng, B.log, [B.leaves, B.leavesLight], 2.3);
  // Owoce (czerwone kostki) na powierzchni korony.
  const v = new Vol(t.sx, t.sy, t.sz);
  v.dense.set(t.dense);
  for (let i = 0; i < 9; i++) {
    const x = rng.int(0, t.sx - 1);
    const z = rng.int(0, t.sz - 1);
    for (let y = t.sy - 1; y > 2; y--) {
      if (v.get(x, y, z) && !v.get(x, y - 1, z) && y < t.sy - 2) {
        v.set(x, y - 1, z, B.mushroomCap);
        break;
      }
    }
  }
  return { ...t, dense: v.dense };
}

/**
 * Stary Dąb (GDD 11): gruby pień 4×4, rozłożyste korzenie, asymetryczna korona (bardziej na północ,
 * żeby nie zasłaniać bramy od strony kamery), wnęka w korzeniach od południa (+Z) na bramę.
 */
function bigOak(rng: SceneRng): TreeVolume {
  const S = 30;
  const sy = 26;
  const v = new Vol(S, sy, S);
  const c = 15; // pień: [c-2, c+2)
  const trunkTop = 13;
  for (let y = 0; y < trunkTop; y++)
    for (let z = c - 2; z < c + 2; z++)
      for (let x = c - 2; x < c + 2; x++) {
        const corner = (x === c - 2 || x === c + 1) && (z === c - 2 || z === c + 1);
        if (corner && y > 9) continue;
        v.set(x, y, z, B.log);
      }
  // Rozszerzenie pnia u podstawy.
  for (let y = 0; y < 3; y++)
    for (let z = c - 3; z < c + 3; z++)
      for (let x = c - 3; x < c + 3; x++) {
        const edge = x === c - 3 || x === c + 2 || z === c - 3 || z === c + 2;
        if (!edge) continue;
        const corner = (x === c - 3 || x === c + 2) && (z === c - 3 || z === c + 2);
        if (corner || y > 1 - (rng.chance(0.5) ? 1 : 0)) continue;
        if (z === c + 2 && x >= c - 2 && x <= c + 1) continue; // wejście od południa
        v.set(x, y, z, B.root);
      }
  // Konary
  const branches: [number, number, number][] = [
    [-1, 0, -0.6],
    [1, 0, -0.5],
    [0.2, 0, -1],
    [-0.7, 0, 0.5],
    [0.8, 0, 0.4],
  ];
  const crownCenters: [number, number, number, number][] = [];
  for (const [bx, , bz] of branches) {
    const len = 5 + rng.range(0, 2);
    let x = c;
    let z = c;
    let y = trunkTop - 3;
    for (let s = 0; s < len; s++) {
      x += bx;
      z += bz;
      y += 0.6;
      v.set(Math.floor(x), Math.floor(y), Math.floor(z), B.log);
      v.set(Math.floor(x), Math.floor(y) + 1, Math.floor(z), B.log);
    }
    crownCenters.push([x, y + 2, z, 3.6 + rng.range(0, 1.2)]);
  }
  crownCenters.push([c, trunkTop + 5, c - 2, 5.5]);
  crownCenters.push([c - 3, trunkTop + 4, c - 5, 4.5]);
  const leaves = [B.leaves, B.leaves, B.leavesDark, B.leavesLight];
  for (const [x, y, z, r] of crownCenters) v.blob(x, y, z, r, r * 0.7, r, leaves, rng, 0.25);
  // Usuń liście, które wystają daleko na południe (strona kamery) i nisko.
  for (let y = 0; y < sy; y++)
    for (let z = 0; z < S; z++)
      for (let x = 0; x < S; x++) {
        const id = v.get(x, y, z);
        if ((id === B.leaves || id === B.leavesDark || id === B.leavesLight) && z > c + 6 && y < trunkTop + 3) v.set(x, y, z, 0);
      }
  // Wnęka na bramę od południa: cała szerokość pnia, 4 wys., ciemne tło (brama-rekwizyt stoi we wnęce).
  const zf = c + 1; // południowy rząd pnia
  for (let y = 0; y < 4; y++)
    for (let x = c - 2; x <= c + 1; x++) {
      v.set(x, y, zf, 0);
      v.set(x, y, zf - 1, B.darkPlanks);
    }
  for (let x = c - 2; x <= c + 1; x++) v.set(x, 4, zf, B.root);
  return { sx: S, sy, sz: S, dense: v.dense, cx: c, cz: c, collider: 3.0, height: sy, crown: 8, px: c, pz: c };
}

export function makeTree(kind: TreeKind, seed: number): TreeVolume {
  const rng = mulberry32(seed);
  switch (kind) {
    case 'oak':
      return roundTree(rng, B.log, [B.leaves, B.leaves, B.leavesLight], rng.range(2.2, 2.9));
    case 'autumn':
      return roundTree(rng, B.log, [B.leavesAutumn, B.leavesAutumn, B.leavesAutumn, B.leaves], rng.range(2.1, 2.7));
    case 'blossom':
      return roundTree(rng, B.log, [B.leavesPink, B.leavesPink, B.leavesPink, B.leavesLight], rng.range(2.0, 2.5));
    case 'birch':
      return birch(rng);
    case 'pine':
      return pine(rng);
    case 'bush':
      return bush(rng);
    case 'fruit':
      return fruit(rng);
    case 'bigOak':
      return bigOak(rng);
  }
}
