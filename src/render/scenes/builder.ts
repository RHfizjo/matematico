/**
 * Pomocnik generatorów scen: wyspa, ścieżki, drzewa, roślinność, POI, rekwizyty.
 * Czysty (bez three.js) — deterministyczny z ziarna.
 */
import type { ModelId, Poi, PoiKind, SceneKind } from '../../game/contracts';
import { B } from '../voxel/blocks';
import { VoxelWorld } from '../voxel/world';
import { fbm2, hash2, mulberry32, type SceneRng } from '../util/rng';
import type { TreeKind } from '../world/trees';
import type { DecorBox, FoliageSpec, FoliageType, LightSpec, PropSpec, SceneBuild, TreeSpec } from './types';

export const FLOWER_COLORS = ['#fff4f0', '#ffd23f', '#ff7eb6', '#9fc7ff', '#ff6b5e', '#c59bff', '#ffffff', '#ffb347'];

export class SceneBuilder {
  readonly world = new VoxelWorld();
  readonly rng: SceneRng;
  readonly pois: Poi[] = [];
  readonly props: PropSpec[] = [];
  readonly trees: TreeSpec[] = [];
  readonly foliage: FoliageSpec[] = [];
  readonly decor: DecorBox[] = [];
  readonly lights: LightSpec[] = [];
  readonly blocked: [number, number][] = [];
  private readonly reserved = new Set<number>();

  constructor(
    readonly kind: SceneKind,
    readonly seed: number,
  ) {
    this.rng = mulberry32(seed);
  }

  private static key(x: number, z: number): number {
    return (Math.floor(x) + 4096) * 8192 + (Math.floor(z) + 4096);
  }

  reserve(x: number, z: number, r = 0.5): void {
    for (let dz = Math.floor(z - r); dz <= Math.floor(z + r); dz++)
      for (let dx = Math.floor(x - r); dx <= Math.floor(x + r); dx++) {
        if ((dx + 0.5 - x) ** 2 + (dz + 0.5 - z) ** 2 <= (r + 0.5) ** 2) this.reserved.add(SceneBuilder.key(dx, dz));
      }
  }

  isReserved(x: number, z: number): boolean {
    return this.reserved.has(SceneBuilder.key(x, z));
  }

  isFree(x: number, z: number, r: number): boolean {
    for (let dz = Math.floor(z - r); dz <= Math.floor(z + r); dz++)
      for (let dx = Math.floor(x - r); dx <= Math.floor(x + r); dx++) if (this.reserved.has(SceneBuilder.key(dx, dz))) return false;
    return true;
  }

  /** Najwyższa kostka w kolumnie (−Infinity gdy brak). */
  top(x: number, z: number): number {
    return this.world.top(Math.floor(x), Math.floor(z));
  }

  topId(x: number, z: number): number {
    const t = this.top(x, z);
    return t === -Infinity ? 0 : this.world.get(Math.floor(x), t, Math.floor(z));
  }

  /** Wysokość stania (y + 1 najwyższej kostki). */
  groundY(x: number, z: number): number {
    return this.top(x, z) + 1;
  }

  setTop(x: number, z: number, id: number, onlyIf?: readonly number[]): void {
    const t = this.top(x, z);
    if (t === -Infinity) return;
    const cur = this.world.get(Math.floor(x), t, Math.floor(z));
    if (onlyIf && !onlyIf.includes(cur)) return;
    this.world.set(Math.floor(x), t, Math.floor(z), id);
  }

  /** Kolumna terenu: od dołu kamień, 2–3 kostki ziemi, na wierzchu topId. */
  column(x: number, z: number, surface: number, bottom: number, topId: number): void {
    for (let y = bottom; y <= surface; y++) {
      let id: number = B.stone;
      if (y === surface) id = topId;
      else if (y >= surface - 2) id = B.dirt;
      else if (y <= bottom + 1 && hash2(x * 3 + y, z, this.seed) < 0.3) id = B.mossyStone;
      else if (hash2(x + y * 7, z * 5, this.seed + 1) < 0.18) id = B.cobble;
      this.world.set(x, y, z, id);
    }
  }

  /**
   * Latająca wyspa: kształt z szumu, spód jak odwrócony stożek (widać go przy krawędziach nad chmurami).
   * surface(x,z) → wysokość wierzchu; zwraca najniższy y spodu.
   */
  island(opts: { cx: number; cz: number; radius: number; surface: (x: number, z: number, edge: number) => number; top?: (x: number, z: number, y: number) => number }): number {
    const { cx, cz, radius } = opts;
    let minBottom = Infinity;
    const R = Math.ceil(radius * 1.25);
    for (let z = Math.floor(cz - R); z <= Math.ceil(cz + R); z++)
      for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
        const dx = x + 0.5 - cx;
        const dz = z + 0.5 - cz;
        const ang = Math.atan2(dz, dx);
        const wob = (fbm2(Math.cos(ang) * 2.2 + 11, Math.sin(ang) * 2.2 + 7, this.seed + 5, 3) - 0.5) * 0.36;
        const d = Math.hypot(dx, dz) / radius - wob;
        if (d >= 1) continue;
        const s = opts.surface(x, z, d);
        const depth = 2 + Math.pow(1 - d, 0.6) * radius * 0.42 * (0.7 + 0.6 * fbm2(x * 0.12, z * 0.12, this.seed + 9, 3));
        const bottom = Math.round(s - depth);
        minBottom = Math.min(minBottom, bottom);
        const topBlock = opts.top ? opts.top(x, z, s) : B.grass;
        this.column(x, z, s, bottom, topBlock);
        // Zwisające kamienie/korzenie pod wyspą.
        if (d < 0.85 && hash2(x, z, this.seed + 21) < 0.04) {
          const len = 1 + Math.floor(hash2(z, x, this.seed + 22) * 4);
          for (let k = 1; k <= len; k++) this.world.set(x, bottom - k, z, k === len ? B.mossyStone : B.stone);
        }
      }
    return minBottom;
  }

  /** Ścieżka po łamanej (szerokość w kostkach) — zmienia wierzch na ścieżkę i rezerwuje miejsce. */
  path(points: readonly (readonly [number, number])[], width: number, block: number = B.path, only: readonly number[] = [B.grass, B.flowerBed]): void {
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (!a || !b) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(1, Math.ceil(len * 3));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = a[0] + (b[0] - a[0]) * t;
        const z = a[1] + (b[1] - a[1]) * t;
        const r = width / 2;
        for (let dz = Math.floor(z - r); dz <= Math.floor(z + r); dz++)
          for (let dx = Math.floor(x - r); dx <= Math.floor(x + r); dx++) {
            const dd = Math.hypot(dx + 0.5 - x, dz + 0.5 - z);
            if (dd > r + 0.15) continue;
            // Postrzępione brzegi ścieżki.
            if (dd > r - 0.6 && hash2(dx, dz, this.seed + 33) < 0.35) continue;
            this.setTop(dx, dz, block, only);
            this.reserved.add(SceneBuilder.key(dx, dz));
          }
      }
    }
  }

  /** Okrąg/dysk kafelków. */
  disc(cx: number, cz: number, r: number, fn: (x: number, z: number, d: number) => void): void {
    for (let z = Math.floor(cz - r - 1); z <= Math.ceil(cz + r + 1); z++)
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
        if (d <= r) fn(x, z, d);
      }
  }

  poi(id: string, kind: PoiKind, x: number, z: number, radius = 2): Poi {
    const p: Poi = { id, kind, pos: { x, z }, radius };
    this.pois.push(p);
    return p;
  }

  prop(model: ModelId, x: number, z: number, opts: Omit<PropSpec, 'model' | 'x' | 'z'> = {}): void {
    this.props.push({ model, x, z, ...opts });
    this.reserve(x, z, 1);
  }

  /** Drzewo: (x, z) = środek pnia; bez `exact` przyciągane do środka kostki. */
  tree(kind: TreeKind, x: number, z: number, opts: { rot?: number; seed?: number; reserve?: number; exact?: boolean; y?: number } = {}): void {
    const px = opts.exact ? x : Math.floor(x) + 0.5;
    const pz = opts.exact ? z : Math.floor(z) + 0.5;
    const y = opts.y ?? this.groundY(px, pz);
    if (!Number.isFinite(y)) return;
    this.trees.push({
      kind,
      seed: opts.seed ?? Math.floor(this.rng.next() * 1e9),
      x: px,
      z: pz,
      y,
      rot: opts.rot ?? this.rng.int(0, 3),
    });
    this.reserve(px, pz, opts.reserve ?? 1.5);
  }

  foliageAt(type: FoliageType, x: number, z: number, color: string, scale = 1): void {
    const y = this.groundY(x, z);
    if (!Number.isFinite(y)) return;
    this.foliage.push({ type, x, y, z, color, scale, rot: this.rng.range(0, Math.PI * 2) });
  }

  light(l: LightSpec): void {
    this.lights.push(l);
  }

  box(min: [number, number, number], max: [number, number, number], block: number, noShadow = false): void {
    this.decor.push({ min, max, block, noShadow });
  }

  block(x: number, z: number): void {
    this.blocked.push([Math.floor(x), Math.floor(z)]);
  }

  /**
   * Rozsiew trawy i kwiatów po trawie (pomija ścieżki, zarezerwowane pola i wodę).
   * density: kępki na kostkę; flowers: udział kwiatów (modulowany szumem — łany kwiatów).
   */
  scatterFoliage(minX: number, maxX: number, minZ: number, maxZ: number, density: number, flowerShare: number, accept: readonly number[] = [B.grass]): void {
    const rng = mulberry32(this.seed ^ 0xf011a9e);
    for (let z = minZ; z <= maxZ; z++)
      for (let x = minX; x <= maxX; x++) {
        const id = this.topId(x, z);
        if (!accept.includes(id)) continue;
        if (this.reserved.has(SceneBuilder.key(x, z)) && rng.next() > 0.15) continue;
        const patch = fbm2(x * 0.09, z * 0.09, this.seed + 71, 3);
        const n = density * (0.5 + patch);
        let count = Math.floor(n);
        if (rng.next() < n - count) count++;
        for (let k = 0; k < count; k++) {
          const fx = x + rng.range(0.1, 0.9);
          const fz = z + rng.range(0.1, 0.9);
          const flowerP = flowerShare * Math.max(0, patch * 2.2 - 0.6);
          if (rng.next() < flowerP) {
            const ci = Math.floor(fbm2(x * 0.05, z * 0.05, this.seed + 99, 2) * FLOWER_COLORS.length * 1.6 + rng.next() * 1.4) % FLOWER_COLORS.length;
            this.foliageAt('flower', fx, fz, FLOWER_COLORS[ci] ?? '#ffffff', rng.range(0.8, 1.15));
          } else {
            const g = rng.next();
            const col = g < 0.33 ? '#7fd14e' : g < 0.66 ? '#6cc244' : '#95dc5a';
            this.foliageAt(rng.next() < 0.12 ? 'tallGrass' : 'tuft', fx, fz, col, rng.range(0.75, 1.25));
          }
        }
      }
  }

  finish(opts: Omit<SceneBuild, 'kind' | 'world' | 'pois' | 'props' | 'trees' | 'foliage' | 'decor' | 'lights' | 'blocked'>): SceneBuild {
    // Mieszamy kolejność roślinności, żeby dowolny prefiks (gęstość presetu) był równomierny.
    const rng = mulberry32(this.seed ^ 0x5eed);
    for (let i = this.foliage.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const a = this.foliage[i];
      const b = this.foliage[j];
      if (a && b) {
        this.foliage[i] = b;
        this.foliage[j] = a;
      }
    }
    return {
      kind: this.kind,
      world: this.world,
      pois: this.pois,
      props: this.props,
      trees: this.trees,
      foliage: this.foliage,
      decor: this.decor,
      lights: this.lights,
      blocked: this.blocked,
      ...opts,
    };
  }
}

/** Płot z żerdzi i dwóch poprzeczek wzdłuż odcinka (osie X/Z), z opcjonalnymi przerwami (furtki). */
export function fence(b: SceneBuilder, x0: number, z0: number, x1: number, z1: number, y: number, gaps: readonly [number, number][] = []): void {
  const horizontal = z0 === z1;
  const len = horizontal ? x1 - x0 : z1 - z0;
  const inGap = (t: number): boolean => gaps.some(([a, c]) => t >= a && t <= c);
  for (let t = 0; t <= len; t++) {
    const x = horizontal ? x0 + t : x0;
    const z = horizontal ? z0 : z0 + t;
    const gapHere = inGap(t);
    if (!gapHere) b.block(x, z);
    if (!gapHere && (t % 2 === 0 || t === len || inGap(t + 1) || inGap(t - 1))) {
      b.box([x + 0.36, y, z + 0.36], [x + 0.64, y + 1.15, z + 0.64], B.log);
      b.box([x + 0.33, y + 1.15, z + 0.33], [x + 0.67, y + 1.25, z + 0.67], B.planks, true);
    }
    if (t < len && !gapHere && !inGap(t + 1)) {
      for (const ry of [0.45, 0.85]) {
        if (horizontal) b.box([x + 0.5, y + ry, z + 0.44], [x + 1.5, y + ry + 0.13, z + 0.56], B.planks, true);
        else b.box([x + 0.44, y + ry, z + 0.5], [x + 0.56, y + ry + 0.13, z + 1.5], B.planks, true);
      }
    }
  }
}
