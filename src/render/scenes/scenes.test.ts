import { describe, expect, it } from 'vitest';
import type { SceneRequest } from '../../game/contracts';
import { Ground } from '../world/ground';
import { buildScene } from './index';
import type { SceneBuild } from './types';

const BASE_IDS = [
  'spawn',
  'portal-meadow',
  'station-zagroda',
  'station-skarbiec',
  'station-kuznia',
  'station-galeria',
  'station-tablica',
  'station-karty',
  'pen-center',
  ...Array.from({ length: 8 }, (_, i) => `glam-${i}`),
];
const MEADOW_IDS = ['spawn', 'portal-base', 'den-plusik', 'den-dopelniak', 'den-blizniak', 'spot-koniczynek', 'chest-1', 'chest-2', 'chest-3', 'gate-dungeon'];

function groundOf(b: SceneBuild): Ground {
  const g = new Ground(b.world, b.bounds);
  for (const [x, z] of b.blocked) g.block(x, z);
  return g;
}

/** BFS po kolumnach z krokiem ≤ 1 kostki (bez wody i zablokowanych pól). */
function reachable(b: SceneBuild): Set<string> {
  const g = groundOf(b);
  const key = (x: number, z: number): string => `${x},${z}`;
  const sx = Math.floor(b.spawn.x);
  const sz = Math.floor(b.spawn.z);
  const seen = new Set<string>([key(sx, sz)]);
  const q: [number, number][] = [[sx, sz]];
  while (q.length) {
    const [x, z] = q.shift() as [number, number];
    const h = g.heightAt(x + 0.5, z + 0.5);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const nz = z + dz;
      const k = key(nx, nz);
      if (seen.has(k)) continue;
      if (!g.canStand(nx + 0.5, nz + 0.5, h)) continue;
      seen.add(k);
      q.push([nx, nz]);
    }
  }
  return seen;
}

function expectPoisReachable(b: SceneBuild, skip: readonly string[] = []): void {
  const r = reachable(b);
  for (const p of b.pois) {
    if (skip.includes(p.id)) continue;
    // POI osiągalny, jeśli któraś kolumna w jego promieniu jest osiągalna.
    let ok = false;
    for (let dz = -Math.ceil(p.radius); dz <= Math.ceil(p.radius) && !ok; dz++)
      for (let dx = -Math.ceil(p.radius); dx <= Math.ceil(p.radius) && !ok; dx++) {
        if (dx * dx + dz * dz > p.radius * p.radius) continue;
        if (r.has(`${Math.floor(p.pos.x + dx)},${Math.floor(p.pos.z + dz)}`)) ok = true;
      }
    expect(ok, `POI ${p.id} osiągalny`).toBe(true);
  }
}

describe('scene generators', () => {
  it('base has exactly the contract POI ids, all reachable from spawn', () => {
    const b = buildScene({ kind: 'base', seed: 1 });
    const ids = b.pois.map((p) => p.id);
    for (const id of BASE_IDS) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
    expectPoisReachable(b);
  });

  it('meadow has the contract POI ids, all reachable from spawn', () => {
    for (const seed of [1, 20260924, 777]) {
      const b = buildScene({ kind: 'meadow', seed });
      const ids = b.pois.map((p) => p.id);
      for (const id of MEADOW_IDS) expect(ids).toContain(id);
      expectPoisReachable(b);
    }
  });

  it('dungeon rooms have the POIs for their kind', () => {
    const need: Record<string, string[]> = {
      fight: ['hero-spot', 'enemy-spot-0', 'enemy-spot-1', 'exit'],
      chest: ['chest', 'exit'],
      rest: ['campfire', 'exit'],
      boss: ['hero-spot', 'enemy-spot-0', 'exit'],
    };
    for (const kind of ['fight', 'chest', 'rest', 'boss'] as const) {
      const b = buildScene({ kind: 'dungeon-room', seed: 5, room: { kind, index: 3 } });
      const ids = b.pois.map((p) => p.id);
      for (const id of need[kind] ?? []) expect(ids, kind).toContain(id);
      expectPoisReachable(b);
      // Pokój bossa większy.
      const w = b.bounds.maxX - b.bounds.minX;
      expect(w).toBe(kind === 'boss' ? 28 : 20);
    }
  });

  it('props are attached to POIs as documented', () => {
    const m = buildScene({ kind: 'meadow', seed: 3 });
    const withProp = new Set(m.props.filter((p) => p.poi).map((p) => p.poi));
    for (const id of ['chest-1', 'chest-2', 'chest-3', 'gate-dungeon', 'den-plusik', 'den-dopelniak', 'den-blizniak']) expect(withProp.has(id), id).toBe(true);
    const base = buildScene({ kind: 'base', seed: 3 });
    expect(base.props.find((p) => p.poi === 'station-karty')?.model).toBe('npc:kartonini');
  });

  it('is deterministic for the same seed', () => {
    const req: SceneRequest = { kind: 'meadow', seed: 42 };
    const a = buildScene(req);
    const b = buildScene(req);
    expect(a.pois).toEqual(b.pois);
    expect(a.trees).toEqual(b.trees);
    expect(a.foliage.length).toBe(b.foliage.length);
    expect(a.world.maxY).toBe(b.world.maxY);
    const c = buildScene({ kind: 'meadow', seed: 43 });
    expect(c.trees).not.toEqual(a.trees);
  });

  it('does not place trees on POIs or paths', () => {
    const b = buildScene({ kind: 'meadow', seed: 9 });
    for (const t of b.trees) {
      for (const p of b.pois) {
        const d = Math.hypot(t.x - p.pos.x, t.z - p.pos.z);
        if (t.kind === 'bigOak') continue;
        expect(d, `${t.kind} przy ${p.id}`).toBeGreaterThan(1.2);
      }
    }
  });
});
