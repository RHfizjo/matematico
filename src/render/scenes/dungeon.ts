/**
 * Dungeon „Nora pod Starym Dębem” (GDD 11): pokój w jaskini pod dębem.
 * Ściany z korzeni/ziemi tylko z tyłu i po bokach (od kamery niski brzeg — nic nie zasłania bohatera).
 * Warianty: fight (hero-spot, enemy-spot-0/1), chest (piedestał 'chest'), rest (ognisko 'campfire'),
 * boss (większa sala z chwastami i kwiatami). Zawsze 'exit'.
 */
import type { RoomKind } from '../../game/contracts';
import { B } from '../voxel/blocks';
import { fbm2, hash2 } from '../util/rng';
import { SceneBuilder } from './builder';
import type { SceneBuild } from './types';
import { FACING_CAMERA, SCREEN_RIGHT, SCREEN_UP } from '../constants';

const F = 10; // y najwyższej kostki podłogi
/** Skała wokół pokoju (boki) — stała kamera nie może zajrzeć w pustkę za krawędzią planszy. */
const SIDE = 12;
/** Pas przed pokojem (od strony kamery): niski brzeg, ścieżka wejścia i skalny grzbiet na dole kadru. */
const FRONT = 10;

export function buildDungeonRoom(seed: number, kind: RoomKind, index: number): SceneBuild {
  const b = new SceneBuilder('dungeon-room', (seed ^ (index * 7919 + 13)) >>> 0);
  const s = b.seed;
  const boss = kind === 'boss';
  const W = boss ? 28 : 20;
  const D = boss ? 20 : 16;
  const x0 = -W / 2;
  const x1 = W / 2 - 1;
  const z0 = -D / 2;
  const z1 = D / 2 - 1;
  const wallH = boss ? 7 : 6;

  // ── Podłoga: łagodne plamy mchu, bruku i żwiru (dwa pola szumu — bez pojedynczych „kratek”).
  for (let z = z0 - 4; z <= z1 + FRONT; z++)
    for (let x = x0 - SIDE; x <= x1 + SIDE; x++) {
      for (let y = F - 3; y <= F; y++) b.world.set(x, y, z, y === F - 3 ? B.stone : B.dirt);
      const moss = fbm2(x * 0.09, z * 0.09, s + 3, 3);
      const rock = fbm2(x * 0.13 + 40, z * 0.13 - 17, s + 8, 2);
      let top: number = B.caveFloor;
      if (moss > (boss ? 0.52 : 0.58)) top = B.caveMoss;
      else if (rock < 0.3) top = B.cobble;
      else if (rock > 0.72) top = B.gravel;
      b.world.set(x, F, z, top);
    }

  // ── Ściany: tył (północ) wysoki, boki opadają ku kamerze, przód — niski brzeg z korzeni.
  // Materiały z szumu (spójne płaty ziemi, korzeni i kamienia; wierzch: mech lub korzenie) — z góry nie ma szachownicy.
  const wallCol = (x: number, z: number, h: number): void => {
    const band = fbm2(x * 0.22, z * 0.22, s + 11, 2);
    const roots = fbm2(x * 0.16 + 9, z * 0.45, s + 12, 2) > 0.6;
    const topMoss = fbm2(x * 0.2 + 3, z * 0.2 + 5, s + 13, 2) > 0.4;
    for (let y = F + 1; y <= F + h; y++) {
      let id: number = y <= F + 1 ? (band < 0.5 ? B.stone : B.cobble) : roots ? B.root : band < 0.34 ? B.stone : B.dirt;
      if (y === F + h) id = topMoss ? B.caveMoss : B.root;
      b.world.set(x, y, z, id);
    }
  };
  for (let x = x0 - SIDE; x <= x1 + SIDE; x++)
    for (let z = z0 - 4; z < z0; z++) {
      const h = wallH + Math.round((fbm2(x * 0.3, z * 0.3, s + 5, 2) - 0.5) * 3) - (z === z0 - 1 && hash2(x, z, s + 2) < 0.3 ? 1 : 0);
      wallCol(x, z, Math.max(3, h));
    }
  for (let z = z0; z <= z1 + FRONT; z++) {
    const t = Math.min(1, (z - z0) / (z1 - z0 + 2)); // 0 z tyłu → 1 z przodu
    for (const side of [-1, 1]) {
      for (let k = 0; k < SIDE; k++) {
        const x = side < 0 ? x0 - 1 - k : x1 + 1 + k;
        // Dalej od pokoju skała nieco wyżej (tło), przy pokoju niżej — nic nie zasłania bohatera.
        const base = Math.round(wallH * (1 - t * 0.8)) + (k > 1 ? 1 : 0) + Math.floor(k / 5);
        const h = Math.max(1, base + Math.round((fbm2(x * 0.35, z * 0.35, s + 17, 2) - 0.5) * 2));
        wallCol(x, z, h);
      }
    }
  }
  // Przód: niski brzeg korzeni z przerwą na wejście.
  for (let x = x0; x <= x1; x++) {
    if (Math.abs(x + 0.5) < 2) continue;
    if (hash2(x, 99, s) < 0.7) b.world.set(x, F + 1, z1 + 1, hash2(x, 98, s) < 0.5 ? B.root : B.caveMoss);
  }
  // Pas przed pokojem: ścieżka wejścia (żwir) i skalny grzbiet rosnący ku dołowi kadru (daleko od bohatera,
  // więc go nie zasłania; zamyka kadr zamiast pustki).
  for (let z = z1 + 2; z <= z1 + FRONT; z++)
    for (let x = x0; x <= x1; x++) {
      const pathHalf = 1.6 + fbm2(z * 0.4, 3, s + 19, 2);
      if (Math.abs(x + 0.5) < pathHalf) {
        b.world.set(x, F, z, B.gravel);
        continue;
      }
      const dz = z - (z1 + 1);
      const h = Math.round(Math.max(0, (dz - 2) * 0.45 + (fbm2(x * 0.3, z * 0.3, s + 23, 2) - 0.5) * 2.2));
      if (h > 0) wallCol(x, z, Math.min(4, h));
    }

  // ── Wyjście: przejście w tylnej ścianie z latarniami.
  for (let y = F + 1; y <= F + 3; y++)
    for (let x = -1; x <= 0; x++) {
      b.world.set(x, y, z0 - 1, 0);
      b.world.set(x, y, z0 - 2, 0);
    }
  for (let x = -1; x <= 0; x++) for (let y = F + 1; y <= F + 3; y++) b.world.set(x, y, z0 - 3, B.darkPlanks);
  for (const x of [-2, 1]) for (let y = F + 1; y <= F + 4; y++) b.world.set(x, y, z0 - 1, B.stoneBrick);
  for (let x = -2; x <= 1; x++) b.world.set(x, F + 4, z0 - 1, B.stoneBrick);
  b.poi('exit', 'exit', 0, z0 + 1.2, 2);
  for (const lx of [-2.6, 2.6]) {
    b.prop('prop:lantern', lx, z0 + 0.6, { collider: 0.35 });
    b.light({ x: lx, y: F + 2.6, z: z0 + 0.9, color: '#ffb45c', intensity: 7, distance: 8 });
  }
  b.reserve(0, z0 + 1, 2.5);

  // ── Świecące grzybki i kryształki (drobne instancje) przy ścianach i w kątach.
  const clusters = boss ? 12 : 9;
  for (let i = 0; i < clusters; i++) {
    const edge = b.rng.int(0, 2);
    const cx = edge === 0 ? b.rng.range(x0 + 0.6, x0 + 2) : edge === 1 ? b.rng.range(x1 - 1, x1 + 0.4) : b.rng.range(x0 + 1, x1);
    const cz = edge === 2 ? b.rng.range(z0 + 0.4, z0 + 1.8) : b.rng.range(z0 + 0.5, z1 - 2);
    if (b.isReserved(cx, cz)) continue;
    const crystal = b.rng.chance(0.4);
    const col = crystal ? b.rng.pick(['#a58dff', '#7fe3ff', '#ff9ee0']) : b.rng.pick(['#46d8ff', '#a47bff', '#5ef08a']);
    const n = b.rng.int(3, 6);
    for (let k = 0; k < n; k++) b.foliageAt(crystal ? 'crystal' : 'mushroom', cx + b.rng.range(-0.8, 0.8), cz + b.rng.range(-0.8, 0.8), col, b.rng.range(0.8, 1.5));
  }
  // Kryształy w ścianach (jak żyły rudy) i grzybki na szczytach ścian (widoczne z góry).
  for (let x = x0 - SIDE + 1; x <= x1 + SIDE - 1; x++)
    for (let z = z0 - 3; z <= z1 + FRONT - 1; z++) {
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1 + 1) continue;
      const t = b.top(x, z);
      if (t <= F) continue;
      const far = Math.max(x0 - x, x - x1, 0) > 5 || z > z1 + 5;
      const r = hash2(x, z, s + 29);
      if (r < (far ? 0.025 : 0.05)) b.foliageAt('mushroom', x + 0.5, z + 0.5, hash2(z, x, s) < 0.5 ? '#46d8ff' : '#ff7fd0', 1.3);
      else if (r < (far ? 0.045 : 0.08) && t > F + 2) b.world.set(x, t - 1, z, hash2(z, x, s + 1) < 0.5 ? B.crystal : B.pinkCrystal);
    }

  // Stalagmity.
  for (let i = 0; i < (boss ? 7 : 4); i++) {
    const x = Math.floor(b.rng.range(x0 + 1, x1 - 1));
    const z = Math.floor(b.rng.range(z0 + 1, z0 + 4));
    const h = b.rng.int(1, 3);
    for (let y = 1; y <= h; y++) b.world.set(x, F + y, z, y === h ? B.cobble : B.stone);
  }

  // ── Środek pokoju i ustawienie walki wzdłuż „prawo na ekranie”.
  const C = { x: 0, z: boss ? 1.5 : 1 };
  const at = (right: number, up: number): { x: number; z: number } => ({
    x: C.x + SCREEN_RIGHT.x * right + SCREEN_UP.x * up,
    z: C.z + SCREEN_RIGHT.z * right + SCREEN_UP.z * up,
  });
  const heroSpot = at(boss ? -4.2 : -3.4, 0);
  const enemy0 = at(boss ? 4.2 : 3.4, 0.4);
  const enemy1 = at(boss ? 7 : 6.2, 2.4);
  b.poi('hero-spot', 'heroSpot', heroSpot.x, heroSpot.z, 1);
  b.poi('enemy-spot-0', 'enemySpot', enemy0.x, enemy0.z, 1.5);
  b.poi('enemy-spot-1', 'enemySpot', enemy1.x, enemy1.z, 1.5);
  b.reserve(heroSpot.x, heroSpot.z, 1.5);
  b.reserve(enemy0.x, enemy0.z, 2);
  b.reserve(enemy1.x, enemy1.z, 1.5);

  let spawn = { x: 0.5, z: z1 - 0.5 };
  if (kind === 'fight' || kind === 'boss') {
    spawn = { ...heroSpot };
    // Arena: krąg ubitej ziemi otoczony (przerywanym) pierścieniem kamieni.
    const ar = boss ? 6.5 : 5.2;
    b.disc(C.x, C.z, ar + 1.2, (x, z, d) => {
      if (d < ar - 0.6) b.setTop(x, z, d > ar - 1.6 || hash2(x, z, s + 41) > 0.12 ? B.caveFloor : B.gravel);
      else if (d < ar + 0.5) b.setTop(x, z, hash2(z, x, s) < 0.72 ? B.stoneBrick : B.mossyStone);
    });
  }
  // Kamyczki i korzenie na podłodze (żeby duża płaszczyzna nie była pusta).
  for (let i = 0; i < (boss ? 40 : 28); i++) {
    const x = b.rng.range(x0 + 0.5, x1 + 0.5);
    const z = b.rng.range(z0 + 0.5, z1 + 0.5);
    if (b.isReserved(x, z)) continue;
    b.foliageAt('pebble', x, z, b.rng.pick(['#9a9aa6', '#8c8578', '#a7a19a']), b.rng.range(0.8, 1.5));
  }
  for (let r = 0; r < 2; r++) {
    // Korzeń przecinający podłogę (płasko w podłodze).
    const zc = b.rng.range(z0 + 2, z1 - 1);
    const fromLeft = r === 0;
    const len = b.rng.int(3, 6);
    for (let k = 0; k < len; k++) {
      const x = fromLeft ? x0 + k : x1 - k;
      const z = Math.floor(zc + Math.sin(k * 0.9) * 1.2);
      if (!b.isReserved(x, z)) b.setTop(x, z, B.root);
    }
  }

  if (kind === 'chest') {
    // Piedestał 3×3 z cegły kamiennej, na nim skrzynia.
    const pc = { x: 0, z: -1 };
    for (let z = pc.z - 1; z <= pc.z + 1; z++) for (let x = pc.x - 1; x <= pc.x + 1; x++) b.world.set(x, F + 1, z, B.stoneBrick);
    b.world.set(pc.x - 1, F + 1, pc.z - 1, B.crystal);
    b.world.set(pc.x + 1, F + 1, pc.z - 1, B.crystal);
    b.prop('prop:chest', pc.x + 0.5, pc.z + 0.5, { facing: FACING_CAMERA, poi: 'chest', collider: 0.7 });
    b.poi('chest', 'chest', pc.x + 0.5, pc.z + 2.6, 2.2);
    b.light({ x: pc.x + 0.5, y: F + 3, z: pc.z + 0.5, color: '#b9a4ff', intensity: 5, distance: 7 });
  }

  if (kind === 'rest') {
    const cf = { x: 0.5, z: 0.5 };
    b.prop('prop:campfire', cf.x, cf.z, { poi: 'campfire', collider: 0.9 });
    b.poi('campfire', 'campfire', cf.x, cf.z + 2, 2.4);
    b.light({ x: cf.x, y: F + 2, z: cf.z, color: '#ff9848', intensity: 14, distance: 12, flicker: true });
    // Kłody do siedzenia.
    b.box([cf.x - 3, F + 1, cf.z - 0.4], [cf.x - 2, F + 1.5, cf.z + 0.5], B.log);
    b.box([cf.x + 2, F + 1, cf.z - 0.6], [cf.x + 3.1, F + 1.5, cf.z + 0.3], B.log);
    b.block(cf.x - 2.5, cf.z);
    b.block(cf.x + 2.5, cf.z);
    b.disc(cf.x, cf.z, 3.5, (x, z) => b.setTop(x, z, B.gravel));
    spawn = { x: 0.5, z: z1 - 0.5 };
  }

  if (boss) {
    // Chwasty i kwiaty (Kosiarrini Chwastorrini).
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        if (b.isReserved(x, z)) continue;
        const r = hash2(x, z, s + 51);
        if (r < 0.35) b.foliageAt('tallGrass', x + 0.5, z + 0.5, r < 0.1 ? '#8fcf3f' : '#5fa83a', 1.5);
        else if (r < 0.45) b.foliageAt('flower', x + 0.5, z + 0.5, ['#ffd23f', '#ff7eb6', '#ffffff', '#c59bff'][Math.floor(r * 40) % 4] ?? '#fff', 1.2);
      }
    // Pnącza na tylnej ścianie.
    for (let i = 0; i < 5; i++) {
      const x = x0 + 2 + (i * (W - 4)) / 4;
      b.prop('prop:vine', x, z0 + 0.2, { collider: false, facing: 0 });
    }
  } else {
    b.scatterFoliage(x0, x1, z0, z1, 0.5, 0.15, [B.caveMoss, B.moss, B.grass]);
  }

  // Snop światła z góry (dziura w sklepieniu pod dębem).
  const shafts = [{ x: C.x - 1.5, z: C.z - 2, y: F + 1, radius: boss ? 6 : 4.5 }];
  b.poi('spawn', 'spawn', spawn.x, spawn.z, 1);

  const bounds = { minX: x0, maxX: x1 + 1, minZ: z0, maxZ: z1 + 1 };
  return b.finish({
    bounds,
    spawn,
    spawnFacing: Math.PI,
    outdoor: false,
    island: { cx: 0, cz: 0, radius: Math.max(W, D) / 2, bottomY: F - 3, surfaceY: F },
    palette: 'cave',
    lightShafts: shafts,
  });
}
