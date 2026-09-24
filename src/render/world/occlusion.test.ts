import { describe, expect, it } from 'vitest';
import { segmentHitsVoxels } from './occlusion';

describe('segmentHitsVoxels', () => {
  const sx = 5;
  const sy = 5;
  const sz = 5;
  const dense = new Uint8Array(sx * sy * sz);
  dense[(2 * sz + 2) * sx + 2] = 1; // kostka (2,2,2)

  it('hits a voxel on the segment', () => {
    expect(segmentHitsVoxels(dense, sx, sy, sz, -3, 2.5, 2.5, 8, 2.5, 2.5)).toBe(true);
    expect(segmentHitsVoxels(dense, sx, sy, sz, 0.2, 0.2, 0.2, 4.7, 4.6, 4.8)).toBe(true);
  });

  it('misses when passing beside the voxel', () => {
    expect(segmentHitsVoxels(dense, sx, sy, sz, -3, 3.5, 2.5, 8, 3.5, 2.5)).toBe(false);
    expect(segmentHitsVoxels(dense, sx, sy, sz, 0.5, 0.5, 0.5, 4.5, 0.5, 4.5)).toBe(false);
  });

  it('stops at the segment end', () => {
    expect(segmentHitsVoxels(dense, sx, sy, sz, -3, 2.5, 2.5, 1.5, 2.5, 2.5)).toBe(false);
  });

  it('works entirely outside the volume', () => {
    expect(segmentHitsVoxels(dense, sx, sy, sz, -10, -10, -10, -5, -2, -1)).toBe(false);
  });
});
