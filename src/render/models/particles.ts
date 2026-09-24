/**
 * Cząsteczki: JEDEN InstancedMesh małych kostek (pula 512). Rodzaje: sparkle, hit, crit, block, heal,
 * catch, digits (złote kostki z cyframi), poof. Grawitacja, opór, obrót, zanik przez skalowanie.
 * Kolory instancji w HDR (>1) — jasne cząstki łapie bloom. Cyfry: atlas 11 kafelków (0–9 + pusty)
 * wybierany atrybutem instancji aTile (onBeforeCompile).
 */
import * as THREE from 'three';
import type { BurstKind } from '../../game/contracts';
import type { ParticleSystem } from './types';
import { TAU, clamp01, mulberry } from './anim';

export const POOL = 512;
const TILES = 11;
const BLANK = 10;

const enum Fade {
  Shrink = 0,
  Poof = 1,
  Twinkle = 2,
  Hold = 3,
}

const enum Mode {
  Ballistic = 0,
  Vortex = 1,
}

type RGB = readonly [number, number, number];

const C = {
  gold: [1.6, 1.0, 0.15] as RGB,
  pink: [1.6, 0.35, 1.0] as RGB,
  white: [1.4, 1.4, 1.4] as RGB,
  warm: [1.5, 0.7, 0.2] as RGB,
  hitWhite: [1.3, 1.25, 1.15] as RGB,
  yellow: [1.7, 1.3, 0.08] as RGB,
  blue: [0.2, 0.7, 1.7] as RGB,
  cyan: [0.25, 1.3, 1.6] as RGB,
  green: [0.22, 1.2, 0.28] as RGB,
  mint: [0.5, 1.35, 0.55] as RGB,
  digit: [1.35, 0.9, 0.16] as RGB,
  smoke: [0.9, 0.9, 0.93] as RGB,
  lilac: [1.0, 0.55, 1.7] as RGB,
};

function makeAtlas(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = S * TILES;
  cv.height = S;
  const g = cv.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#5a3a0a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 ${Math.round(S * 0.78)}px Nunito, "Arial Black", system-ui, sans-serif`;
  for (let d = 0; d < 10; d++) g.fillText(String(d), d * S + S / 2, S / 2 + S * 0.04);
  // cienka ramka kafelka cyfry
  g.strokeStyle = '#c99a2e';
  g.lineWidth = 4;
  for (let d = 0; d < 10; d++) g.strokeRect(d * S + 2, 2, S - 4, S - 4);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export interface VortexOpts {
  count: number;
  /** Promień startowy (rozrzut wokół środka). */
  radius: number;
  /** Rozrzut w pionie (od środka ±height/2). */
  height: number;
  /** Czas do „złożenia się” w środku (s). */
  duration: number;
  colors?: RGB[];
  size?: number;
}

export class Particles implements ParticleSystem {
  readonly object: THREE.InstancedMesh;
  private readonly geo: THREE.BoxGeometry;
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly atlas: THREE.Texture | null;
  private n = 0;
  private lastN = 0;
  private readonly rnd = mulberry(1234);
  // stan cząstek (struktura tablic)
  private readonly px = new Float32Array(POOL);
  private readonly py = new Float32Array(POOL);
  private readonly pz = new Float32Array(POOL);
  private readonly vx = new Float32Array(POOL);
  private readonly vy = new Float32Array(POOL);
  private readonly vz = new Float32Array(POOL);
  private readonly age = new Float32Array(POOL);
  private readonly life = new Float32Array(POOL);
  private readonly size = new Float32Array(POOL);
  private readonly ax = new Float32Array(POOL);
  private readonly ay = new Float32Array(POOL);
  private readonly az = new Float32Array(POOL);
  private readonly grav = new Float32Array(POOL);
  private readonly drag = new Float32Array(POOL);
  private readonly spin = new Float32Array(POOL);
  private readonly rx = new Float32Array(POOL);
  private readonly ry = new Float32Array(POOL);
  private readonly fade = new Float32Array(POOL);
  private readonly mode = new Float32Array(POOL);
  private readonly cx = new Float32Array(POOL);
  private readonly cy = new Float32Array(POOL);
  private readonly cz = new Float32Array(POOL);
  private readonly r0 = new Float32Array(POOL);
  private readonly y0 = new Float32Array(POOL);
  private readonly ang = new Float32Array(POOL);
  private readonly w0 = new Float32Array(POOL);
  private readonly cols: Float32Array;
  private readonly tiles: Float32Array;
  private readonly lists: Float32Array[];
  private readonly colorAttr: THREE.InstancedBufferAttribute;
  private readonly tileAttr: THREE.InstancedBufferAttribute;

  constructor() {
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.tiles = new Float32Array(POOL).fill(BLANK);
    this.tileAttr = new THREE.InstancedBufferAttribute(this.tiles, 1);
    this.tileAttr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aTile', this.tileAttr);
    this.atlas = makeAtlas();
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: this.atlas });
    this.mat.name = 'models:particles';
    if (this.atlas) {
      this.mat.onBeforeCompile = shader => {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float aTile;')
          .replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\n\tvMapUv.x = (vMapUv.x + aTile) / ${TILES}.0;\n#endif`);
      };
      this.mat.customProgramCacheKey = () => 'models-particles-atlas';
    }
    this.object = new THREE.InstancedMesh(this.geo, this.mat, POOL);
    this.object.name = 'particles';
    this.object.frustumCulled = false;
    this.object.castShadow = false;
    this.object.receiveShadow = false;
    this.cols = new Float32Array(POOL * 3);
    this.colorAttr = new THREE.InstancedBufferAttribute(this.cols, 3);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    this.object.instanceColor = this.colorAttr;
    this.object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.object.count = 0;
    this.lists = [
      this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.age, this.life, this.size, this.ax, this.ay, this.az,
      this.grav, this.drag, this.spin, this.rx, this.ry, this.fade, this.mode, this.cx, this.cy, this.cz, this.r0, this.y0,
      this.ang, this.w0, this.tiles,
    ];
  }

  /** Liczba aktywnych cząstek (diagnostyka/testy). */
  get active(): number {
    return this.n;
  }

  private r(a: number, b: number): number {
    return a + (b - a) * this.rnd();
  }

  private spawn(): number {
    if (this.n >= POOL) {
      // pula pełna — nadpisujemy najstarszą (indeks 0 jest zwykle najstarszy)
      return 0;
    }
    return this.n++;
  }

  private emit(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    o: { life: number; size: number; grav: number; drag: number; color: RGB; fade?: Fade; spin?: number; aspect?: RGB; tile?: number },
  ): void {
    const i = this.spawn();
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.age[i] = 0;
    this.life[i] = o.life;
    this.size[i] = o.size;
    const a = o.aspect ?? [1, 1, 1];
    this.ax[i] = a[0];
    this.ay[i] = a[1];
    this.az[i] = a[2];
    this.grav[i] = o.grav;
    this.drag[i] = o.drag;
    this.spin[i] = o.spin ?? this.r(-6, 6);
    this.rx[i] = this.r(0, TAU);
    this.ry[i] = this.r(0, TAU);
    this.fade[i] = o.fade ?? Fade.Shrink;
    this.mode[i] = Mode.Ballistic;
    this.tiles[i] = o.tile ?? BLANK;
    this.cols[i * 3] = o.color[0];
    this.cols[i * 3 + 1] = o.color[1];
    this.cols[i * 3 + 2] = o.color[2];
  }

  /** Losowy kierunek na sferze * prędkość (+ składowa w górę). */
  private dir(speed: number, up = 0, flat = 1): [number, number, number] {
    const u = this.r(-1, 1);
    const th = this.r(0, TAU);
    const s = Math.sqrt(1 - u * u);
    return [Math.cos(th) * s * speed, u * speed * flat + up, Math.sin(th) * s * speed];
  }

  burst(pos: THREE.Vector3, kind: BurstKind): void {
    const { x, y, z } = pos;
    const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(this.rnd() * arr.length) % arr.length] as T;
    switch (kind) {
      case 'sparkle':
        for (let k = 0; k < 28; k++) {
          const [vx, vy, vz] = this.dir(this.r(1.4, 3.2), 1.6);
          this.emit(x, y, z, vx, vy, vz, { life: this.r(0.7, 1.25), size: this.r(0.06, 0.13), grav: 2.4, drag: 1.8, color: pick([C.gold, C.pink, C.white, C.gold]), fade: Fade.Twinkle });
        }
        break;
      case 'hit':
        for (let k = 0; k < 14; k++) {
          const [vx, vy, vz] = this.dir(this.r(2.5, 4.5), 1);
          this.emit(x, y, z, vx, vy, vz, { life: this.r(0.3, 0.55), size: this.r(0.08, 0.15), grav: 6, drag: 3, color: pick([C.hitWhite, C.warm, C.hitWhite]) });
        }
        break;
      case 'crit':
        for (let k = 0; k < 30; k++) {
          const [vx, vy, vz] = this.dir(this.r(3.5, 6.5), 1.5);
          this.emit(x, y, z, vx, vy, vz, { life: this.r(0.5, 0.85), size: this.r(0.13, 0.27), grav: 5, drag: 2.6, color: pick([C.yellow, C.yellow, C.white, C.gold]) });
        }
        break;
      case 'block':
        for (let k = 0; k < 16; k++) {
          const [vx, vy, vz] = this.dir(this.r(2.2, 4.2), 1.8, 0.35);
          this.emit(x, y, z, vx, vy, vz, {
            life: this.r(0.45, 0.75), size: this.r(0.14, 0.24), grav: 7, drag: 2, color: pick([C.blue, C.cyan, C.blue]),
            aspect: [1, 0.22, 0.7], spin: this.r(-14, 14),
          });
        }
        break;
      case 'heal':
        for (let k = 0; k < 20; k++) {
          const a = this.r(0, TAU);
          const rr = this.r(0.15, 0.6);
          this.emit(x + Math.cos(a) * rr, y + this.r(-0.6, 0.2), z + Math.sin(a) * rr, this.r(-0.2, 0.2), this.r(1.0, 2.1), this.r(-0.2, 0.2), {
            life: this.r(0.9, 1.5), size: this.r(0.07, 0.13), grav: -0.6, drag: 0.6, color: pick([C.green, C.mint]), fade: Fade.Twinkle, spin: this.r(-2, 2),
          });
        }
        break;
      case 'catch': {
        for (let k = 0; k < 20; k++) {
          const a = (k / 20) * TAU;
          const sp = k % 4 === 0 ? 4.8 : 3.2;
          this.emit(x, y, z, Math.cos(a) * sp, this.r(0.5, 1.5), Math.sin(a) * sp, { life: this.r(0.6, 0.9), size: k % 4 === 0 ? 0.17 : 0.1, grav: 2.5, drag: 2.4, color: k % 4 === 0 ? C.gold : pick([C.white, C.cyan, C.pink]) });
        }
        for (let k = 0; k < 12; k++) {
          const [vx, vy, vz] = this.dir(this.r(1, 2.2), 3.4, 0.4);
          this.emit(x, y, z, vx, vy, vz, { life: this.r(0.8, 1.2), size: this.r(0.06, 0.11), grav: 4, drag: 1, color: pick([C.gold, C.white]), fade: Fade.Twinkle });
        }
        break;
      }
      case 'digits':
        for (let k = 0; k < 7; k++) {
          const a = this.r(0, TAU);
          const sp = this.r(0.4, 1.2);
          this.emit(x, y, z, Math.cos(a) * sp, this.r(3.2, 4.6), Math.sin(a) * sp, {
            life: this.r(1.1, 1.45), size: this.r(0.2, 0.26), grav: 5.2, drag: 0.5, color: C.digit, fade: Fade.Hold, spin: this.r(-2.5, 2.5),
            tile: Math.floor(this.rnd() * 10),
          });
        }
        for (let k = 0; k < 10; k++) {
          const [vx, vy, vz] = this.dir(this.r(0.8, 2), 2.5);
          this.emit(x, y, z, vx, vy, vz, { life: this.r(0.6, 1), size: this.r(0.05, 0.09), grav: 3, drag: 1.5, color: C.gold, fade: Fade.Twinkle });
        }
        break;
      case 'poof':
        for (let k = 0; k < 16; k++) {
          const [vx, vy, vz] = this.dir(this.r(1.0, 2.2), 0.5, 0.4);
          this.emit(x + vx * 0.05, y + this.r(-0.2, 0.2), z + vz * 0.05, vx, vy, vz, { life: this.r(0.5, 0.85), size: this.r(0.18, 0.32), grav: -0.4, drag: 3.6, color: C.smoke, fade: Fade.Poof, spin: this.r(-3, 3) });
        }
        break;
    }
  }

  /**
   * Wir świecących kostek wokół środka, zbiegający się do środka po `duration` s (przemiana).
   */
  vortex(center: THREE.Vector3, o: VortexOpts): void {
    const cols = o.colors ?? [C.gold, C.pink, C.lilac, C.white, C.cyan];
    for (let k = 0; k < o.count; k++) {
      const i = this.spawn();
      this.age[i] = 0;
      this.life[i] = o.duration * this.r(0.92, 1.05);
      this.size[i] = (o.size ?? 0.13) * this.r(0.7, 1.35);
      this.ax[i] = this.ay[i] = this.az[i] = 1;
      this.spin[i] = this.r(-8, 8);
      this.rx[i] = this.r(0, TAU);
      this.ry[i] = this.r(0, TAU);
      this.fade[i] = Fade.Shrink;
      this.mode[i] = Mode.Vortex;
      this.cx[i] = center.x;
      this.cy[i] = center.y;
      this.cz[i] = center.z;
      this.r0[i] = o.radius * this.r(0.35, 1);
      this.y0[i] = this.r(-o.height / 2, o.height / 2);
      this.ang[i] = this.r(0, TAU);
      this.w0[i] = this.r(4, 7);
      this.tiles[i] = BLANK;
      const c = cols[k % cols.length] ?? C.white;
      this.cols[i * 3] = c[0];
      this.cols[i * 3 + 1] = c[1];
      this.cols[i * 3 + 2] = c[2];
      this.px[i] = center.x;
      this.py[i] = center.y;
      this.pz[i] = center.z;
    }
  }

  private kill(i: number): void {
    const last = this.n - 1;
    if (i !== last) {
      for (const a of this.lists) a[i] = a[last] ?? 0;
      this.cols[i * 3] = this.cols[last * 3] ?? 0;
      this.cols[i * 3 + 1] = this.cols[last * 3 + 1] ?? 0;
      this.cols[i * 3 + 2] = this.cols[last * 3 + 2] ?? 0;
    }
    this.n--;
  }

  update(dt: number): void {
    const d = Math.min(Math.max(dt, 0), 0.1);
    let i = 0;
    while (i < this.n) {
      const age = (this.age[i] ?? 0) + d;
      const life = this.life[i] ?? 1;
      if (age >= life) {
        this.kill(i);
        continue;
      }
      this.age[i] = age;
      const u = age / life;
      let x: number;
      let y: number;
      let z: number;
      if (this.mode[i] === Mode.Vortex) {
        const w = (this.w0[i] ?? 5) * (1 + 2.2 * u);
        const a = (this.ang[i] ?? 0) + w * d;
        this.ang[i] = a;
        const rad = (this.r0[i] ?? 0.5) * (1 + 0.7 * Math.sin(Math.min(1, u * 1.4) * Math.PI)) * (1 - u * u * u);
        x = (this.cx[i] ?? 0) + Math.cos(a) * rad;
        z = (this.cz[i] ?? 0) + Math.sin(a) * rad;
        y = (this.cy[i] ?? 0) + (this.y0[i] ?? 0) * (1 - u * u) + 0.35 * Math.sin(u * Math.PI);
      } else {
        const k = Math.exp(-(this.drag[i] ?? 0) * d);
        const vx = (this.vx[i] ?? 0) * k;
        const vy = (this.vy[i] ?? 0) * k - (this.grav[i] ?? 0) * d;
        const vz = (this.vz[i] ?? 0) * k;
        x = (this.px[i] ?? 0) + vx * d;
        y = (this.py[i] ?? 0) + vy * d;
        z = (this.pz[i] ?? 0) + vz * d;
        this.vx[i] = vx;
        this.vy[i] = vy;
        this.vz[i] = vz;
      }
      this.px[i] = x;
      this.py[i] = y;
      this.pz[i] = z;

      let s = this.size[i] ?? 0.1;
      const f = this.fade[i];
      if (f === Fade.Poof) s *= (0.5 + 0.9 * clamp01(u * 3)) * (1 - u * u);
      else if (f === Fade.Twinkle) s *= (u < 0.1 ? u / 0.1 : 1 - u * u) * (0.75 + 0.25 * Math.sin(age * 30 + i));
      else if (f === Fade.Hold) s *= u < 0.08 ? u / 0.08 : u > 0.8 ? 1 - (u - 0.8) / 0.2 : 1;
      else s *= u < 0.08 ? u / 0.08 : 1 - u * u;
      const spin = (this.spin[i] ?? 0) * age;
      _e.set((this.rx[i] ?? 0) + spin, (this.ry[i] ?? 0) + spin * 0.7, 0);
      _q.setFromEuler(_e);
      _p.set(x, y, z);
      _s.set(s * (this.ax[i] ?? 1), s * (this.ay[i] ?? 1), s * (this.az[i] ?? 1));
      _m.compose(_p, _q, _s);
      this.object.setMatrixAt(i, _m);
      i++;
    }
    this.object.count = this.n;
    // wysyłamy na GPU tylko aktywny zakres (i nic, gdy nie ma cząstek)
    if (this.n > 0 || this.lastN > 0) {
      const m = this.object.instanceMatrix;
      m.clearUpdateRanges();
      m.addUpdateRange(0, Math.max(1, this.n) * 16);
      m.needsUpdate = true;
      this.colorAttr.clearUpdateRanges();
      this.colorAttr.addUpdateRange(0, Math.max(1, this.n) * 3);
      this.colorAttr.needsUpdate = true;
      this.tileAttr.clearUpdateRanges();
      this.tileAttr.addUpdateRange(0, Math.max(1, this.n));
      this.tileAttr.needsUpdate = true;
    }
    this.lastN = this.n;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
    this.atlas?.dispose();
    this.n = 0;
  }
}

export { C as PARTICLE_COLORS };
