/**
 * ModelRig: animacja proceduralna części modelu kostkowego.
 *
 * Każda klatka: poza = suma „ruchów” (MotionFn) dla bieżącej animacji → przenikanie z poprzednią pozą
 * (CROSSFADE) → zastosowanie do części (przesunięcie / obrót / skala względem spoczynku).
 * Hierarchia: root (render: pozycja, obrót, skala) → fx (efekty: przemiana) → all (animacja) → części.
 */
import * as THREE from 'three';
import type { AnimName, ModelId } from '../../game/contracts';
import type { ModelRig } from './types';
import { CROSSFADE, ONE_SHOT_DURATION, clamp01, isLoop, smoothstep } from './anim';
import type { BuiltModel } from './builder';
import { ownedClone } from './materials';

const STRIDE = 9; // px py pz rx ry rz sx sy sz

/** Bufor pozy: przesunięcia i obroty dodawane, skale mnożone. Nieznane części są ignorowane. */
export class PoseWriter {
  readonly data: Float32Array;
  constructor(readonly index: ReadonlyMap<string, number>) {
    this.data = new Float32Array(index.size * STRIDE);
    this.reset();
  }
  reset(): void {
    const d = this.data;
    for (let i = 0; i < d.length; i += STRIDE) {
      d[i] = d[i + 1] = d[i + 2] = d[i + 3] = d[i + 4] = d[i + 5] = 0;
      d[i + 6] = d[i + 7] = d[i + 8] = 1;
    }
  }
  has(name: string): boolean {
    return this.index.has(name);
  }
  pos(name: string, x: number, y: number, z: number): this {
    const i = this.index.get(name);
    if (i === undefined) return this;
    const o = i * STRIDE;
    const d = this.data;
    d[o] = (d[o] ?? 0) + x;
    d[o + 1] = (d[o + 1] ?? 0) + y;
    d[o + 2] = (d[o + 2] ?? 0) + z;
    return this;
  }
  rot(name: string, x: number, y: number, z: number): this {
    const i = this.index.get(name);
    if (i === undefined) return this;
    const o = i * STRIDE + 3;
    const d = this.data;
    d[o] = (d[o] ?? 0) + x;
    d[o + 1] = (d[o + 1] ?? 0) + y;
    d[o + 2] = (d[o + 2] ?? 0) + z;
    return this;
  }
  scale(name: string, x: number, y = x, z = x): this {
    const i = this.index.get(name);
    if (i === undefined) return this;
    const o = i * STRIDE + 6;
    const d = this.data;
    d[o] = (d[o] ?? 1) * x;
    d[o + 1] = (d[o + 1] ?? 1) * y;
    d[o + 2] = (d[o + 2] ?? 1) * z;
    return this;
  }
  copyFrom(o: PoseWriter): void {
    this.data.set(o.data);
  }
}

export interface AnimCtx {
  anim: AnimName;
  /** Czas w bieżącej animacji (s, z uwzględnieniem speed). */
  t: number;
  /** Postęp animacji jednorazowej 0..1 (dla pętli 0). */
  p: number;
  /** Czas globalny modelu (s) z losowym przesunięciem fazy. */
  time: number;
  dt: number;
  /** Stałe ziarno instancji (0..1). */
  seed: number;
}

/** Dostęp ruchów do materiałów i siatek modelu (efekty niezwiązane z pozą). */
export interface RigFx {
  /** Dodaje emisję grupie materiałów (tylko w tej klatce). */
  glowGroup(group: string, color: THREE.ColorRepresentation, intensity: number): void;
  /** Mnoży kolor rozproszony grupy (tylko w tej klatce), np. więdnięcie. */
  tintGroup(group: string, r: number, g: number, b: number): void;
  /** Błysk całego modelu (0..1, tylko w tej klatce). */
  flash(level: number): void;
  named(name: string): THREE.Mesh | undefined;
  pivot(name: string): THREE.Object3D | undefined;
}

export type MotionFn = (c: AnimCtx, w: PoseWriter, fx: RigFx) => void;

export interface RigSpec {
  id: ModelId;
  built: BuiltModel;
  height: number;
  radius: number;
  motions: MotionFn[];
  /** Jednorazowe animacje, które po zakończeniu trzymają ostatnią klatkę (np. 'hide', skrzynia 'open'). */
  holds?: readonly AnimName[];
  durations?: Partial<Record<AnimName, number>>;
  /** Materiał bazowy (wspólny) — do podmiany na własną kopię przy podświetleniu. */
  baseMaterial: THREE.MeshLambertMaterial;
  receiveShadow?: boolean;
  seed?: number;
}

const HIGHLIGHT = new THREE.Color('#fff0b3');
const FLASH = new THREE.Color('#ffffff');
const _c = new THREE.Color();

interface GroupState {
  mat: THREE.MeshLambertMaterial;
  glow: THREE.Color;
  tint: THREE.Color;
}

export class Rig implements ModelRig {
  readonly root = new THREE.Group();
  /** Warstwa efektów (przemiana) — między root a animacją. */
  readonly fx = new THREE.Group();
  readonly height: number;
  readonly radius: number;
  readonly id: ModelId;

  private readonly built: BuiltModel;
  private readonly pivotList: THREE.Object3D[] = [];
  private readonly rest: Float32Array;
  private readonly pose: PoseWriter;
  private readonly from: PoseWriter;
  /** Poza faktycznie zastosowana w ostatniej klatce (po przenikaniu) — punkt startu kolejnego przenikania. */
  private readonly applied: PoseWriter;
  private readonly motions: MotionFn[];
  private readonly holds: ReadonlySet<AnimName>;
  private readonly durations: Partial<Record<AnimName, number>>;
  private readonly baseMat: THREE.MeshLambertMaterial;
  private ownBase: THREE.MeshLambertMaterial | null = null;
  private boosted = false;
  private readonly groupStates = new Map<string, GroupState>();
  /** Te same stany co w groupStates — tablica do pętli co klatkę (bez iteratorów). */
  private readonly groupList: GroupState[] = [];
  private readonly ctx: AnimCtx;
  private readonly fxApi: RigFx;
  private anim: AnimName = 'idle';
  private t = 0;
  private speed = 1;
  private done = false;
  private fade = 1;
  private time: number;
  private pending: (() => void) | null = null;
  private highlight = false;
  private flashFrame = 0;
  /** Błysk z zewnątrz (przemiana). */
  externalFlash = 0;
  private readonly drivers = new Set<(dt: number) => void>();
  private disposed = false;

  constructor(spec: RigSpec) {
    this.id = spec.id;
    this.built = spec.built;
    this.height = spec.height;
    this.radius = spec.radius;
    this.motions = spec.motions;
    this.holds = new Set(spec.holds ?? ['hide']);
    this.durations = spec.durations ?? {};
    this.baseMat = spec.baseMaterial;
    const seed = spec.seed ?? Math.random();
    this.time = seed * 100;
    this.root.name = spec.id;
    this.fx.name = 'fx';
    this.root.add(this.fx);
    this.fx.add(this.built.all);
    this.root.userData.modelId = spec.id;

    const index = new Map<string, number>();
    for (const [name, obj] of this.built.pivots) {
      index.set(name, this.pivotList.length);
      this.pivotList.push(obj);
    }
    this.rest = new Float32Array(this.pivotList.length * STRIDE);
    this.pivotList.forEach((o, i) => {
      const r = this.rest;
      const k = i * STRIDE;
      r[k] = o.position.x;
      r[k + 1] = o.position.y;
      r[k + 2] = o.position.z;
      r[k + 3] = o.rotation.x;
      r[k + 4] = o.rotation.y;
      r[k + 5] = o.rotation.z;
      r[k + 6] = o.scale.x;
      r[k + 7] = o.scale.y;
      r[k + 8] = o.scale.z;
    });
    this.pose = new PoseWriter(index);
    this.from = new PoseWriter(index);
    this.applied = new PoseWriter(index);
    for (const [name, g] of this.built.groups) {
      const st: GroupState = { mat: g.mat, glow: new THREE.Color(0, 0, 0), tint: new THREE.Color(1, 1, 1) };
      this.groupStates.set(name, st);
      this.groupList.push(st);
    }
    if (spec.receiveShadow) for (const m of this.built.meshes) m.receiveShadow = true;

    this.ctx = { anim: 'idle', t: 0, p: 0, time: this.time, dt: 0, seed };
    this.fxApi = {
      glowGroup: (group, color, intensity) => {
        const g = this.groupStates.get(group);
        if (!g) return;
        _c.set(color).multiplyScalar(intensity);
        g.glow.add(_c);
      },
      tintGroup: (group, r, g, b) => {
        const s = this.groupStates.get(group);
        if (!s) return;
        s.tint.r *= r;
        s.tint.g *= g;
        s.tint.b *= b;
      },
      flash: level => {
        this.flashFrame = Math.max(this.flashFrame, level);
      },
      named: name => this.built.named.get(name),
      pivot: name => this.built.pivots.get(name),
    };
    this.evaluate(0);
  }

  get current(): AnimName {
    return this.anim;
  }

  /** Czas trwania animacji jednorazowej (s, przy speed 1). */
  duration(anim: AnimName): number {
    return this.durations[anim] ?? ONE_SHOT_DURATION[anim];
  }

  play(anim: AnimName, opts?: { speed?: number }): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const speed = Math.max(0.05, opts?.speed ?? 1);
    // Przerwana animacja jednorazowa — obietnica rozwiązuje się od razu (nikt nie czeka w nieskończoność).
    this.resolvePending();
    if (isLoop(anim) && anim === this.anim) {
      this.speed = speed;
      return Promise.resolve();
    }
    this.start(anim, speed);
    if (isLoop(anim)) return Promise.resolve();
    return new Promise<void>(res => {
      this.pending = res;
    });
  }

  private start(anim: AnimName, speed: number): void {
    this.from.copyFrom(this.applied);
    this.fade = 0;
    this.anim = anim;
    this.t = 0;
    this.speed = speed;
    this.done = false;
  }

  private resolvePending(): void {
    const p = this.pending;
    this.pending = null;
    if (p) p();
  }

  setHighlight(on: boolean): void {
    this.highlight = on;
  }

  /** Dodaje funkcję wywoływaną w każdym update (np. sekwencja przemiany). Zwraca funkcję wypisania. */
  addDriver(fn: (dt: number) => void): () => void {
    this.drivers.add(fn);
    return () => this.drivers.delete(fn);
  }

  update(dt: number): void {
    if (this.disposed) return;
    const d = Math.max(0, Math.min(dt, 0.25));
    this.time += d;
    this.t += d * this.speed;
    if (this.fade < 1) this.fade = Math.min(1, this.fade + d / CROSSFADE);
    if (!isLoop(this.anim) && !this.done) {
      const dur = this.duration(this.anim);
      if (this.t >= dur) {
        this.done = true;
        this.t = dur;
        const hold = this.holds.has(this.anim);
        if (!hold) this.start('idle', 1);
        this.resolvePending();
      }
    }
    this.evaluate(d);
    if (this.drivers.size > 0) for (const fn of [...this.drivers]) fn(d);
  }

  private evaluate(dt: number): void {
    const ctx = this.ctx;
    ctx.anim = this.anim;
    ctx.t = this.t;
    ctx.dt = dt;
    ctx.time = this.time;
    ctx.p = isLoop(this.anim) ? 0 : clamp01(this.t / Math.max(1e-3, this.duration(this.anim)));
    this.pose.reset();
    this.flashFrame = 0;
    for (const g of this.groupList) {
      g.glow.setRGB(0, 0, 0);
      g.tint.setRGB(1, 1, 1);
    }
    for (const m of this.motions) m(ctx, this.pose, this.fxApi);

    const w = smoothstep(this.fade);
    const a = this.from.data;
    const b = this.pose.data;
    const r = this.rest;
    const blend = w < 1;
    for (let i = 0; i < this.pivotList.length; i++) {
      const o = this.pivotList[i];
      if (!o) continue;
      const k = i * STRIDE;
      let px = b[k] ?? 0, py = b[k + 1] ?? 0, pz = b[k + 2] ?? 0;
      let rx = b[k + 3] ?? 0, ry = b[k + 4] ?? 0, rz = b[k + 5] ?? 0;
      let sx = b[k + 6] ?? 1, sy = b[k + 7] ?? 1, sz = b[k + 8] ?? 1;
      if (blend) {
        px = (a[k] ?? 0) + (px - (a[k] ?? 0)) * w;
        py = (a[k + 1] ?? 0) + (py - (a[k + 1] ?? 0)) * w;
        pz = (a[k + 2] ?? 0) + (pz - (a[k + 2] ?? 0)) * w;
        rx = (a[k + 3] ?? 0) + (rx - (a[k + 3] ?? 0)) * w;
        ry = (a[k + 4] ?? 0) + (ry - (a[k + 4] ?? 0)) * w;
        rz = (a[k + 5] ?? 0) + (rz - (a[k + 5] ?? 0)) * w;
        sx = (a[k + 6] ?? 1) + (sx - (a[k + 6] ?? 1)) * w;
        sy = (a[k + 7] ?? 1) + (sy - (a[k + 7] ?? 1)) * w;
        sz = (a[k + 8] ?? 1) + (sz - (a[k + 8] ?? 1)) * w;
      }
      const ap = this.applied.data;
      ap[k] = px;
      ap[k + 1] = py;
      ap[k + 2] = pz;
      ap[k + 3] = rx;
      ap[k + 4] = ry;
      ap[k + 5] = rz;
      ap[k + 6] = sx;
      ap[k + 7] = sy;
      ap[k + 8] = sz;
      o.position.set((r[k] ?? 0) + px, (r[k + 1] ?? 0) + py, (r[k + 2] ?? 0) + pz);
      o.rotation.set((r[k + 3] ?? 0) + rx, (r[k + 4] ?? 0) + ry, (r[k + 5] ?? 0) + rz);
      o.scale.set((r[k + 6] ?? 1) * sx, (r[k + 7] ?? 1) * sy, (r[k + 8] ?? 1) * sz);
    }
    this.applyMaterials();
  }

  private applyMaterials(): void {
    const flash = Math.max(this.flashFrame, this.externalFlash);
    // Podświetlenie: rozjaśnienie proporcjonalne do koloru (zachowuje nasycenie) + lekka ciepła poświata, pulsuje.
    const pulse = this.highlight ? 0.5 + 0.5 * Math.sin(this.time * 5.5) : 0;
    const hlMul = this.highlight ? 1.22 + 0.2 * pulse : 1;
    const hl = this.highlight ? 0.04 + 0.06 * pulse : 0;
    const boost = flash > 0.002 || this.highlight;
    if (boost) {
      if (!this.ownBase) {
        this.ownBase = ownedClone(this.baseMat);
        this.ownBase.name = `${this.id}:boost`;
      }
      if (!this.boosted) {
        for (const m of this.built.baseMeshes) m.material = this.ownBase;
        this.boosted = true;
      }
      const e0 = this.ownBase.userData.emissive0 as THREE.Color;
      const c0 = this.ownBase.userData.color0 as THREE.Color;
      this.ownBase.emissive.copy(e0);
      this.ownBase.emissive.r += FLASH.r * flash + HIGHLIGHT.r * hl;
      this.ownBase.emissive.g += FLASH.g * flash + HIGHLIGHT.g * hl;
      this.ownBase.emissive.b += FLASH.b * flash + HIGHLIGHT.b * hl;
      this.ownBase.color.copy(c0).multiplyScalar(hlMul);
    } else if (this.boosted) {
      for (const m of this.built.baseMeshes) m.material = this.baseMat;
      this.boosted = false;
    }
    for (const g of this.groupList) {
      const e0 = g.mat.userData.emissive0 as THREE.Color;
      const c0 = g.mat.userData.color0 as THREE.Color;
      g.mat.emissive.copy(e0).add(g.glow);
      if (boost) {
        g.mat.emissive.r += FLASH.r * flash + HIGHLIGHT.r * hl;
        g.mat.emissive.g += FLASH.g * flash + HIGHLIGHT.g * hl;
        g.mat.emissive.b += FLASH.b * flash + HIGHLIGHT.b * hl;
      }
      g.mat.color.setRGB(c0.r * g.tint.r * hlMul, c0.g * g.tint.g * hlMul, c0.b * g.tint.b * hlMul);
    }
  }

  /** Liczba siatek (diagnostyka/testy). */
  get meshCount(): number {
    return this.built.meshes.length;
  }

  get pivotNames(): string[] {
    return [...this.built.pivots.keys()];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resolvePending();
    this.drivers.clear();
    this.root.removeFromParent();
    for (const g of this.built.geometries) g.dispose();
    for (const m of this.built.ownedMaterials) m.dispose();
    this.ownBase?.dispose();
  }
}
