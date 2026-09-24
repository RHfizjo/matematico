import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { ItemDef } from '../types';
import { digitsFromList, emptyDigits, hasDigits, startingDigits } from './digits';
import { checkForgePayment, digitWord, findForgePayment, forgeCost } from './forge';

const ITEM_IDS = [
  'drewniany-miecz',
  'miecz-slonecznika',
  'kamizelka-z-lisci',
  'pancerz-liczydlo',
  'siatka-z-trawy',
  'siec-pajecza',
  'zlota-siec',
  'amulet-drugiej-szansy',
];

const item = (id: string): ItemDef => ({
  id,
  name: id,
  slot: 'weapon',
  land: 'meadow',
  rarity: 'common',
  attackBonus: 0,
  hpBonus: 0,
  description: '',
});

/** Czy sumę da się złożyć z `count` cyfr 1..9. */
function achievableWith1to9(sum: number, count: number): boolean {
  return sum >= count && sum <= 9 * count;
}

describe('forgeCost', () => {
  it('zakresy: 1→2 suma 10..15, 2→3 suma 15..24, zawsze 3 cyfry; poziom 3 → null', () => {
    for (const id of ITEM_IDS) {
      const c1 = forgeCost(item(id), 1);
      const c2 = forgeCost(item(id), 2);
      expect(c1?.count).toBe(3);
      expect(c2?.count).toBe(3);
      expect(c1!.sum).toBeGreaterThanOrEqual(10);
      expect(c1!.sum).toBeLessThanOrEqual(15);
      expect(c2!.sum).toBeGreaterThanOrEqual(15);
      expect(c2!.sum).toBeLessThanOrEqual(24);
      expect(forgeCost(item(id), 3)).toBeNull();
      expect(forgeCost(item(id), 4)).toBeNull();
    }
  });

  it('stały koszt (deterministyczny z id) i zróżnicowany między przedmiotami', () => {
    for (const id of ITEM_IDS) expect(forgeCost(item(id), 1)).toEqual(forgeCost(item(id), 1));
    const sums = new Set(ITEM_IDS.map((id) => forgeCost(item(id), 1)?.sum));
    expect(sums.size).toBeGreaterThan(1);
  });

  it('właściwość: koszt zawsze osiągalny cyframi 1..9', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 30 }), fc.integer({ min: -2, max: 2 }), (id, level) => {
        const cost = forgeCost(item(id), level);
        expect(cost).not.toBeNull();
        expect(achievableWith1to9(cost!.sum, cost!.count)).toBe(true);
        // skarbiec bez zer, po 3 sztuki każdej cyfry 1..9
        const inv = digitsFromList([1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((d) => [d, d, d]));
        const pay = findForgePayment(cost!, inv);
        expect(pay).not.toBeNull();
        expect(pay!.every((d) => d >= 1 && d <= 9)).toBe(true);
        expect(checkForgePayment(pay!, cost!, inv).ok).toBe(true);
      }),
    );
  });
});

describe('forgeCost — dowolne id', () => {
  it('właściwość: zakres sumy wg poziomu i zapłata możliwa ze startowego skarbca', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 30 }), fc.constantFrom(1, 2), (id, level) => {
        const cost = forgeCost(item(id), level)!;
        const [min, max] = level === 1 ? [10, 15] : [15, 24];
        expect(cost.count).toBe(3);
        expect(cost.sum).toBeGreaterThanOrEqual(min);
        expect(cost.sum).toBeLessThanOrEqual(max);
        expect(forgeCost(item(id), level)).toEqual(cost);
        const pay = findForgePayment(cost, startingDigits());
        expect(pay).not.toBeNull();
        expect(checkForgePayment(pay!, cost, startingDigits()).ok).toBe(true);
      }),
    );
  });

  it('cały zakres sum jest wykorzystywany', () => {
    const seen1 = new Set<number>();
    const seen2 = new Set<number>();
    for (let i = 0; i < 500; i++) {
      seen1.add(forgeCost(item(`p-${i}`), 1)!.sum);
      seen2.add(forgeCost(item(`p-${i}`), 2)!.sum);
    }
    expect([...seen1].sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14, 15]);
    expect([...seen2].sort((a, b) => a - b)).toEqual([15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
  });
});

describe('checkForgePayment', () => {
  const cost = { sum: 15, count: 3 };
  const inv = startingDigits();

  it('poprawna zapłata (GDD: 9+5+1, 7+7+1)', () => {
    expect(checkForgePayment([9, 5, 1], cost, inv)).toEqual({ ok: true, reason: null, message: '9 + 5 + 1 = 15. Ulepszone!' });
    expect(checkForgePayment([7, 7, 1], cost, inv).ok).toBe(true);
  });

  it('zła liczba cyfr', () => {
    expect(checkForgePayment([9, 6], cost, inv)).toMatchObject({ ok: false, reason: 'count', message: 'Wybierz dokładnie 3 cyfry.' });
    expect(checkForgePayment([5, 5, 4, 1], cost, inv).reason).toBe('count');
  });

  it('zła suma: brakuje / za dużo', () => {
    expect(checkForgePayment([1, 2, 3], cost, inv)).toMatchObject({
      ok: false,
      reason: 'sum',
      message: 'Twoje cyfry dają 6. Brakuje 9.',
    });
    expect(checkForgePayment([9, 9, 8], cost, inv).message).toBe('Twoje cyfry dają 26. Za dużo o 11.');
  });

  it('brak cyfr w skarbcu', () => {
    expect(checkForgePayment([5, 5, 5], cost, inv)).toMatchObject({ ok: false, reason: 'digits' });
    expect(checkForgePayment([15, 0, 0], cost, inv).reason).toBe('digits');
  });
});

describe('findForgePayment', () => {
  it('null gdy się nie da', () => {
    expect(findForgePayment({ sum: 15, count: 3 }, emptyDigits())).toBeNull();
    expect(findForgePayment({ sum: 24, count: 3 }, digitsFromList([9, 9, 1, 1]))).toBeNull();
  });

  it('oszczędza rzadkie cyfry', () => {
    const pay = findForgePayment({ sum: 12, count: 3 }, startingDigits());
    expect(pay).not.toBeNull();
    expect(pay!.every((d) => d >= 1 && d <= 5)).toBe(true);
    expect(hasDigits(startingDigits(), pay!)).toBe(true);
  });
});

describe('digitWord', () => {
  it('odmiana', () => {
    expect(digitWord(1)).toBe('cyfrę');
    expect(digitWord(3)).toBe('cyfry');
    expect(digitWord(5)).toBe('cyfr');
    expect(digitWord(12)).toBe('cyfr');
    expect(digitWord(22)).toBe('cyfry');
  });
});
