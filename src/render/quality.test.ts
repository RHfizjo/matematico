import { describe, expect, it } from 'vitest';
import { DynamicResolution, pickQualityFromBenchmark, QUALITY_PRESETS, shouldRenderFrame } from './quality';

describe('quality presets (GDD 17.2)', () => {
  it('match the table', () => {
    expect(QUALITY_PRESETS.low.renderScale).toBe(0.5);
    expect(QUALITY_PRESETS.medium.renderScale).toBe(0.7);
    expect(QUALITY_PRESETS.high.renderScale).toBe(0.9);
    expect(QUALITY_PRESETS.low.shadows).toBe(false);
    expect(QUALITY_PRESETS.medium.shadowMapSize).toBe(1024);
    expect(QUALITY_PRESETS.high.shadowMapSize).toBe(2048);
    expect(QUALITY_PRESETS.medium.shadowArea).toBe(40);
    expect(QUALITY_PRESETS.high.shadowArea).toBe(64);
    expect([QUALITY_PRESETS.low.viewDistance, QUALITY_PRESETS.medium.viewDistance, QUALITY_PRESETS.high.viewDistance]).toEqual([48, 96, 160]);
    expect([QUALITY_PRESETS.low.foliage, QUALITY_PRESETS.medium.foliage, QUALITY_PRESETS.high.foliage]).toEqual([0.2, 0.6, 1]);
    expect(QUALITY_PRESETS.low.composer).toBe(false);
    expect(QUALITY_PRESETS.medium.msaa).toBe(4);
  });
});

describe('DynamicResolution', () => {
  it('drops 10% after 2 s of slow frames, never below 50%', () => {
    const d = new DynamicResolution(0.7);
    let changed = false;
    for (let i = 0; i < 119; i++) changed = d.sample(25, 1 / 60) || changed;
    expect(changed).toBe(false);
    for (let i = 0; i < 3; i++) d.sample(25, 1 / 60);
    expect(d.scale).toBeCloseTo(0.6);
    for (let i = 0; i < 60 * 20; i++) d.sample(25, 1 / 60);
    expect(d.scale).toBe(0.5);
  });

  it('rises 5% after 5 s of fast frames, up to the preset max', () => {
    const d = new DynamicResolution(0.7);
    d.scale = 0.5;
    for (let i = 0; i < 60 * 5 + 2; i++) d.sample(8, 1 / 60);
    expect(d.scale).toBeCloseTo(0.55);
    for (let i = 0; i < 60 * 60; i++) d.sample(8, 1 / 60);
    expect(d.scale).toBe(0.7);
  });

  it('mid-range frames reset both timers', () => {
    const d = new DynamicResolution(0.9);
    for (let i = 0; i < 100; i++) d.sample(25, 1 / 60);
    d.sample(15, 1 / 60);
    for (let i = 0; i < 100; i++) d.sample(25, 1 / 60);
    expect(d.scale).toBe(0.9);
  });
});

describe('frame cap', () => {
  it('renders every other callback on 120 Hz and every callback on 60 Hz', () => {
    let last = 0;
    let rendered = 0;
    for (let i = 1; i <= 120; i++) {
      const now = i * (1000 / 120);
      if (shouldRenderFrame(now, last)) {
        last = now;
        rendered++;
      }
    }
    expect(rendered).toBe(60);
    last = 0;
    rendered = 0;
    for (let i = 1; i <= 60; i++) {
      const now = i * (1000 / 60);
      if (shouldRenderFrame(now, last)) {
        last = now;
        rendered++;
      }
    }
    expect(rendered).toBe(60);
  });

  it('benchmark thresholds', () => {
    expect(pickQualityFromBenchmark(5)).toBe('high');
    expect(pickQualityFromBenchmark(12)).toBe('medium');
    expect(pickQualityFromBenchmark(30)).toBe('low');
  });
});
