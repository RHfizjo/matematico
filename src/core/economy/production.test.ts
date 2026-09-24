import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { CreatureDef, OwnedCreature, ProductionKind, Rarity } from '../types';
import { createRng } from '../rng';
import {
  canFeed,
  canStartNewCycle,
  catchReward,
  creatureLevel,
  feedBonus,
  glamGift,
  produce,
  productionPool,
} from './production';

const def = (id: string, production: ProductionKind, rarity: Rarity = 'common'): CreatureDef => ({
  id,
  name: id,
  land: 'meadow',
  rarity,
  categories: ['add.within10'],
  catchFormat: 'choice',
  catchRule: { need: 2, of: 3 },
  production,
  description: '',
});

const DEFS = {
  plusik: def('plusik', 'small'),
  dopelniak: def('dopelniak', 'pairs10'),
  blizniak: def('blizniak', 'twins', 'uncommon'),
  koniczynek: def('koniczynek', 'rare', 'rare'),
};

const owned = (id: string, level: number, fedCycle = -1): OwnedCreature => ({ id, level, fedCycle, caughtAt: 0 });

const seedArb = fc.integer({ min: 0, max: 2 ** 31 });
const levelArb = fc.constantFrom(1, 2, 3);
const cycleArb = fc.integer({ min: 0, max: 1000 });

describe('produce (GDD 9.3)', () => {
  it('Plusik: 2/3/4 cyfry z 1..5', () => {
    fc.assert(
      fc.property(seedArb, levelArb, cycleArb, (seed, level, cycle) => {
        const out = produce(owned('plusik', level), DEFS.plusik, cycle, createRng(seed));
        expect(out).toHaveLength([2, 3, 4][level - 1]!);
        for (const d of out) expect(d >= 1 && d <= 5).toBe(true);
      }),
    );
  });

  it('Dopełniak: 1/1/2 pary do 10', () => {
    fc.assert(
      fc.property(seedArb, levelArb, cycleArb, (seed, level, cycle) => {
        const out = produce(owned('dopelniak', level), DEFS.dopelniak, cycle, createRng(seed));
        expect(out).toHaveLength(2 * [1, 1, 2][level - 1]!);
        for (let i = 0; i < out.length; i += 2) {
          const a = out[i]!;
          expect(a >= 1 && a <= 9).toBe(true);
          expect(a + out[i + 1]!).toBe(10);
        }
      }),
    );
  });

  it('Bliźniak: 1/1/2 pary bliźniacze 1..9', () => {
    fc.assert(
      fc.property(seedArb, levelArb, cycleArb, (seed, level, cycle) => {
        const out = produce(owned('blizniak', level), DEFS.blizniak, cycle, createRng(seed));
        expect(out).toHaveLength(2 * [1, 1, 2][level - 1]!);
        for (let i = 0; i < out.length; i += 2) {
          expect(out[i]! >= 1 && out[i]! <= 9).toBe(true);
          expect(out[i + 1]).toBe(out[i]);
        }
      }),
    );
  });

  it('Koniczynek: 1 cyfra 6..9 + 0 co drugi cykl; poziom 3: 0 co cykl', () => {
    fc.assert(
      fc.property(seedArb, levelArb, cycleArb, (seed, level, cycle) => {
        const out = produce(owned('koniczynek', level), DEFS.koniczynek, cycle, createRng(seed));
        const big = out.filter((d) => d >= 6 && d <= 9);
        const zeros = out.filter((d) => d === 0);
        expect(big).toHaveLength(1);
        const expectZero = level === 3 || cycle % 2 === 0;
        expect(zeros).toHaveLength(expectZero ? 1 : 0);
        expect(out).toHaveLength(1 + zeros.length);
      }),
    );
  });

  it('Koniczynek poz. 1: w dwóch kolejnych cyklach dokładnie jedno 0', () => {
    for (let c = 0; c < 10; c++) {
      const zeros = [c, c + 1].flatMap((cc) => produce(owned('koniczynek', 1), DEFS.koniczynek, cc, createRng(c))).filter((d) => d === 0);
      expect(zeros).toHaveLength(1);
    }
  });

  it('pełne zakresy cyfr (Plusik 1..5, pary 1..9 z 5+5, bliźniaki 1..9, Koniczynek 6..9)', () => {
    const seen = { small: new Set<number>(), pairs: new Set<number>(), twins: new Set<number>(), rare: new Set<number>() };
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      for (const d of produce(owned('plusik', 1), DEFS.plusik, i, rng)) seen.small.add(d);
      seen.pairs.add(produce(owned('dopelniak', 1), DEFS.dopelniak, i, rng)[0]!);
      seen.twins.add(produce(owned('blizniak', 1), DEFS.blizniak, i, rng)[0]!);
      seen.rare.add(produce(owned('koniczynek', 1), DEFS.koniczynek, 1, rng)[0]!);
    }
    const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);
    expect(sorted(seen.small)).toEqual([1, 2, 3, 4, 5]);
    expect(sorted(seen.pairs)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(sorted(seen.twins)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(sorted(seen.rare)).toEqual([6, 7, 8, 9]);
  });

  it('poziom poza 1..3 jest przycinany', () => {
    expect(creatureLevel(owned('plusik', 0))).toBe(1);
    expect(creatureLevel(owned('plusik', 7))).toBe(3);
    expect(produce(owned('plusik', 9), DEFS.plusik, 0, createRng(1))).toHaveLength(4);
  });

  it('deterministyczne dla ziarna', () => {
    const a = produce(owned('plusik', 3), DEFS.plusik, 4, createRng(42));
    const b = produce(owned('plusik', 3), DEFS.plusik, 4, createRng(42));
    expect(a).toEqual(b);
  });
});

describe('inne źródła', () => {
  it('feedBonus i catchReward: 1 cyfra z puli stworka', () => {
    fc.assert(
      fc.property(seedArb, fc.constantFrom(...Object.values(DEFS)), (seed, d) => {
        const pool = productionPool(d.production);
        const f = feedBonus(d, createRng(seed));
        const c = catchReward(d, createRng(seed + 1));
        expect(f).toHaveLength(1);
        expect(c).toHaveLength(1);
        expect(pool).toContain(f[0]);
        expect(pool).toContain(c[0]);
      }),
    );
  });

  it('pule: Plusik 1..5, Koniczynek 6..9', () => {
    expect(productionPool('small')).toEqual([1, 2, 3, 4, 5]);
    expect(productionPool('rare')).toEqual([6, 7, 8, 9]);
    expect(productionPool('pairs10')).toHaveLength(9);
  });

  it('glamGift: 3 cyfry, 2 z 1..5 i 1 z 6..9', () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const g = glamGift(createRng(seed));
        expect(g).toHaveLength(3);
        expect(g.filter((d) => d >= 1 && d <= 5)).toHaveLength(2);
        expect(g.filter((d) => d >= 6 && d <= 9)).toHaveLength(1);
      }),
    );
  });

  it('canStartNewCycle i canFeed', () => {
    expect(canStartNewCycle(true)).toBe(true);
    expect(canStartNewCycle(false)).toBe(false);
    expect(canFeed(owned('plusik', 1, -1), 0)).toBe(true);
    expect(canFeed(owned('plusik', 1, 3), 3)).toBe(false);
    expect(canFeed(owned('plusik', 1, 3), 4)).toBe(true);
  });
});
