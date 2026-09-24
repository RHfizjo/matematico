/**
 * Łąka (GDD 13): wyspa ~96×96 z pagórkami z szumu, stawem z piaszczystym brzegiem, kwiatami, drzewami, kamieniami.
 * POI (contracts.ts): spawn, portal-base, den-plusik, den-dopelniak, den-blizniak, spot-koniczynek,
 * chest-1, chest-2, chest-3, gate-dungeon (brama w korzeniach Starego Dębu).
 */
import { B } from '../voxel/blocks';
import { clamp, fbm2, hash2 } from '../util/rng';
import { SceneBuilder } from './builder';
import type { SceneBuild } from './types';
import { FACING_CAMERA } from '../constants';

const S0 = 12;

interface Flat {
  x: number;
  z: number;
  r: number;
  h: number;
}

export function buildMeadow(seed: number): SceneBuild {
  const b = new SceneBuilder('meadow', seed);
  const R = 45;
  const pond = { x: -17, z: 9, r: 6.5 };
  const oak = { x: 0, z: -29 };
  const spawn = { x: 0.5, z: 31 };

  // Miejsca spłaszczone pod POI (wysokość względna do S0).
  const flats: Flat[] = [
    { x: oak.x, z: oak.z + 1, r: 8, h: 2 },
    { x: spawn.x, z: spawn.z + 1.5, r: 5, h: 0 },
    { x: pond.x, z: pond.z, r: pond.r + 3, h: 0 },
    { x: -31, z: -6, r: 3.5, h: 1 },
    { x: 28, z: -5, r: 4, h: 1 },
    { x: -14, z: -24, r: 3.5, h: 2 },
  ];

  // Wysokości: pagórki z szumu, potem rozluźnienie (różnica sąsiadów ≤ 1 → wszędzie da się wejść).
  const size = 104;
  const off = size / 2;
  const hm = new Float32Array(size * size);
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++) {
      const wx = x - off;
      const wz = z - off;
      let h = (fbm2(wx * 0.035, wz * 0.035, seed + 1, 4) - 0.38) * 9 + (fbm2(wx * 0.11, wz * 0.11, seed + 2, 2) - 0.5) * 1.5;
      for (const f of flats) {
        const d = Math.hypot(wx + 0.5 - f.x, wz + 0.5 - f.z);
        const t = clamp((d - f.r) / 5, 0, 1);
        h = f.h + (h - f.h) * t * t * (3 - 2 * t);
      }
      hm[z * size + x] = Math.round(clamp(h, 0, 6));
    }
  for (let pass = 0; pass < 6; pass++)
    for (let z = 1; z < size - 1; z++)
      for (let x = 1; x < size - 1; x++) {
        const i = z * size + x;
        const m = Math.min(hm[i - 1] ?? 0, hm[i + 1] ?? 0, hm[i - size] ?? 0, hm[i + size] ?? 0);
        if ((hm[i] ?? 0) > m + 1) hm[i] = m + 1;
      }
  const H = (x: number, z: number): number => S0 + (hm[(Math.floor(z) + off) * size + (Math.floor(x) + off)] ?? 0);

  const pondDist = (x: number, z: number): number => {
    const ang = Math.atan2(z + 0.5 - pond.z, x + 0.5 - pond.x);
    const wob = (fbm2(Math.cos(ang) * 1.6 + 3, Math.sin(ang) * 1.6 + 3, seed + 44, 2) - 0.5) * 3.5;
    return Math.hypot(x + 0.5 - pond.x, z + 0.5 - pond.z) - wob;
  };

  const bottom = b.island({
    cx: 0,
    cz: 0,
    radius: R,
    surface: (x, z) => H(x, z),
    top: (x, z) => {
      const pd = pondDist(x, z);
      if (pd < pond.r + 2.2) return B.sand;
      return B.grass;
    },
  });

  // ── Staw: woda (2 kostki głębokości), piaszczyste dno.
  b.disc(pond.x, pond.z, pond.r + 3, (x, z) => {
    const pd = pondDist(x, z);
    if (pd >= pond.r) return;
    const t = b.top(x, z);
    const depth = pd < pond.r - 2.5 ? 2 : 1;
    for (let k = 0; k < depth; k++) b.world.set(x, t - k, z, B.water);
    b.world.set(x, t - depth, z, B.sand);
    b.reserve(x, z, 0);
  });
  // Lilie i kamienie w stawie.
  b.world.set(Math.floor(pond.x - 3), S0 + 1 - 1, Math.floor(pond.z + 2), B.mossyStone);
  b.world.set(Math.floor(pond.x + 2), S0, Math.floor(pond.z - 3), B.mossyStone);

  // ── Ścieżka: od portalu przez łąkę do Starego Dębu.
  const pathPts: [number, number][] = [
    [spawn.x, spawn.z + 3],
    [spawn.x, spawn.z - 3],
    [5, 19],
    [3, 9],
    [-3, 0],
    [1, -10],
    [0.5, -20],
  ];
  b.path(pathPts, 2.3, B.path, [B.grass, B.sand]);
  b.path([[3, 9], [14, 12], [20, 21]], 1.8, B.path); // do skrzyni 1
  b.path([[-3, 0], [-12, -2], [-24, -5], [-29, -5]], 1.8, B.path); // do nory Plusika
  b.path([[1, -10], [12, -8], [24, -5]], 1.8, B.path); // do gniazda Bliźniaka

  // ── Spawn i portal do bazy.
  b.poi('spawn', 'spawn', spawn.x, spawn.z, 1);
  b.reserve(spawn.x, spawn.z, 2);
  const portal = { x: spawn.x - 0.2, z: spawn.z + 5 };
  b.disc(portal.x, portal.z, 2.6, (x, z) => b.setTop(x, z, B.stoneBrick, [B.grass, B.path, B.sand]));
  b.prop('prop:portal', portal.x, portal.z, { facing: 0, collider: false });
  b.poi('portal-base', 'portal', portal.x, portal.z, 2.2);
  b.light({ x: portal.x, y: H(portal.x, portal.z) + 2.5, z: portal.z, color: '#a58dff', intensity: 5, distance: 8 });
  b.reserve(portal.x, portal.z, 3);
  b.prop('prop:sign', spawn.x + 2.4, spawn.z - 2.5, { facing: FACING_CAMERA, collider: 0.4 });

  // ── Stary Dąb: pień (osobny obiekt), korzenie i kamienny łuk w terenie, brama w korzeniach.
  const oy = H(oak.x, oak.z) + 1;
  b.tree('bigOak', oak.x, oak.z, { rot: 0, reserve: 7, exact: true, y: oy });
  // Korzenie w terenie (bez sektora bramy od południa).
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + (hash2(k, 3, seed) - 0.5) * 0.4;
    const da = Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2));
    if (Math.abs(da) < 0.55) continue;
    const len = 4 + hash2(k, 9, seed) * 3;
    for (let s = 0; s < len; s += 0.4) {
      const x = Math.floor(oak.x + 0.5 + Math.cos(a) * (2.2 + s));
      const z = Math.floor(oak.z + 0.5 + Math.sin(a) * (2.2 + s));
      const h = Math.max(0, Math.round(2.4 - s * 0.6));
      const base = oy - 1;
      b.world.set(x, base, z, B.root);
      for (let y = 1; y <= h; y++) b.world.set(x, base + y, z, B.root);
    }
  }
  // Świecące grzyby i mech przy korzeniach.
  b.disc(oak.x, oak.z, 9, (x, z, d) => {
    if (d < 3) return;
    const t = b.topId(x, z);
    if (t === B.grass && hash2(x, z, seed + 61) < 0.35) b.setTop(x, z, B.moss);
    if (d > 4 && (t === B.grass || t === B.root) && hash2(z, x, seed + 62) < 0.06) {
      const y = b.top(x, z);
      b.world.set(x, y + 1, z, B.glowMushroom);
    }
  });
  const gate = { x: oak.x, z: oak.z + 1.95 };
  b.prop('prop:gate', gate.x, gate.z, { facing: 0, poi: 'gate-dungeon', collider: false });
  b.poi('gate-dungeon', 'gate', gate.x, gate.z + 2.8, 2.4);
  b.light({ x: gate.x, y: oy + 2.2, z: gate.z + 1.4, color: '#9fe8ff', intensity: 5, distance: 8 });
  b.reserve(gate.x, gate.z + 1.5, 3);
  for (const lx of [-3.1, 3.1]) {
    b.prop('prop:lantern', oak.x + lx, gate.z + 1.3, { collider: 0.35 });
  }

  // ── Nora Plusika (W): kopczyk trawy z wejściem, marchewki.
  const denP = { x: -31, z: -6 };
  b.disc(denP.x, denP.z - 1.5, 3.2, (x, z, d) => {
    const t = b.top(x, z);
    const add = d < 1.6 ? 2 : d < 2.6 ? 1 : 0;
    for (let k = 1; k <= add; k++) b.world.set(x, t + k, z, k === add ? B.grass : B.dirt);
  });
  b.prop('prop:den', denP.x + 0.5, denP.z + 1.4, { facing: 0, poi: 'den-plusik', collider: 0.8 });
  b.poi('den-plusik', 'den', denP.x + 0.5, denP.z + 3.2, 3);
  for (let i = 0; i < 7; i++) b.foliageAt('flower', denP.x + b.rng.range(-3, 3.5), denP.z + b.rng.range(2, 5), '#ff9a2e', 1.1);
  b.reserve(denP.x, denP.z, 4);

  // ── Gniazdo Dopełniaka (przy stawie): mech, omszałe kamienie, grzybki.
  const denD = { x: pond.x + pond.r + 3.5, z: pond.z + 3 };
  b.disc(denD.x, denD.z, 3, (x, z, d) => {
    b.setTop(x, z, B.moss, [B.grass, B.sand]);
    if (d > 2.2 && hash2(x, z, seed + 5) < 0.55) {
      const y = b.top(x, z);
      b.world.set(x, y + 1, z, B.mossyStone);
    }
  });
  for (let i = 0; i < 4; i++) b.foliageAt('mushroom', denD.x + b.rng.range(-2, 2), denD.z + b.rng.range(-2, 2), '#7cf0ff', 1);
  b.prop('prop:den', denD.x, denD.z - 0.4, { facing: FACING_CAMERA, poi: 'den-dopelniak', collider: 0.8 });
  b.poi('den-dopelniak', 'den', denD.x, denD.z + 1.8, 3);
  b.reserve(denD.x, denD.z, 3.5);

  // ── Gniazdo Bliźniaka (E): dwie brzozy, siano.
  const denB = { x: 28, z: -5 };
  b.tree('birch', denB.x - 2.5, denB.z - 2, { reserve: 1 });
  b.tree('birch', denB.x + 3, denB.z - 2.5, { reserve: 1 });
  b.disc(denB.x, denB.z, 2.4, (x, z) => b.setTop(x, z, B.hay, [B.grass]));
  b.prop('prop:den', denB.x, denB.z - 0.3, { facing: 0, poi: 'den-blizniak', collider: 0.8 });
  b.poi('den-blizniak', 'den', denB.x, denB.z + 2, 3);
  b.reserve(denB.x, denB.z, 3.5);

  // ── Miejsce Koniczynka (rzadki): krąg świecących grzybów, koniczyna.
  const clover = { x: -14, z: -24 };
  b.disc(clover.x, clover.z, 3.2, (x, z, d) => {
    b.setTop(x, z, d < 2.2 ? B.clover : B.moss, [B.grass, B.moss]);
    if (d > 2.4 && hash2(x, z, seed + 7) < 0.5) {
      const y = b.top(x, z);
      b.world.set(x, y + 1, z, B.glowMushroom);
    }
  });
  for (let i = 0; i < 12; i++) b.foliageAt('flower', clover.x + b.rng.range(-1.8, 1.8), clover.z + b.rng.range(-1.8, 1.8), '#ffffff', 0.8);
  b.poi('spot-koniczynek', 'rareSpot', clover.x + 0.5, clover.z + 0.5, 2.6);
  b.reserve(clover.x, clover.z, 3.6);

  // ── Skrzynie.
  const chests: [string, number, number][] = [
    ['chest-1', 20.5, 22],
    ['chest-2', -34, -22],
    ['chest-3', 31, -25],
  ];
  for (const [id, x, z] of chests) {
    b.disc(x, z, 1.8, (cx, cz) => b.setTop(cx, cz, B.gravel, [B.grass, B.sand]));
    b.prop('prop:chest', x, z, { facing: FACING_CAMERA, poi: id, collider: 0.6 });
    b.poi(id, 'chest', x, z + 1.4, 2);
    b.reserve(x, z, 2.5);
    // Kilka kamieni obok.
    for (const [ox, oz] of [
      [-1.6, -0.8],
      [1.7, -0.5],
    ] as const) {
      const y = b.top(x + ox, z + oz);
      b.world.set(Math.floor(x + ox), y + 1, Math.floor(z + oz), B.stone);
    }
  }

  // ── Kamienie (skupiska 1–2 kostek).
  const rng = b.rng;
  for (let i = 0; i < 26; i++) {
    const a = rng.range(0, Math.PI * 2);
    const rr = rng.range(6, R * 0.9);
    const x = Math.floor(Math.cos(a) * rr);
    const z = Math.floor(Math.sin(a) * rr);
    if (!b.isFree(x, z, 1.5) || b.topId(x, z) !== B.grass) continue;
    const big = rng.chance(0.45);
    const base = b.top(x, z);
    b.disc(x + 0.5, z + 0.5, big ? 1.6 : 1.1, (cx, cz, d) => {
      if (b.topId(cx, cz) === B.water || b.top(cx, cz) !== base) return;
      if (d > 0.9 && rng.chance(0.35)) return;
      const h = big && d < 0.8 ? 2 : 1;
      for (let t = 1; t <= h; t++) b.world.set(cx, base + t, cz, t === h && rng.chance(0.35) ? B.mossyStone : B.stone);
    });
    b.reserve(x, z, 1.5);
  }

  // ── Drzewa: kępy i pojedyncze.
  const kinds = ['oak', 'oak', 'oak', 'birch', 'blossom', 'pine', 'autumn', 'fruit', 'bush', 'bush'] as const;
  let placed = 0;
  for (let attempt = 0; attempt < 900 && placed < 46; attempt++) {
    const a = rng.range(0, Math.PI * 2);
    const rr = Math.sqrt(rng.next()) * R * 0.9;
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    // Gęściej przy krawędziach i w „lasku” na wschodzie.
    const grove = fbm2(x * 0.05, z * 0.05, seed + 13, 2);
    if (rng.next() > grove * 1.4 + (rr > R * 0.7 ? 0.3 : 0)) continue;
    if (!b.isFree(x, z, 2)) continue;
    if (b.topId(x, z) !== B.grass) continue;
    const kind = kinds[Math.floor(rng.next() * kinds.length)] ?? 'oak';
    b.tree(kind, x, z, { reserve: kind === 'bush' ? 1.2 : 2.2 });
    placed++;
  }

  b.scatterFoliage(-R, R, -R, R, 0.6, 0.5, [B.grass]);
  // Trzcina przy stawie.
  b.disc(pond.x, pond.z, pond.r + 2.5, (x, z) => {
    const pd = pondDist(x, z);
    if (pd > pond.r - 0.3 && pd < pond.r + 1.2 && b.topId(x, z) === B.sand && hash2(x, z, seed + 90) < 0.45) b.foliageAt('tallGrass', x + 0.5, z + 0.5, '#6fb84a', 1.3);
  });

  const bounds = { minX: -R - 2, maxX: R + 2, minZ: -R - 2, maxZ: R + 2 };
  return b.finish({
    bounds,
    spawn,
    spawnFacing: Math.PI,
    outdoor: true,
    island: { cx: 0, cz: 0, radius: R, bottomY: bottom, surfaceY: S0 + 2 },
  });
}
