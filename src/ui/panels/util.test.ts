import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  canComposeSum,
  digitRarity,
  digitsWord,
  heatColor,
  keyToToken,
  lockProblem,
  pct,
  plural,
  remaining,
  secs,
  tokensText,
  totalDigits,
  usedDigits,
} from './util';

describe('digitRarity', () => {
  it('1–5 pospolite, 6–9 niezwykłe, 0 rzadkie (GDD 9.2)', () => {
    expect([1, 2, 3, 4, 5].map(digitRarity)).toEqual(Array(5).fill('common'));
    expect([6, 7, 8, 9].map(digitRarity)).toEqual(Array(4).fill('uncommon'));
    expect(digitRarity(0)).toBe('rare');
  });
});

describe('plural / digitsWord', () => {
  it('odmienia polskie liczebniki', () => {
    expect(digitsWord(1)).toBe('1 cyfra');
    expect(digitsWord(2)).toBe('2 cyfry');
    expect(digitsWord(4)).toBe('4 cyfry');
    expect(digitsWord(5)).toBe('5 cyfr');
    expect(digitsWord(12)).toBe('12 cyfr');
    expect(digitsWord(14)).toBe('14 cyfr');
    expect(digitsWord(22)).toBe('22 cyfry');
    expect(digitsWord(25)).toBe('25 cyfr');
    expect(digitsWord(0)).toBe('0 cyfr');
    expect(plural(3, 'próba', 'próby', 'prób')).toBe('próby');
    expect(plural(11, 'próba', 'próby', 'prób')).toBe('prób');
  });
});

describe('tor bramy', () => {
  it('liczy użyte cyfry i pozostałe sztuki', () => {
    const used = usedDigits([
      { t: 'd', v: 5 },
      { t: 'd', v: 4 },
      { t: 'op', v: '+' },
      { t: 'd', v: 5 },
    ]);
    expect(used[5]).toBe(2);
    expect(used[4]).toBe(1);
    expect(remaining([0, 0, 0, 0, 1, 3, 0, 0, 0, 0], used, 5)).toBe(1);
    expect(remaining([0, 0, 0, 0, 1, 3, 0, 0, 0, 0], used, 4)).toBe(0);
    expect(remaining([0, 0, 0, 0, 0, 1, 0, 0, 0, 0], used, 5)).toBe(0);
  });
  it('zapisuje tor jako tekst (sąsiednie cyfry = liczba)', () => {
    expect(
      tokensText([
        { t: 'd', v: 5 },
        { t: 'd', v: 4 },
        { t: 'op', v: '×' },
        { t: 'd', v: 1 },
      ]),
    ).toBe('54 × 1');
    expect(tokensText([])).toBe('');
  });
  it('mapuje klawisze na tokeny', () => {
    expect(keyToToken('7')).toEqual({ t: 'd', v: 7 });
    expect(keyToToken('-')).toEqual({ t: 'op', v: '−' });
    expect(keyToToken('*')).toEqual({ t: 'op', v: '×' });
    expect(keyToToken('/')).toEqual({ t: 'op', v: ':' });
    expect(keyToToken('a')).toBeNull();
    expect(keyToToken('Enter')).toBeNull();
  });
});

describe('canComposeSum', () => {
  it('przykład z GDD: złóż 15 z trzech cyfr', () => {
    expect(canComposeSum([0, 1, 0, 0, 0, 1, 0, 0, 0, 1], 15, 3)).toBe(true); // 9+5+1
    expect(canComposeSum([0, 1, 0, 0, 0, 0, 0, 2, 0, 0], 15, 3)).toBe(true); // 7+7+1
    expect(canComposeSum([0, 1, 0, 0, 0, 0, 0, 1, 0, 0], 15, 3)).toBe(false); // tylko 2 cyfry
    expect(canComposeSum([1, 4, 3, 5, 2, 3, 2, 1, 2, 1], 27, 3)).toBe(false); // potrzeba 9+9+9
    expect(canComposeSum([0, 0, 0, 0, 0, 0, 0, 0, 0, 3], 27, 3)).toBe(true);
  });
  it('zgadza się z przeglądem zupełnym', () => {
    const brute = (inv: number[], sum: number, count: number): boolean => {
      const rec = (d: number, left: number, s: number): boolean => {
        if (left === 0) return s === sum;
        if (d > 9) return false;
        for (let k = 0; k <= Math.min(inv[d] ?? 0, left); k++) if (rec(d + 1, left - k, s + k * d)) return true;
        return false;
      };
      return rec(0, count, 0);
    };
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 10, maxLength: 10 }), fc.integer({ min: 0, max: 30 }), fc.integer({ min: 0, max: 4 }), (inv, sum, count) => {
        expect(canComposeSum(inv, sum, count)).toBe(brute(inv, sum, count));
      }),
      { numRuns: 400 },
    );
  });
  it('totalDigits sumuje skarbiec', () => {
    expect(totalDigits([1, 2, 2, 2, 2, 2, 2, 2, 2, 2])).toBe(19);
  });
});

describe('panel rodzica', () => {
  it('kolor mapy ciepła: szary dla braku danych, czerwony → zielony', () => {
    expect(heatColor(null)).toBe('#d9dde5');
    expect(heatColor(0)).toBe('rgb(226, 84, 76)');
    expect(heatColor(0.5)).toBe('rgb(242, 196, 70)');
    expect(heatColor(1)).toBe('rgb(52, 176, 96)');
    expect(heatColor(2)).toBe(heatColor(1));
    expect(heatColor(-1)).toBe(heatColor(0));
  });
  it('formatuje procenty i sekundy po polsku', () => {
    expect(pct(0.734)).toBe('73%');
    expect(pct(null)).toBe('—');
    expect(secs(3400)).toBe('3,4 s');
    expect(secs(12400)).toBe('12 s');
    expect(secs(null)).toBe('—');
  });
  it('blokada: dwucyfrowe × dwucyfrowe, bez wielokrotności 10', () => {
    let seed = 1;
    const rand = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 200; i++) {
      const p = lockProblem(rand);
      expect(p.a).toBeGreaterThanOrEqual(12);
      expect(p.a).toBeLessThanOrEqual(39);
      expect(p.b).toBeGreaterThanOrEqual(12);
      expect(p.b).toBeLessThanOrEqual(29);
      expect(p.a % 10).not.toBe(0);
      expect(p.b % 10).not.toBe(0);
      expect(p.answer).toBe(p.a * p.b);
    }
  });
});
