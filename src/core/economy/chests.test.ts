import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { ChestKind } from '../types';
import { createRng } from '../rng';
import { CHEST_PITY_LIMIT, openChest } from './chests';

const seedArb = fc.integer({ min: 0, max: 2 ** 31 });
const pityArb = fc.integer({ min: 0, max: 3 });
const poolArb = fc.subarray(['miecz-slonecznika', 'siec-pajecza', 'pancerz-liczydlo']);

const isDigit = (d: number) => Number.isInteger(d) && d >= 0 && d <= 9;

describe('openChest — zawartość', () => {
  it('świat: 2–4 cyfry; dungeon: 3–5 cyfr', () => {
    fc.assert(
      fc.property(seedArb, pityArb, poolArb, (seed, pity, pool) => {
        const w = openChest({ kind: 'world', pity, rng: createRng(seed), itemPool: pool });
        expect(w.loot.digits.length).toBeGreaterThanOrEqual(2);
        expect(w.loot.digits.length).toBeLessThanOrEqual(4);
        expect(w.loot.digits.every(isDigit)).toBe(true);
        const d = openChest({ kind: 'dungeon', pity, rng: createRng(seed), itemPool: pool });
        expect(d.loot.digits.length).toBeGreaterThanOrEqual(3);
        expect(d.loot.digits.length).toBeLessThanOrEqual(5);
        expect(d.loot.digits.every(isDigit)).toBe(true);
      }),
    );
  });

  it('bonus: 4 cyfry, ≥1 z 6..9, przedmiot z puli jeśli jest; licznik bez zmian', () => {
    fc.assert(
      fc.property(seedArb, pityArb, poolArb, (seed, pity, pool) => {
        const r = openChest({ kind: 'bonus', pity, rng: createRng(seed), itemPool: pool });
        expect(r.loot.digits).toHaveLength(4);
        expect(r.loot.digits.every(isDigit)).toBe(true);
        expect(r.loot.digits.some((x) => x >= 6 && x <= 9)).toBe(true);
        if (pool.length > 0) expect(pool).toContain(r.loot.itemId);
        else expect(r.loot.itemId).toBeNull();
        expect(r.pity).toBe(pity);
      }),
    );
  });

  it('boss: 5 cyfr, dokładnie jedno 0, bez przedmiotu; licznik bez zmian', () => {
    fc.assert(
      fc.property(seedArb, pityArb, poolArb, (seed, pity, pool) => {
        const r = openChest({ kind: 'boss', pity, rng: createRng(seed), itemPool: pool });
        expect(r.loot.digits).toHaveLength(5);
        expect(r.loot.digits.filter((x) => x === 0)).toHaveLength(1);
        expect(r.loot.digits.every(isDigit)).toBe(true);
        expect(r.loot.itemId).toBeNull();
        expect(r.pity).toBe(pity);
      }),
    );
  });

  it('deterministyczne dla ziarna', () => {
    const a = openChest({ kind: 'dungeon', pity: 1, rng: createRng(9), itemPool: ['x', 'y'] });
    const b = openChest({ kind: 'dungeon', pity: 1, rng: createRng(9), itemPool: ['x', 'y'] });
    expect(a).toEqual(b);
  });

  it('nie modyfikuje puli', () => {
    const pool = ['miecz-slonecznika'];
    openChest({ kind: 'world', pity: 2, rng: createRng(1), itemPool: pool });
    expect(pool).toEqual(['miecz-slonecznika']);
  });
});

describe('openChest — gwarancja (pity)', () => {
  it('świat/dungeon: przedmiot dokładnie co 3. skrzynię przy niepustej puli', () => {
    fc.assert(
      fc.property(seedArb, fc.array(fc.constantFrom<ChestKind>('world', 'dungeon'), { minLength: 1, maxLength: 30 }), (seed, kinds) => {
        const rng = createRng(seed);
        let pity = 0;
        let sinceItem = 0;
        for (const kind of kinds) {
          const r = openChest({ kind, pity, rng, itemPool: ['siec-pajecza', 'miecz-slonecznika'] });
          pity = r.pity;
          sinceItem++;
          if (r.loot.itemId !== null) {
            expect(sinceItem).toBe(CHEST_PITY_LIMIT);
            sinceItem = 0;
          }
          expect(sinceItem).toBeLessThan(CHEST_PITY_LIMIT);
          expect(pity).toBe(sinceItem);
        }
      }),
    );
  });

  it('przeplatane z bonus/boss: nadal przedmiot co najmniej co 3 zwykłe skrzynie', () => {
    fc.assert(
      fc.property(seedArb, fc.array(fc.constantFrom<ChestKind>('world', 'dungeon', 'bonus', 'boss'), { maxLength: 40 }), (seed, kinds) => {
        const rng = createRng(seed);
        let pity = 0;
        let regularSinceItem = 0;
        for (const kind of kinds) {
          const r = openChest({ kind, pity, rng, itemPool: ['a'] });
          pity = r.pity;
          if (kind === 'world' || kind === 'dungeon') {
            regularSinceItem = r.loot.itemId !== null ? 0 : regularSinceItem + 1;
            expect(regularSinceItem).toBeLessThan(CHEST_PITY_LIMIT);
          }
        }
      }),
    );
  });

  it('pusta pula: licznik zatrzymuje się na 3, przedmiot przy pierwszej niepustej puli', () => {
    const rng = createRng(5);
    let pity = 0;
    for (let i = 0; i < 6; i++) {
      const r = openChest({ kind: 'world', pity, rng, itemPool: [] });
      expect(r.loot.itemId).toBeNull();
      pity = r.pity;
      expect(pity).toBeLessThanOrEqual(CHEST_PITY_LIMIT);
    }
    expect(pity).toBe(CHEST_PITY_LIMIT);
    const r = openChest({ kind: 'dungeon', pity, rng, itemPool: ['siec-pajecza'] });
    expect(r.loot.itemId).toBe('siec-pajecza');
    expect(r.pity).toBe(0);
  });

  it('nieprawidłowy licznik traktowany jak 0', () => {
    expect(openChest({ kind: 'world', pity: -5, rng: createRng(1), itemPool: ['a'] }).pity).toBe(1);
    expect(openChest({ kind: 'world', pity: Number.NaN, rng: createRng(1), itemPool: ['a'] }).pity).toBe(1);
  });
});
