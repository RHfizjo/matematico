import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { allFacts, parseFact } from '../math/facts';
import { defaultSettings } from './defaults';
import { isFactId, isFactInCategory } from './ids';

const parses = (f: string): boolean => {
  try {
    parseFact(f);
    return true;
  } catch {
    return false;
  }
};

describe('isFactId (zgodność z core/math)', () => {
  it('akceptuje wszystkie fakty z core/math (zakres 10/20/100)', () => {
    for (const range of [10, 20, 100] as const) {
      const facts = allFacts({ ...defaultSettings(), range });
      expect(facts.length).toBeGreaterThan(0);
      expect(facts.filter((f) => !isFactId(f))).toEqual([]);
    }
  });

  it('odrzuca fakty, na których parseFact rzuca wyjątek', () => {
    for (const f of ['sub:3-5', 'div:7:2', 'div:5:0', 'cmp10:11', 'cmp10:99', 'add:01+2', 'mul:00x1', 'div:08:4']) {
      expect(parses(f), f).toBe(false);
      expect(isFactId(f), f).toBe(false);
    }
  });

  it('property: isFactId ⇒ parseFact nie rzuca', () => {
    const num = fc.oneof(fc.integer({ min: 0, max: 120 }).map(String), fc.stringMatching(/^\d{1,4}$/));
    const factLike = fc.oneof(
      fc.tuple(fc.constantFrom('add:', 'sub:', 'mul:', 'div:'), num, fc.constantFrom('+', '-', 'x', ':'), num).map((p) => p.join('')),
      num.map((n) => `cmp10:${n}`),
      fc.string(),
    );
    fc.assert(
      fc.property(factLike, (f) => {
        if (isFactId(f)) expect(parses(f), f).toBe(true);
      }),
      { numRuns: 3000 },
    );
  });

  it('isFactInCategory', () => {
    expect(isFactInCategory('mul:7x8', 'mul.t7')).toBe(true);
    expect(isFactInCategory('mul:7x8', 'mul.t8')).toBe(true);
    expect(isFactInCategory('mul:7x8', 'mul.t6')).toBe(false);
    expect(isFactInCategory('add:2+3', 'mul.t7')).toBe(false);
    expect(isFactInCategory('cmp10:3', 'add.complement10')).toBe(true);
    expect(isFactInCategory('sub:3-5', 'sub.within10')).toBe(false);
  });
});
