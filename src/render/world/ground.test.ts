import { describe, expect, it } from 'vitest';
import { B } from '../voxel/blocks';
import { VoxelWorld } from '../voxel/world';
import { Ground } from './ground';

function flatWorld(): VoxelWorld {
  const w = new VoxelWorld();
  w.fill(0, 0, 0, 19, 2, 19, B.dirt);
  w.fill(0, 3, 0, 19, 3, 19, B.grass);
  return w;
}

describe('Ground', () => {
  const bounds = { minX: 0, maxX: 20, minZ: 0, maxZ: 20 };

  it('reports standing height on top of the column', () => {
    const g = new Ground(flatWorld(), bounds);
    expect(g.heightAt(5.5, 5.5)).toBe(4);
    expect(Number.isNaN(g.heightAt(-5, -5))).toBe(true);
  });

  it('allows a 1-block step up but not 2', () => {
    const w = flatWorld();
    w.set(10, 4, 10, B.stone); // 1 w górę
    w.fill(12, 4, 10, 12, 5, 10, B.stone); // 2 w górę
    const g = new Ground(w, bounds);
    expect(g.canStand(10.5, 10.5, 4)).toBe(true);
    expect(g.canStand(12.5, 10.5, 4)).toBe(false);
    expect(g.canStand(12.5, 10.5, 5)).toBe(true);
  });

  it('blocks water, marked cells and circle colliders; slides along walls', () => {
    const w = flatWorld();
    w.set(5, 3, 5, B.water);
    const g = new Ground(w, bounds);
    expect(g.isWater(5.5, 5.5)).toBe(true);
    expect(g.canStand(5.5, 5.5, 4)).toBe(false);
    g.block(7, 7);
    expect(g.canStand(7.5, 7.5, 4)).toBe(false);
    g.colliders.push({ x: 15, z: 15, r: 1 });
    expect(g.canOccupy(15.5, 15, 0.3, 4)).toBe(false);
    expect(g.canOccupy(17, 15, 0.3, 4)).toBe(true);
    // Ściana z zablokowanych pól wzdłuż x = 3 → ruch po skosie ślizga się wzdłuż z.
    for (let z = 0; z < 20; z++) g.block(3, z);
    const r = g.slide(2.5, 10, 0.4, 0.4, 0.3, 4);
    expect(r.x).toBeCloseTo(2.5);
    expect(r.z).toBeCloseTo(10.4);
  });

  it('does not walk off the island', () => {
    const g = new Ground(flatWorld(), bounds);
    expect(g.canOccupy(19.9, 10, 0.3, 4)).toBe(false);
    expect(g.canOccupy(18.5, 10, 0.3, 4)).toBe(true);
  });
});
