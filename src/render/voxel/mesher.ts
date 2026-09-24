/**
 * Greedy mesher z okluzją otoczenia w wierzchołkach (AO) i deterministycznym zróżnicowaniem koloru.
 * Czyste funkcje (bez three.js, bez DOM) — testy w mesher.test.ts.
 *
 * Zasady:
 *  - ściana kostki A w kierunku sąsiada B powstaje, gdy A jest nieprzezroczysta, a B nie;
 *  - AO liczone klasycznie (0fps „Ambient occlusion for Minecraft-like worlds”): dla każdego narożnika
 *    sprawdzamy 2 boki i narożnik w warstwie sąsiada; wartość 0..3 (3 = brak zasłonięcia);
 *  - łączymy tylko ściany o tym samym bloku, tym samym poziomie koloru i IDENTYCZNYM AO narożników
 *    (dzięki spójności AO na wspólnych wierzchołkach scalony prostokąt interpoluje się poprawnie);
 *  - przekątna czworokąta idzie przez najciemniejszy narożnik (brak anizotropii AO).
 */
import { FACE_BOTTOM, FACE_SIDE, FACE_TOP, JITTER_LEVELS, type BlockTable } from './blocks';
import type { PaddedVolume } from './world';
import { hash3 } from '../util/rng';

export interface MeshArrays {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  /** Na wierzchołek: [jasność AO 0..1, kod materiału, siła emisji]. */
  vox: Float32Array;
  indices: Uint32Array;
  quads: number;
  vertexCount: number;
}

export interface MeshOptions {
  seed?: number;
  /** Poziom koloru 0..JITTER_LEVELS−1 dla kostki; domyślnie hash pozycji. */
  jitter?: (x: number, y: number, z: number, id: number) => number;
  /** Pomiń ściany dolne (−Y) kostek poniżej tej wysokości świata (spód wyspy — kamera go nie widzi). */
  skipBottomBelow?: number;
  /** false = bez łączenia (każda ściana osobno). */
  greedy?: boolean;
  /** Jasność dla AO = 0,1,2,3. */
  aoCurve?: readonly [number, number, number, number];
}

export const DEFAULT_AO_CURVE = [0.42, 0.62, 0.81, 1] as const;

/** Wartość AO narożnika (0 = najciemniej, 3 = odsłonięty). */
export function vertexAO(side1: number, side2: number, corner: number): number {
  if (side1 && side2) return 0;
  return 3 - (side1 + side2 + corner);
}

class F32 {
  a: Float32Array;
  n = 0;
  constructor(cap: number) {
    this.a = new Float32Array(cap);
  }
  push3(x: number, y: number, z: number): void {
    if (this.n + 3 > this.a.length) this.grow();
    this.a[this.n++] = x;
    this.a[this.n++] = y;
    this.a[this.n++] = z;
  }
  private grow(): void {
    const b = new Float32Array(this.a.length * 2);
    b.set(this.a);
    this.a = b;
  }
  done(): Float32Array {
    return this.a.slice(0, this.n);
  }
}

class U32 {
  a: Uint32Array;
  n = 0;
  constructor(cap: number) {
    this.a = new Uint32Array(cap);
  }
  push(v: number): void {
    if (this.n + 1 > this.a.length) {
      const b = new Uint32Array(this.a.length * 2);
      b.set(this.a);
      this.a = b;
    }
    this.a[this.n++] = v;
  }
  done(): Uint32Array {
    return this.a.slice(0, this.n);
  }
}

export function greedyMesh(vol: PaddedVolume, table: BlockTable, opts: MeshOptions = {}): MeshArrays {
  const { sx, sy, sz, data } = vol;
  const origin = [vol.ox, vol.oy, vol.oz];
  const px = sx + 2;
  const pz = sz + 2;
  const dims = [sx, sy, sz];
  // Kroki indeksu w danych z ramką dla osi x, y, z.
  const S = [1, px * pz, px];
  const opaque = table.opaque;
  const seed = opts.seed ?? 0;
  const greedy = opts.greedy !== false;
  const aoCurve = opts.aoCurve ?? DEFAULT_AO_CURVE;
  const skipBelow = opts.skipBottomBelow ?? -Infinity;
  const jitterFn = opts.jitter;

  const pos = new F32(4096);
  const nrm = new F32(4096);
  const col = new F32(4096);
  const vox = new F32(4096);
  const idx = new U32(4096);
  let quads = 0;
  let vcount = 0;

  const op = (i: number): number => opaque[data[i] ?? 0] ?? 0;
  const c = [0, 0, 0];

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const nu = dims[u] ?? 0;
    const nv = dims[v] ?? 0;
    const nd = dims[d] ?? 0;
    const Sd = S[d] ?? 0;
    const Su = S[u] ?? 0;
    const Sv = S[v] ?? 0;
    const mask = new Int32Array(nu * nv);
    for (const s of [1, -1]) {
      const faceClass = d === 1 ? (s > 0 ? FACE_TOP : FACE_BOTTOM) : FACE_SIDE;
      for (let slice = 0; slice < nd; slice++) {
        // 1) Maska ścian w tej warstwie.
        let n = 0;
        let any = false;
        for (let j = 0; j < nv; j++) {
          for (let i = 0; i < nu; i++, n++) {
            const ip = (slice + 1) * Sd + (i + 1) * Su + (j + 1) * Sv;
            const a = data[ip] ?? 0;
            let key = 0;
            if (a !== 0 && opaque[a]) {
              const q = ip + s * Sd;
              if (!op(q)) {
                c[d] = slice;
                c[u] = i;
                c[v] = j;
                const wx = (origin[0] ?? 0) + (c[0] ?? 0);
                const wy = (origin[1] ?? 0) + (c[1] ?? 0);
                const wz = (origin[2] ?? 0) + (c[2] ?? 0);
                if (!(faceClass === FACE_BOTTOM && wy < skipBelow)) {
                  let ao0 = 3;
                  let ao1 = 3;
                  let ao2 = 3;
                  let ao3 = 3;
                  if (!(table.emissive[a] ?? 0)) {
                    const mu = op(q - Su);
                    const pu = op(q + Su);
                    const mv = op(q - Sv);
                    const pv = op(q + Sv);
                    ao0 = vertexAO(mu, mv, op(q - Su - Sv));
                    ao1 = vertexAO(pu, mv, op(q + Su - Sv));
                    ao2 = vertexAO(pu, pv, op(q + Su + Sv));
                    ao3 = vertexAO(mu, pv, op(q - Su + Sv));
                  }
                  let jl = jitterFn ? jitterFn(wx, wy, wz, a) : Math.floor(hash3(wx, wy, wz, seed) * JITTER_LEVELS);
                  jl = jl < 0 ? 0 : jl >= JITTER_LEVELS ? JITTER_LEVELS - 1 : jl | 0;
                  key = a | (ao0 << 8) | (ao1 << 10) | (ao2 << 12) | (ao3 << 14) | (jl << 16);
                  any = true;
                }
              }
            }
            mask[n] = key;
          }
        }
        if (!any) continue;
        // 2) Łączenie prostokątów.
        const plane = slice + (s > 0 ? 1 : 0);
        n = 0;
        for (let j = 0; j < nv; j++) {
          for (let i = 0; i < nu; ) {
            const k = mask[n] ?? 0;
            if (k === 0) {
              i++;
              n++;
              continue;
            }
            let w = 1;
            let h = 1;
            if (greedy) {
              while (i + w < nu && mask[n + w] === k) w++;
              outer: while (j + h < nv) {
                for (let t = 0; t < w; t++) if (mask[n + t + h * nu] !== k) break outer;
                h++;
              }
            }
            // Emisja czworokąta.
            const id = k & 255;
            const a0 = (k >> 8) & 3;
            const a1 = (k >> 10) & 3;
            const a2 = (k >> 12) & 3;
            const a3 = (k >> 14) & 3;
            const jl = (k >> 16) & 7;
            const ci = ((id * 3 + faceClass) * JITTER_LEVELS + jl) * 3;
            const cr = table.color[ci] ?? 1;
            const cg = table.color[ci + 1] ?? 1;
            const cb = table.color[ci + 2] ?? 1;
            const matCode = table.mat[id * 3 + faceClass] ?? 0;
            const emis = table.emissive[id] ?? 0;
            const nx = d === 0 ? s : 0;
            const ny = d === 1 ? s : 0;
            const nz = d === 2 ? s : 0;
            const corners: [number, number, number][] = [
              [i, j, a0],
              [i + w, j, a1],
              [i + w, j + h, a2],
              [i, j + h, a3],
            ];
            for (const [cu, cv, ao] of corners) {
              c[d] = plane;
              c[u] = cu;
              c[v] = cv;
              pos.push3((origin[0] ?? 0) + (c[0] ?? 0), (origin[1] ?? 0) + (c[1] ?? 0), (origin[2] ?? 0) + (c[2] ?? 0));
              nrm.push3(nx, ny, nz);
              col.push3(cr, cg, cb);
              vox.push3(aoCurve[ao] ?? 1, matCode, emis);
            }
            const b = vcount;
            const flip = a0 + a2 > a1 + a3;
            if (s > 0) {
              if (!flip) {
                idx.push(b); idx.push(b + 1); idx.push(b + 2);
                idx.push(b); idx.push(b + 2); idx.push(b + 3);
              } else {
                idx.push(b + 1); idx.push(b + 2); idx.push(b + 3);
                idx.push(b + 1); idx.push(b + 3); idx.push(b);
              }
            } else if (!flip) {
              idx.push(b); idx.push(b + 2); idx.push(b + 1);
              idx.push(b); idx.push(b + 3); idx.push(b + 2);
            } else {
              idx.push(b + 1); idx.push(b + 3); idx.push(b + 2);
              idx.push(b + 1); idx.push(b); idx.push(b + 3);
            }
            vcount += 4;
            quads++;
            for (let l = 0; l < h; l++) for (let t = 0; t < w; t++) mask[n + t + l * nu] = 0;
            i += w;
            n += w;
          }
        }
      }
    }
  }

  return {
    positions: pos.done(),
    normals: nrm.done(),
    colors: col.done(),
    vox: vox.done(),
    indices: idx.done(),
    quads,
    vertexCount: vcount,
  };
}

export interface WaterArrays {
  positions: Float32Array;
  /** Na wierzchołek: [bliskość brzegu 0..1, głębokość 0..1]. */
  water: Float32Array;
  indices: Uint32Array;
  quads: number;
}

/**
 * Powierzchnia wody: górne ściany kostek wody bez wody nad sobą, na wysokości y + surface.
 * Brzeg (sąsiad nie-woda wokół wierzchołka) i głębokość w atrybucie — shader robi pianę i odcień.
 */
export function meshWater(vol: PaddedVolume, waterId: number, surface = 0.82): WaterArrays {
  const { sx, sy, sz, data } = vol;
  const px = sx + 2;
  const pz = sz + 2;
  const at = (x: number, y: number, z: number): number => data[((y + 1) * pz + (z + 1)) * px + (x + 1)] ?? 0;
  const pos = new F32(1024);
  const wat = new F32(1024);
  const idx = new U32(1024);
  let quads = 0;
  let vc = 0;
  const depthAt = (x: number, y: number, z: number): number => {
    let dpt = 0;
    for (let k = 0; k < 4; k++) {
      if (at(x, y - k, z) === waterId) dpt++;
      else break;
    }
    return dpt / 4;
  };
  for (let y = 0; y < sy; y++)
    for (let z = 0; z < sz; z++)
      for (let x = 0; x < sx; x++) {
        if (at(x, y, z) !== waterId) continue;
        if (at(x, y + 1, z) === waterId) continue;
        const corners: [number, number][] = [
          [0, 0],
          [0, 1],
          [1, 1],
          [1, 0],
        ];
        for (const [dx, dz] of corners) {
          // Cztery komórki wokół wierzchołka.
          let shore = 0;
          let depth = 0;
          for (const [ox, oz] of [
            [dx - 1, dz - 1],
            [dx, dz - 1],
            [dx - 1, dz],
            [dx, dz],
          ] as const) {
            if (at(x + ox, y, z + oz) !== waterId) shore = 1;
            depth += depthAt(x + ox, y, z + oz);
          }
          pos.push3(vol.ox + x + dx, vol.oy + y + surface, vol.oz + z + dz);
          wat.push3(shore, depth / 4, 0);
        }
        idx.push(vc); idx.push(vc + 1); idx.push(vc + 2);
        idx.push(vc); idx.push(vc + 2); idx.push(vc + 3);
        vc += 4;
        quads++;
      }
  // wat ma 3 składowe (trzecia zapasowa) — zwracamy 2 na wierzchołek.
  const w3 = wat.done();
  const w2 = new Float32Array((w3.length / 3) * 2);
  for (let i = 0, j = 0; i < w3.length; i += 3, j += 2) {
    w2[j] = w3[i] ?? 0;
    w2[j + 1] = w3[i + 1] ?? 0;
  }
  return { positions: pos.done(), water: w2, indices: idx.done(), quads };
}
