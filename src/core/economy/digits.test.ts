import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  addDigitCounts,
  addDigits,
  countDigits,
  digitsFromList,
  digitsOfNumber,
  digitsToList,
  emptyDigits,
  hasDigits,
  missingDigits,
  removeDigits,
  startingDigits,
} from './digits';

const digitArb = fc.integer({ min: 0, max: 9 });
const invArb = fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 10, maxLength: 10 });

describe('digits', () => {
  it('emptyDigits: 10 zer', () => {
    expect(emptyDigits()).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('startingDigits: 2× każda z 1–9 + 1× 0 = 19', () => {
    const inv = startingDigits();
    expect(inv).toHaveLength(10);
    expect(inv[0]).toBe(1);
    for (let d = 1; d <= 9; d++) expect(inv[d]).toBe(2);
    expect(countDigits(inv)).toBe(19);
  });

  it('addDigits mutuje i odrzuca nie-cyfry', () => {
    const inv = emptyDigits();
    addDigits(inv, [5, 5, 0]);
    expect(inv[5]).toBe(2);
    expect(inv[0]).toBe(1);
    expect(() => addDigits(inv, [10])).toThrow(RangeError);
    expect(() => addDigits(inv, [1.5])).toThrow(RangeError);
    expect(countDigits(inv)).toBe(3);
  });

  it('hasDigits to sprawdzenie multizbioru', () => {
    const inv = digitsFromList([5, 4, 4]);
    expect(hasDigits(inv, [5, 4])).toBe(true);
    expect(hasDigits(inv, [4, 4])).toBe(true);
    expect(hasDigits(inv, [5, 5])).toBe(false);
    expect(hasDigits(inv, [])).toBe(true);
    expect(hasDigits(inv, [12])).toBe(false);
    expect(missingDigits(inv, [5, 5, 4, 9])).toEqual([5, 9]);
  });

  it('removeDigits rzuca wyjątek bez częściowej zmiany', () => {
    const inv = digitsFromList([1, 2]);
    expect(() => removeDigits(inv, [1, 3])).toThrow(RangeError);
    expect(inv).toEqual(digitsFromList([1, 2]));
    removeDigits(inv, [1]);
    expect(inv).toEqual(digitsFromList([2]));
  });

  it('addDigitCounts dodaje liczniki', () => {
    const inv = startingDigits();
    addDigitCounts(inv, digitsFromList([0, 9]));
    expect(inv[0]).toBe(2);
    expect(inv[9]).toBe(3);
  });

  it('digitsOfNumber', () => {
    expect(digitsOfNumber(54)).toEqual([5, 4]);
    expect(digitsOfNumber(0)).toEqual([0]);
    expect(digitsOfNumber(7)).toEqual([7]);
    expect(digitsOfNumber(100)).toEqual([1, 0, 0]);
    expect(() => digitsOfNumber(-1)).toThrow(RangeError);
    expect(() => digitsOfNumber(2.5)).toThrow(RangeError);
  });

  it('właściwość: add potem remove przywraca stan; toList/fromList są odwrotne', () => {
    fc.assert(
      fc.property(invArb, fc.array(digitArb, { maxLength: 12 }), (inv, ds) => {
        const copy = inv.slice();
        addDigits(copy, ds);
        expect(countDigits(copy)).toBe(countDigits(inv) + ds.length);
        expect(hasDigits(copy, ds)).toBe(true);
        removeDigits(copy, ds);
        expect(copy).toEqual(inv);
        expect(digitsFromList(digitsToList(inv))).toEqual(inv);
      }),
    );
  });

  it('właściwość: hasDigits ⇔ brak brakujących; remove działa ⇔ hasDigits', () => {
    fc.assert(
      fc.property(invArb, fc.array(digitArb, { maxLength: 8 }), (inv, ds) => {
        const ok = hasDigits(inv, ds);
        expect(ok).toBe(missingDigits(inv, ds).length === 0);
        const copy = inv.slice();
        if (ok) {
          removeDigits(copy, ds);
          expect(copy.every((n) => n >= 0)).toBe(true);
        } else {
          expect(() => removeDigits(copy, ds)).toThrow();
        }
      }),
    );
  });

  it('właściwość: digitsOfNumber odtwarza liczbę', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100000 }), (n) => {
        expect(Number(digitsOfNumber(n).join(''))).toBe(n);
      }),
    );
  });
});
