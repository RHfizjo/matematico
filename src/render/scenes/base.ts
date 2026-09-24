/**
 * Baza (GDD 9.1): przytulna wyspa-obozowisko ~48×48. Stacje (POI o stałych id — contracts.ts):
 * spawn, portal-meadow, station-zagroda, station-skarbiec, station-kuznia, station-galeria, station-tablica,
 * station-karty, pen-center, glam-0 … glam-7.
 *
 * Układ (x: zachód→wschód, z: północ→południe; kamera patrzy z południa):
 *   północ: Skarbiec (NW) · Galeria (N) · Kuźnia (NE)   — budynki przy krawędzi, nikt nie chowa się za nimi
 *   środek: plac z ogniskiem; zachód: Tablica Wypraw; wschód: Zagroda
 *   południe: portal na Łąkę (SW), stół z kartami + Kartonini (SE), spawn
 */
import { B } from '../voxel/blocks';
import { fbm2, hash2 } from '../util/rng';
import { SceneBuilder, fence } from './builder';
import type { SceneBuild } from './types';
import { FACING_CAMERA } from '../constants';

const S = 12; // wysokość wierzchu (y najwyższej kostki)

function hut(b: SceneBuilder, x0: number, z0: number, x1: number, z1: number, doorX: number): void {
  const y0 = S + 1;
  const h = 3;
  for (let y = y0; y < y0 + h; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
        b.world.set(x, y, z, corner ? B.log : y === y0 ? B.cobble : B.planks);
      }
  // Drzwi (wnęka) i okna (ciepłe światło — w nocy świecą).
  b.world.set(doorX, y0, z1, 0);
  b.world.set(doorX, y0 + 1, z1, 0);
  b.world.set(doorX, y0, z1 - 1, B.darkPlanks);
  b.world.set(doorX, y0 + 1, z1 - 1, B.darkPlanks);
  b.world.set(doorX - 2, y0 + 1, z1, B.lanternGlow);
  b.world.set(doorX + 2, y0 + 1, z1, B.lanternGlow);
  b.world.set(x0, y0 + 1, Math.floor((z0 + z1) / 2), B.lanternGlow);
  // Dach schodkowy z okapem.
  let lx0 = x0 - 1;
  let lx1 = x1 + 1;
  let lz0 = z0 - 1;
  let lz1 = z1 + 1;
  let y = y0 + h;
  while (lx0 <= lx1 && lz0 <= lz1) {
    for (let z = lz0; z <= lz1; z++) for (let x = lx0; x <= lx1; x++) b.world.set(x, y, z, B.roof);
    lx0++;
    lx1--;
    lz0++;
    lz1--;
    y++;
  }
  // Złote akcenty (skarbiec!) nad drzwiami.
  b.world.set(doorX, y0 + 2, z1, B.gold);
  for (let z = z0 - 2; z <= z1; z++) for (let x = x0 - 1; x <= x1 + 1; x++) b.block(x, z);
}

function forge(b: SceneBuilder, x0: number, z0: number, x1: number, z1: number): void {
  const y0 = S + 1;
  // Tylna ściana i boki z cegły kamiennej, otwarty front (od kamery).
  for (let y = y0; y < y0 + 3; y++) {
    for (let x = x0; x <= x1; x++) b.world.set(x, y, z0, B.stoneBrick);
    for (let z = z0; z <= z0 + 2; z++) {
      b.world.set(x0, y, z, B.stoneBrick);
      b.world.set(x1, y, z, B.stoneBrick);
    }
  }
  // Palenisko z żarem.
  const fx = x0 + 2;
  for (let x = fx; x <= fx + 2; x++) {
    b.world.set(x, y0, z0 + 1, B.cobble);
    b.world.set(x, y0 + 1, z0 + 1, B.cobble);
  }
  b.world.set(fx + 1, y0 + 1, z0 + 1, B.embers);
  b.world.set(fx + 1, y0, z0 + 1, B.embers);
  // Komin.
  for (let y = y0 + 2; y < y0 + 7; y++) {
    b.world.set(fx + 1, y, z0, B.cobble);
    b.world.set(fx + 1, y, z0 + 1, y > y0 + 2 ? B.cobble : B.stoneBrick);
  }
  // Daszek na słupach.
  for (let z = z0; z <= z0 + 3; z++) for (let x = x0 - 1; x <= x1 + 1; x++) if (!(x === fx + 1 && z <= z0 + 1)) b.world.set(x, y0 + 3, z, B.darkPlanks);
  for (const x of [x0, x1]) for (let y = y0; y < y0 + 3; y++) b.world.set(x, y, z0 + 3, B.log);
  for (let z = z0 - 2; z <= z0 + 2; z++) for (let x = x0 - 1; x <= x1 + 1; x++) b.block(x, z);
  b.block(x0, z0 + 3);
  b.block(x1, z0 + 3);
  // Beczka z wodą i skrzynka węgla.
  b.world.set(x1 + 1, y0, z0 + 4, B.darkPlanks);
  b.light({ x: fx + 1.5, y: y0 + 1.5, z: z0 + 2.4, color: '#ff9a4a', intensity: 6, distance: 7, flicker: true });
}

function cardTable(b: SceneBuilder, cx: number, cz: number): void {
  const y = S + 1;
  const x0 = cx - 2;
  const x1 = cx + 2;
  const z0 = cz - 0.6;
  const z1 = cz + 0.6;
  // Nogi, blat, obrus.
  for (const [lx, lz] of [
    [x0 + 0.15, z0 + 0.1],
    [x1 - 0.35, z0 + 0.1],
    [x0 + 0.15, z1 - 0.3],
    [x1 - 0.35, z1 - 0.3],
  ] as const)
    b.box([lx, y, lz], [lx + 0.2, y + 0.85, lz + 0.2], B.darkPlanks);
  b.box([x0, y + 0.85, z0], [x1, y + 1.0, z1], B.planks);
  b.box([x0 + 0.3, y + 1.0, z0 - 0.02], [x1 - 0.3, y + 1.02, z1 + 0.02], B.cloth, true);
  b.box([x0 + 0.3, y + 0.7, z1 + 0.0], [x1 - 0.3, y + 1.0, z1 + 0.02], B.cloth, true);
  // Karty na stole (stosiki i rozłożone).
  const cards: [number, number, number, number][] = [
    [x0 + 0.6, z0 + 0.3, 3, B.gold],
    [x0 + 1.3, z0 + 0.35, 1, B.clothPink],
    [x0 + 1.75, z0 + 0.32, 1, B.crystal],
    [x0 + 2.2, z0 + 0.36, 1, B.leavesLight],
    [x1 - 0.9, z0 + 0.3, 5, B.quartz],
  ];
  for (const [x, z, n, id] of cards) b.box([x, y + 1.02, z], [x + 0.36, y + 1.02 + 0.03 * n, z + 0.5], id, true);
  for (let x = Math.floor(x0); x <= Math.floor(x1); x++) b.block(x, Math.floor(cz));
  // Szyld nad stołem: dwa słupki i daszek w paski.
  for (const px of [x0 - 0.1, x1 - 0.15]) b.box([px, y, z0 - 0.9], [px + 0.25, y + 2.6, z0 - 0.65], B.log);
  for (let i = 0; i < 6; i++) {
    const sx = x0 - 0.2 + (i * (x1 - x0 + 0.4)) / 6;
    b.box([sx, y + 2.6, z0 - 1.2], [sx + (x1 - x0 + 0.4) / 6, y + 2.8, z1 + 0.2], i % 2 === 0 ? B.cloth : B.quartz, false);
  }
  b.block(Math.floor(x0 - 0.1), Math.floor(z0 - 0.9));
  b.block(Math.floor(x1 - 0.15), Math.floor(z0 - 0.9));
}

export function buildBase(seed: number): SceneBuild {
  const b = new SceneBuilder('base', seed);
  const R = 22.5;
  const bottom = b.island({
    cx: 0,
    cz: 0,
    radius: R,
    surface: (x, z, d) => {
      // Płasko w środku, delikatne pagórki przy brzegach.
      const n = fbm2(x * 0.15, z * 0.15, seed + 3, 3);
      return S + (d > 0.72 && n > 0.55 ? 1 : 0) + (d > 0.85 && n > 0.68 ? 1 : 0);
    },
  });

  // ── Plac z ogniskiem i spawn.
  const plaza = { x: 0, z: 3 };
  b.disc(plaza.x, plaza.z, 4.2, (x, z, d) => b.setTop(x, z, d < 3.4 ? B.path : hash2(x, z, seed) < 0.5 ? B.path : B.grass));
  b.prop('prop:campfire', plaza.x, plaza.z, { collider: 0.9 });
  b.light({ x: plaza.x, y: S + 2, z: plaza.z, color: '#ffa04a', intensity: 8, distance: 9, flicker: true });
  // Pieńki do siedzenia.
  for (const [ox, oz] of [
    [-2.3, -0.6],
    [2.2, -0.9],
    [-1.4, 2.1],
  ] as const) {
    b.box([plaza.x + ox - 0.35, S + 1, plaza.z + oz - 0.35], [plaza.x + ox + 0.35, S + 1.45, plaza.z + oz + 0.35], B.log);
    b.block(plaza.x + ox, plaza.z + oz);
  }
  b.reserve(plaza.x, plaza.z, 4.5);
  const spawn = { x: 0.5, z: 9 };
  b.poi('spawn', 'spawn', spawn.x, spawn.z, 1);
  b.reserve(spawn.x, spawn.z, 1.5);

  // ── Ścieżki.
  b.path([[0, 7], [0, 16]], 2.4);
  b.path([[0, 3], [-6, 1], [-11, 2.5]], 2.2); // do Tablicy
  b.path([[0, 3], [5, 2], [8.5, 2]], 2.2); // do Zagrody
  b.path([[0, 0], [0, -6.5]], 2.4); // do Galerii
  b.path([[-2, -1], [-7, -5], [-12, -8.5]], 2.2); // do Skarbca
  b.path([[2, -1], [7, -5], [12, -7.5]], 2.2); // do Kuźni
  b.path([[-1, 9], [-6, 11], [-9, 13]], 2.2); // do portalu
  b.path([[1, 9], [5, 11.5], [8, 14]], 2.2); // do stołu z kartami

  // ── Galeria Brainglamów (N): pierścień z kwarcu, podium w środku, 8 miejsc wokół.
  const G = { x: 0.5, z: -11.5 };
  b.disc(G.x, G.z, 6.2, (x, z, d) => {
    if (d > 5.4) b.setTop(x, z, B.flowerBed);
    else if (d > 4.7 || d < 1.8) b.setTop(x, z, B.quartz);
    else b.setTop(x, z, B.planks);
  });
  b.reserve(G.x, G.z, 6.3);
  b.prop('prop:podium', G.x, G.z, { collider: 1.4 });
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 2 + (i / 8) * Math.PI * 2;
    const px = G.x + Math.cos(a) * 3.6;
    const pz = G.z + Math.sin(a) * 3.6;
    b.poi(`glam-${i}`, 'glamSpot', px, pz, 1.2);
    b.setTop(px, pz, B.clothPink);
  }
  // Kwiaty wokół galerii.
  b.disc(G.x, G.z, 6.3, (x, z, d) => {
    if (d > 5.4 && hash2(x, z, seed + 8) < 0.8) b.foliageAt('flower', x + 0.5, z + 0.5, ['#ff7eb6', '#ffd23f', '#fff4f0', '#c59bff'][Math.floor(hash2(z, x, seed) * 4)] ?? '#fff', 1);
  });
  b.poi('station-galeria', 'station', G.x, G.z + 6.3, 2.2);

  // ── Skarbiec (NW).
  hut(b, -16, -16, -10, -11, -13);
  b.prop('prop:treasury', -13 + 0.5, -9.2, { facing: 0, collider: 0.8 });
  b.poi('station-skarbiec', 'station', -12.5, -7.8, 2.2);
  b.reserve(-13, -9, 2.5);

  // ── Kuźnia (NE).
  forge(b, 9, -16, 15, -12);
  b.prop('prop:anvil', 12.5, -8.6, { facing: 0, collider: 0.7 });
  b.poi('station-kuznia', 'station', 12.5, -7.2, 2.2);
  b.reserve(12.5, -9, 2.5);

  // ── Tablica Wypraw (W).
  b.prop('prop:board', -12.5, 1.6, { facing: 0.35, collider: 0.9 });
  b.poi('station-tablica', 'station', -11.5, 3.6, 2.2);
  b.reserve(-12, 2.5, 2.2);

  // ── Zagroda (E): płot z furtką od zachodu, siano, poidło.
  const px0 = 8;
  const px1 = 19;
  const pz0 = -4;
  const pz1 = 7;
  fence(b, px0, pz0, px1, pz0, S + 1);
  fence(b, px0, pz1, px1, pz1, S + 1);
  fence(b, px1, pz0, px1, pz1, S + 1);
  fence(b, px0, pz0, px0, pz1, S + 1, [[5, 7]]);
  for (let z = pz0; z <= pz1; z++) for (let x = px0; x <= px1; x++) b.reserve(x, z, 0);
  b.world.set(18, S + 1, -3, B.hay);
  b.world.set(17, S + 1, -3, B.hay);
  b.world.set(18, S + 2, -3, B.hay);
  b.world.set(18, S + 1, -2, B.hay);
  b.box([15.2, S + 1, 5.3], [18.2, S + 1.5, 6.3], B.darkPlanks);
  b.box([15.35, S + 1.3, 5.45], [18.05, S + 1.46, 6.15], B.water, true);
  for (let x = 15; x <= 18; x++) b.block(x, 5), b.block(x, 6);
  b.block(17, -3);
  b.block(18, -2);
  const pen = { x: 13.5, z: 1.5 };
  b.poi('pen-center', 'penCenter', pen.x, pen.z, 4.5);
  b.poi('station-zagroda', 'station', px0 - 1.2, 2.5, 2.2);
  // Trawa i marchewki w zagrodzie.
  for (let i = 0; i < 10; i++) b.foliageAt('flower', b.rng.range(px0 + 1.5, px1 - 1), b.rng.range(pz0 + 1.5, pz1 - 1), '#ffb347', 0.9);

  // ── Portal na Łąkę (SW) z kryształami.
  const portal = { x: -10.5, z: 14 };
  b.disc(portal.x, portal.z, 3, (x, z) => b.setTop(x, z, B.stoneBrick));
  b.prop('prop:portal', portal.x, portal.z - 0.6, { facing: FACING_CAMERA * 0.5, collider: false });
  b.poi('portal-meadow', 'portal', portal.x, portal.z, 2.2);
  for (const [ox, oz, col] of [
    [-2.6, -1, '#a58dff'],
    [2.4, -1.4, '#7fe3ff'],
    [-2, 1.8, '#ff9ee0'],
    [2.2, 1.5, '#a58dff'],
  ] as const)
    for (let k = 0; k < 4; k++) b.foliageAt('crystal', portal.x + ox + b.rng.range(-0.5, 0.5), portal.z + oz + b.rng.range(-0.5, 0.5), col, b.rng.range(0.9, 1.6));
  b.light({ x: portal.x, y: S + 2.5, z: portal.z - 0.5, color: '#a58dff', intensity: 5, distance: 8 });
  b.reserve(portal.x, portal.z, 3.2);

  // ── Stół z kartami + Handlarz Kartonini (SE).
  const table = { x: 10, z: 13 };
  cardTable(b, table.x, table.z);
  // Kartonini stoi obok stołu (od strony kamery widać go w całości).
  b.prop('npc:kartonini', table.x + 3.1, table.z + 0.3, { facing: FACING_CAMERA - 0.5, poi: 'station-karty', collider: 0.6 });
  b.poi('station-karty', 'station', table.x + 0.8, table.z + 2.2, 2.4);
  b.reserve(table.x, table.z, 3.2);

  // ── Latarnie i drogowskaz.
  for (const [lx, lz] of [
    [-3.2, -3.5],
    [3.6, -3.4],
    [-5.5, 8.2],
    [5.8, 8.6],
  ] as const) {
    b.prop('prop:lantern', lx, lz, { collider: 0.35 });
    b.light({ x: lx, y: S + 2.3, z: lz, color: '#ffc46b', intensity: 4, distance: 6 });
  }
  b.prop('prop:sign', 2.6, 12.5, { facing: FACING_CAMERA, collider: 0.4 });

  // ── Drzewa: wzdłuż krawędzi i w kępach (nie na ścieżkach i stacjach).
  const treeKinds = ['oak', 'oak', 'blossom', 'birch', 'fruit', 'autumn', 'pine', 'bush', 'bush'] as const;
  const rng = b.rng;
  let placed = 0;
  // Stacje z zapasem — drzewa tylko na obrzeżach, nie między stacjami a kamerą.
  for (const id of ['station-zagroda', 'station-skarbiec', 'station-kuznia', 'station-galeria', 'station-tablica', 'station-karty', 'portal-meadow']) {
    const p = b.pois.find((q) => q.id === id);
    if (p) b.reserve(p.pos.x, p.pos.z, 3.5);
  }
  for (let attempt = 0; attempt < 600 && placed < 24; attempt++) {
    const a = rng.range(0, Math.PI * 2);
    const rr = rng.range(R * 0.78, R * 0.95);
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    if (!b.isFree(x, z, 2)) continue;
    if (b.topId(x, z) !== B.grass) continue;
    // Od strony kamery (południe i wschód/zachód przy stacjach) niżej: krzewy zamiast wysokich drzew.
    const south = z > 2;
    const kind = south ? 'bush' : (treeKinds[Math.floor(rng.next() * treeKinds.length)] ?? 'oak');
    b.tree(kind, x, z, { reserve: kind === 'bush' ? 1.2 : 2 });
    placed++;
  }
  // Krzewy za budynkami (nikt tam nie zajdzie).
  for (const [x, z] of [
    [-17, -13],
    [-12, -17],
    [16, -13],
    [12, -17],
  ] as const)
    if (b.isFree(x, z, 0.5)) b.tree('bush', x, z, { reserve: 1 });

  b.scatterFoliage(-24, 24, -24, 24, 0.75, 0.4, [B.grass]);

  const bounds = { minX: -24, maxX: 24, minZ: -24, maxZ: 24 };
  return b.finish({
    bounds,
    spawn,
    spawnFacing: Math.PI,
    outdoor: true,
    island: { cx: 0, cz: 0, radius: R, bottomY: bottom, surfaceY: S },
  });
}
