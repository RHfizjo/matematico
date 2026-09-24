/**
 * Budowniczy modeli kostkowych.
 *
 * Model opisujemy w JEDNYM układzie współrzędnych (stopy na y=0, przód +Z, 1 = 1 kostka):
 *   b.pivot('head', 'all', [0, 1.1, 0]);             // punkt obrotu części (bez obrotu spoczynkowego)
 *   b.box('head', [0.6, 0.6, 0.56], [0, 1.4, 0], '#f2c9a0');   // środek kostki w układzie modelu
 * build() łączy wszystkie zwykłe kostki danej części w jedną siatkę (kolory w wierzchołkach,
 * lekkie przyciemnienie dołu kostki = „voxelowe” cieniowanie), a kostki świecące / nazwane / grupowe
 * wydziela do osobnych siatek. Dzięki temu model ma zwykle 5–20 siatek.
 */
import * as THREE from 'three';
import { glowMaterial, ownedClone } from './materials';

export type V3 = readonly [number, number, number];

export interface BoxOpts {
  /** Obrót kostki wokół jej środka (Euler XYZ, radiany). */
  rot?: V3;
  /** Jasność dolnych wierzchołków (0..1, domyślnie 0.8) — pionowy gradient „okluzji”. */
  shade?: number;
  /** Świecenie: kostka dostaje wspólny materiał emisyjny w swoim kolorze o tej intensywności. */
  glow?: number;
  /** Osobna siatka o tej nazwie (do niezależnej animacji / podmiany materiału). */
  name?: string;
  /** Jawny (wspólny) materiał — osobna siatka. */
  mat?: THREE.MeshLambertMaterial;
  /** Grupa z WŁASNĄ kopią materiału bazowego (animowany kolor/emisja), np. 'cap', 'crystal'. */
  group?: string;
  /** Rzucanie cienia (domyślnie: tak, poza świecącymi). */
  shadow?: boolean;
}

interface BoxRec {
  size: V3;
  center: V3;
  color: THREE.Color;
  opts: BoxOpts;
}

interface PivotRec {
  name: string;
  parent: string | null;
  abs: V3;
  obj: THREE.Group;
  boxes: BoxRec[];
}

export interface GroupRec {
  mat: THREE.MeshLambertMaterial;
  meshes: THREE.Mesh[];
}

export interface BuiltModel {
  /** Część 'all' — korzeń animacji (w stopach modelu). */
  all: THREE.Group;
  pivots: Map<string, THREE.Object3D>;
  meshes: THREE.Mesh[];
  /** Siatki na wspólnym materiale bazowym (podmieniane na własną kopię przy podświetleniu/błysku). */
  baseMeshes: THREE.Mesh[];
  named: Map<string, THREE.Mesh>;
  groups: Map<string, GroupRec>;
  ownedMaterials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
}

// Ściany kostki: normalna n oraz osie u, v takie, że u × v = n (kolejność CCW z zewnątrz).
const FACES: { n: V3; u: V3; v: V3 }[] = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];
const CORNERS: [number, number][] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _nrm = new THREE.Vector3();

/** Buduje geometrię z listy kostek (przesuniętych o -origin). Eksportowane do testów. */
export function mergeBoxes(boxes: readonly BoxRec[], origin: V3): THREE.BufferGeometry {
  const vCount = boxes.length * 24;
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  const idx = vCount > 65535 ? new Uint32Array(boxes.length * 36) : new Uint16Array(boxes.length * 36);
  let v = 0;
  let ii = 0;
  for (const b of boxes) {
    const [sx, sy, sz] = b.size;
    const shade = b.opts.shade ?? 0.8;
    const rot = b.opts.rot;
    if (rot) _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
    for (const f of FACES) {
      const base = v;
      for (const [su, sv] of CORNERS) {
        const ux = 0.5 * (f.n[0] + su * f.u[0] + sv * f.v[0]);
        const uy = 0.5 * (f.n[1] + su * f.u[1] + sv * f.v[1]);
        const uz = 0.5 * (f.n[2] + su * f.u[2] + sv * f.v[2]);
        _p.set(ux * sx, uy * sy, uz * sz);
        _nrm.set(f.n[0], f.n[1], f.n[2]);
        if (rot) {
          _p.applyQuaternion(_q);
          _nrm.applyQuaternion(_q);
        }
        pos[v * 3] = _p.x + b.center[0] - origin[0];
        pos[v * 3 + 1] = _p.y + b.center[1] - origin[1];
        pos[v * 3 + 2] = _p.z + b.center[2] - origin[2];
        nor[v * 3] = _nrm.x;
        nor[v * 3 + 1] = _nrm.y;
        nor[v * 3 + 2] = _nrm.z;
        const k = shade + (1 - shade) * (uy + 0.5);
        col[v * 3] = b.color.r * k;
        col[v * 3 + 1] = b.color.g * k;
        col[v * 3 + 2] = b.color.b * k;
        v++;
      }
      idx[ii++] = base;
      idx[ii++] = base + 1;
      idx[ii++] = base + 2;
      idx[ii++] = base;
      idx[ii++] = base + 2;
      idx[ii++] = base + 3;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export class ModelBuilder {
  private readonly recs = new Map<string, PivotRec>();
  private readonly order: PivotRec[] = [];
  private readonly groupMats = new Map<string, THREE.MeshLambertMaterial>();

  /**
   * @param base materiał bazowy (wspólny) dla zwykłych kostek
   * @param k    skala całego modelu (mnoży rozmiary i pozycje podawane w box()/pivot())
   */
  constructor(
    private readonly base: THREE.MeshLambertMaterial,
    private readonly k = 1,
  ) {
    const all: PivotRec = { name: 'all', parent: null, abs: [0, 0, 0], obj: new THREE.Group(), boxes: [] };
    all.obj.name = 'all';
    this.recs.set('all', all);
    this.order.push(all);
  }

  /** Nowa część (punkt obrotu) w pozycji `at` (układ modelu), podpięta pod `parent`. */
  pivot(name: string, parent: string, at: V3): this {
    if (this.recs.has(name)) throw new Error(`pivot "${name}" already exists`);
    const p = this.recs.get(parent);
    if (!p) throw new Error(`unknown parent pivot "${parent}"`);
    const k = this.k;
    const rec: PivotRec = { name, parent, abs: [at[0] * k, at[1] * k, at[2] * k], obj: new THREE.Group(), boxes: [] };
    rec.obj.name = name;
    this.recs.set(name, rec);
    this.order.push(rec);
    return this;
  }

  has(name: string): boolean {
    return this.recs.has(name);
  }

  /** Kostka o rozmiarze `size` i środku `center` (układ modelu), przypisana do części `pivot`. */
  box(pivot: string, size: V3, center: V3, color: string, opts: BoxOpts = {}): this {
    const p = this.recs.get(pivot);
    if (!p) throw new Error(`unknown pivot "${pivot}"`);
    const k = this.k;
    p.boxes.push({
      size: [size[0] * k, size[1] * k, size[2] * k],
      center: [center[0] * k, center[1] * k, center[2] * k],
      color: new THREE.Color(color),
      opts,
    });
    return this;
  }

  /** Para kostek symetrycznych względem osi X (środek podany dla strony +X). */
  pair(pivotPlus: string, pivotMinus: string, size: V3, center: V3, color: string, opts: BoxOpts = {}): this {
    this.box(pivotPlus, size, center, color, opts);
    const rot = opts.rot ? ([opts.rot[0], -opts.rot[1], -opts.rot[2]] as V3) : undefined;
    this.box(pivotMinus, size, [-center[0], center[1], center[2]], color, rot ? { ...opts, rot } : opts);
    return this;
  }

  build(): BuiltModel {
    const pivots = new Map<string, THREE.Object3D>();
    const meshes: THREE.Mesh[] = [];
    const baseMeshes: THREE.Mesh[] = [];
    const named = new Map<string, THREE.Mesh>();
    const groups = new Map<string, GroupRec>();
    const ownedMaterials: THREE.Material[] = [];
    const geometries: THREE.BufferGeometry[] = [];

    for (const rec of this.order) {
      pivots.set(rec.name, rec.obj);
      if (rec.parent) {
        const par = this.recs.get(rec.parent);
        if (!par) throw new Error('bad parent');
        rec.obj.position.set(rec.abs[0] - par.abs[0], rec.abs[1] - par.abs[1], rec.abs[2] - par.abs[2]);
        par.obj.add(rec.obj);
      }
      // Podział kostek na siatki.
      const buckets = new Map<string, { boxes: BoxRec[]; mat: THREE.MeshLambertMaterial; kind: 'base' | 'other' | 'group'; name?: string; group?: string }>();
      let uniq = 0;
      for (const b of rec.boxes) {
        let key: string;
        let mat: THREE.MeshLambertMaterial;
        let kind: 'base' | 'other' | 'group' = 'other';
        if (b.opts.name) {
          key = `name:${b.opts.name}:${uniq++}`;
          mat = b.opts.mat ?? (b.opts.glow !== undefined ? glowMaterial(`#${b.color.getHexString()}`, b.opts.glow) : this.base);
          if (mat === this.base) kind = 'base';
        } else if (b.opts.group) {
          key = `group:${b.opts.group}`;
          let gm = this.groupMats.get(b.opts.group);
          if (!gm) {
            gm = ownedClone(this.base);
            gm.name = `group:${b.opts.group}`;
            this.groupMats.set(b.opts.group, gm);
            ownedMaterials.push(gm);
          }
          mat = gm;
          kind = 'group';
        } else if (b.opts.mat) {
          key = `mat:${b.opts.mat.uuid}`;
          mat = b.opts.mat;
        } else if (b.opts.glow !== undefined) {
          const hex = `#${b.color.getHexString()}`;
          key = `glow:${hex}:${b.opts.glow}`;
          mat = glowMaterial(hex, b.opts.glow);
        } else {
          key = 'base';
          mat = this.base;
          kind = 'base';
        }
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { boxes: [], mat, kind, name: b.opts.name, group: b.opts.group };
          buckets.set(key, bucket);
        }
        bucket.boxes.push(b);
      }
      for (const bucket of buckets.values()) {
        const geo = mergeBoxes(bucket.boxes, rec.abs);
        geometries.push(geo);
        const mesh = new THREE.Mesh(geo, bucket.mat);
        const glowing = bucket.boxes.every(b => b.opts.glow !== undefined);
        const shadowOpt = bucket.boxes.find(b => b.opts.shadow !== undefined)?.opts.shadow;
        mesh.castShadow = shadowOpt ?? !glowing;
        mesh.receiveShadow = false;
        mesh.name = bucket.name ?? bucket.group ?? `${rec.name}:${bucket.kind}`;
        rec.obj.add(mesh);
        meshes.push(mesh);
        if (bucket.kind === 'base') baseMeshes.push(mesh);
        if (bucket.name) named.set(bucket.name, mesh);
        if (bucket.kind === 'group' && bucket.group) {
          let g = groups.get(bucket.group);
          if (!g) {
            g = { mat: bucket.mat, meshes: [] };
            groups.set(bucket.group, g);
          }
          g.meshes.push(mesh);
        }
      }
    }
    const all = this.recs.get('all');
    if (!all) throw new Error('no root');
    return { all: all.obj, pivots, meshes, baseMeshes, named, groups, ownedMaterials, geometries };
  }
}
