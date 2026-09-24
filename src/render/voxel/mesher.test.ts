import { describe, expect, it } from 'vitest';
import { B, blockTable, JITTER_LEVELS } from './blocks';
import { DEFAULT_AO_CURVE, greedyMesh, meshWater, vertexAO } from './mesher';
import { paddedFromDense, VoxelWorld } from './world';

const T = blockTable();
const flat = (): number => 0; // stały poziom koloru → maksymalne łączenie

function meshWorld(w: VoxelWorld, opts: Parameters<typeof greedyMesh>[2] = {}) {
  const vol = w.extract(w.minX, w.minY, w.minZ, w.maxX - w.minX + 1, w.maxY - w.minY + 1, w.maxZ - w.minZ + 1);
  return greedyMesh(vol, T, { jitter: flat, ...opts });
}

/** Ściany z danym wektorem normalnym. */
function facesWithNormal(m: ReturnType<typeof greedyMesh>, nx: number, ny: number, nz: number): number[] {
  const out: number[] = [];
  for (let q = 0; q < m.quads; q++) {
    const v = q * 4;
    if (m.normals[v * 3] === nx && m.normals[v * 3 + 1] === ny && m.normals[v * 3 + 2] === nz) out.push(q);
  }
  return out;
}

function quadArea(m: ReturnType<typeof greedyMesh>, q: number): number {
  const p = (i: number, c: number): number => m.positions[(q * 4 + i) * 3 + c] ?? 0;
  const ax = p(1, 0) - p(0, 0), ay = p(1, 1) - p(0, 1), az = p(1, 2) - p(0, 2);
  const bx = p(3, 0) - p(0, 0), by = p(3, 1) - p(0, 1), bz = p(3, 2) - p(0, 2);
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
  return Math.hypot(cx, cy, cz);
}

describe('VoxelWorld', () => {
  it('stores blocks sparsely across negative coordinates and chunk borders', () => {
    const w = new VoxelWorld();
    w.set(-1, 0, -17, B.stone);
    w.set(15, 16, 31, B.grass);
    expect(w.get(-1, 0, -17)).toBe(B.stone);
    expect(w.get(15, 16, 31)).toBe(B.grass);
    expect(w.get(0, 0, 0)).toBe(0);
    expect(w.chunkCount).toBe(2);
    expect(w.top(-1, -17)).toBe(0);
    expect(w.top(3, 3)).toBe(-Infinity);
  });
});

describe('vertexAO', () => {
  it('follows the classic 0fps rules', () => {
    expect(vertexAO(0, 0, 0)).toBe(3);
    expect(vertexAO(1, 0, 0)).toBe(2);
    expect(vertexAO(0, 0, 1)).toBe(2);
    expect(vertexAO(1, 0, 1)).toBe(1);
    expect(vertexAO(1, 1, 0)).toBe(0);
    expect(vertexAO(1, 1, 1)).toBe(0);
  });
});

describe('greedyMesh', () => {
  it('a single cube has 6 faces, 24 vertices, 12 triangles', () => {
    const w = new VoxelWorld();
    w.set(0, 0, 0, B.stone);
    const m = meshWorld(w);
    expect(m.quads).toBe(6);
    expect(m.vertexCount).toBe(24);
    expect(m.indices.length).toBe(36);
    // Brak sąsiadów → brak AO.
    for (let i = 0; i < m.vertexCount; i++) expect(m.vox[i * 3]).toBe(1);
  });

  it('merges a flat 8×8 slab into 6 quads', () => {
    const w = new VoxelWorld();
    w.fill(0, 0, 0, 7, 0, 7, B.grass);
    const m = meshWorld(w);
    expect(m.quads).toBe(6);
    const top = facesWithNormal(m, 0, 1, 0);
    expect(top.length).toBe(1);
    expect(quadArea(m, top[0] ?? 0)).toBeCloseTo(64);
  });

  it('without greedy the same slab has one quad per exposed face', () => {
    const w = new VoxelWorld();
    w.fill(0, 0, 0, 7, 0, 7, B.grass);
    const m = meshWorld(w, { greedy: false });
    // 64 góra + 64 dół + 4·8 boków
    expect(m.quads).toBe(64 + 64 + 32);
  });

  it('greedy merge preserves total exposed area', () => {
    const w = new VoxelWorld();
    // Nieregularny kształt: schodki i dziura.
    w.fill(0, 0, 0, 9, 0, 6, B.stone);
    w.fill(0, 1, 0, 4, 1, 6, B.stone);
    w.fill(0, 2, 0, 1, 2, 3, B.dirt);
    w.set(6, 0, 3, 0);
    const g = meshWorld(w);
    const n = meshWorld(w, { greedy: false });
    let ga = 0;
    let na = 0;
    for (let q = 0; q < g.quads; q++) ga += quadArea(g, q);
    for (let q = 0; q < n.quads; q++) na += quadArea(n, q);
    expect(ga).toBeCloseTo(na);
    expect(g.quads).toBeLessThan(n.quads);
    expect(n.quads).toBe(Math.round(na));
  });

  it('does not merge faces of different blocks', () => {
    const w = new VoxelWorld();
    w.fill(0, 0, 0, 3, 0, 0, B.stone);
    w.fill(4, 0, 0, 7, 0, 0, B.sand);
    const m = meshWorld(w);
    expect(facesWithNormal(m, 0, 1, 0).length).toBe(2);
  });

  it('does not merge faces with different jitter levels', () => {
    const w = new VoxelWorld();
    w.fill(0, 0, 0, 3, 0, 0, B.stone);
    const m = meshWorld(w, { jitter: (x) => x % JITTER_LEVELS });
    expect(facesWithNormal(m, 0, 1, 0).length).toBe(4);
    // Kolor zależy od poziomu → różne kolory na kolejnych ścianach.
    const tops = facesWithNormal(m, 0, 1, 0);
    const colors = new Set(tops.map((q) => m.colors[q * 12]));
    expect(colors.size).toBe(4);
  });

  it('computes AO where a wall meets the floor and never merges across different AO', () => {
    const w = new VoxelWorld();
    w.fill(0, 0, 0, 4, 0, 4, B.stone); // podłoga 5×5
    w.fill(0, 1, 0, 4, 1, 0, B.stone); // ściana wzdłuż x przy z = 0
    const m = meshWorld(w);
    const tops = facesWithNormal(m, 0, 1, 0);
    const floorTops = tops.filter((q) => m.positions[q * 12 + 1] === 1);
    // Rząd przy ścianie: 2 końce (inne AO) + środek, oraz reszta podłogi bez AO = 4.
    expect(floorTops.length).toBe(4);
    expect(tops.length).toBe(5);
    let checked = 0;
    for (const q of floorTops) {
      for (let k = 0; k < 4; k++) {
        const vi = q * 4 + k;
        const x = m.positions[vi * 3];
        const z = m.positions[vi * 3 + 2];
        const ao = m.vox[vi * 3];
        if (z === 1) {
          // Przy ścianie: bok + narożnik zasłonięte (AO 1); na końcach ściany tylko bok (AO 2).
          expect(ao).toBeCloseTo(x === 0 || x === 5 ? DEFAULT_AO_CURVE[2] : DEFAULT_AO_CURVE[1]);
          checked++;
        } else if (z !== undefined && z >= 2) {
          expect(ao).toBe(1);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('inner corner gets AO 0 (both sides occluded)', () => {
    const w = new VoxelWorld();
    w.fill(0, 0, 0, 2, 0, 2, B.stone);
    w.fill(0, 1, 0, 2, 1, 0, B.stone); // ściana z=0
    w.fill(0, 1, 0, 0, 1, 2, B.stone); // ściana x=0
    const m = meshWorld(w);
    let found = false;
    for (const q of facesWithNormal(m, 0, 1, 0)) {
      for (let k = 0; k < 4; k++) {
        const vi = q * 4 + k;
        if (m.positions[vi * 3] === 1 && m.positions[vi * 3 + 1] === 1 && m.positions[vi * 3 + 2] === 1) {
          expect(m.vox[vi * 3]).toBeCloseTo(DEFAULT_AO_CURVE[0]);
          found = true;
        }
      }
    }
    expect(found).toBe(true);
  });

  it('emissive blocks are not darkened by AO', () => {
    const w = new VoxelWorld();
    w.fill(0, 0, 0, 2, 0, 2, B.stone);
    w.set(1, 1, 1, B.crystal);
    w.set(0, 1, 1, B.stone);
    const m = meshWorld(w);
    for (let vi = 0; vi < m.vertexCount; vi++) {
      if ((m.vox[vi * 3 + 2] ?? 0) > 0) expect(m.vox[vi * 3]).toBe(1);
    }
  });

  it('winding matches the normal (counter-clockwise from outside)', () => {
    const w = new VoxelWorld();
    w.set(0, 0, 0, B.stone);
    w.set(1, 0, 0, B.stone);
    w.set(0, 1, 0, B.stone);
    const m = meshWorld(w);
    for (let t = 0; t < m.indices.length; t += 3) {
      const a = m.indices[t] ?? 0, b = m.indices[t + 1] ?? 0, c = m.indices[t + 2] ?? 0;
      const P = (i: number, k: number): number => m.positions[i * 3 + k] ?? 0;
      const e1 = [P(b, 0) - P(a, 0), P(b, 1) - P(a, 1), P(b, 2) - P(a, 2)];
      const e2 = [P(c, 0) - P(a, 0), P(c, 1) - P(a, 1), P(c, 2) - P(a, 2)];
      const n = [
        (e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0),
        (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0),
        (e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0),
      ];
      const dot = (n[0] ?? 0) * (m.normals[a * 3] ?? 0) + (n[1] ?? 0) * (m.normals[a * 3 + 1] ?? 0) + (n[2] ?? 0) * (m.normals[a * 3 + 2] ?? 0);
      expect(dot).toBeGreaterThan(0);
    }
  });

  it('skips bottom faces below a height when asked', () => {
    const w = new VoxelWorld();
    w.fill(0, 0, 0, 3, 3, 3, B.stone);
    const all = meshWorld(w);
    const skipped = meshWorld(w, { skipBottomBelow: 1 });
    expect(facesWithNormal(all, 0, -1, 0).length).toBe(1);
    expect(facesWithNormal(skipped, 0, -1, 0).length).toBe(0);
  });

  it('water is not meshed as a solid and does not hide neighbours', () => {
    const w = new VoxelWorld();
    w.set(0, 0, 0, B.stone);
    w.set(1, 0, 0, B.water);
    const m = meshWorld(w);
    expect(m.quads).toBe(6);
  });

  it('is deterministic', () => {
    const w = new VoxelWorld();
    w.fill(0, 0, 0, 5, 2, 5, B.grass);
    const vol = w.extract(0, 0, 0, 6, 3, 6);
    const a = greedyMesh(vol, T, { seed: 7 });
    const b = greedyMesh(vol, T, { seed: 7 });
    expect(Array.from(a.colors)).toEqual(Array.from(b.colors));
  });

  it('meshes dense volumes (tree models) with local origin', () => {
    const dense = new Uint8Array(3 * 3 * 3).fill(B.leaves);
    const vol = paddedFromDense(3, 3, 3, dense, -1, 0, -1);
    const m = greedyMesh(vol, T, { jitter: flat });
    expect(m.quads).toBe(6);
    let minX = Infinity;
    for (let i = 0; i < m.vertexCount; i++) minX = Math.min(minX, m.positions[i * 3] ?? 0);
    expect(minX).toBe(-1);
  });
});

describe('meshWater', () => {
  it('meshes only top surfaces and marks the shore', () => {
    const w = new VoxelWorld();
    w.fill(0, 0, 0, 4, 0, 4, B.sand);
    w.fill(1, 0, 1, 3, 0, 3, B.water);
    const vol = w.extract(0, 0, 0, 5, 1, 5);
    const m = meshWater(vol, B.water);
    expect(m.quads).toBe(9);
        // Wewnętrzne wierzchołki (4 pozycje, każda wspólna dla 4 czworokątów) nie dotykają brzegu.
    let inner = 0;
    for (let i = 0; i < m.quads * 4; i++) if (m.water[i * 2] === 0) inner++;
    expect(inner).toBe(16);
    expect(m.positions[1]).toBeCloseTo(0.82);
  });
});
