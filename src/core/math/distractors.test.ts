import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import type { DistractorKind } from '../types';
import { makeDistractors, type DistractorInput } from './distractors';

/** Zbiór wartości (z rodzajami) z wielu losowań. */
function collect(input: DistractorInput, count = 3, runs = 300): Map<number, Set<DistractorKind>> {
  const seen = new Map<number, Set<DistractorKind>>();
  for (let seed = 1; seed <= runs; seed++) {
    for (const d of makeDistractors(input, count, createRng(seed))) {
      const kinds = seen.get(d.value) ?? new Set<DistractorKind>();
      kinds.add(d.kind);
      seen.set(d.value, kinds);
    }
  }
  return seen;
}

function expectInvariants(input: DistractorInput, count: number, seed: number): void {
  const ds = makeDistractors(input, count, createRng(seed));
  expect(ds).toHaveLength(count);
  const values = ds.map((d) => d.value);
  expect(new Set(values).size).toBe(count);
  for (const v of values) {
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).not.toBe(input.answer);
  }
}

describe('makeDistractors — przykłady z GDD 5.3', () => {
  it('8 + 7 = 15: ±1, zgubione przeniesienie (5), zamiana działania (1)', () => {
    const seen = collect({ op: 'add', operands: [8, 7], answer: 15, categoryId: 'add.cross10', format: 'choice' });
    expect(seen.get(14)).toContain('offByOne');
    expect(seen.get(16)).toContain('offByOne');
    expect(seen.get(5)).toContain('lostCarry');
    expect(seen.get(1)).toContain('wrongOp');
    expect(seen.has(56)).toBe(false); // iloczyn poza rozsądnym zakresem
  });

  it('38 + 25 = 63: ±10, zgubione przeniesienie (53), ±1', () => {
    const seen = collect({ op: 'add', operands: [38, 25], answer: 63, categoryId: 'add.2d.carry', format: 'choice' });
    expect(seen.get(53)).toContain('lostCarry');
    expect(seen.get(73)).toContain('offByTen');
    expect(seen.get(62)).toContain('offByOne');
    expect(seen.get(64)).toContain('offByOne');
  });

  it('15 − 8 = 7: ±1, odwrócenie jedności (13)', () => {
    const seen = collect({ op: 'sub', operands: [15, 8], answer: 7, categoryId: 'sub.cross10', format: 'choice' });
    expect(seen.get(6)).toContain('offByOne');
    expect(seen.get(8)).toContain('offByOne');
    expect(seen.get(13)).toContain('swappedDigits');
  });

  it('7 × 8 = 56: sąsiedzi w tabliczce 49, 63, 48, 64, pomylona para 54, suma 15', () => {
    const seen = collect({ op: 'mul', operands: [7, 8], answer: 56, categoryId: 'mul.t7', format: 'choice' });
    for (const v of [49, 63, 48, 64, 54]) expect(seen.get(v), String(v)).toContain('tableNeighbor');
    expect(seen.get(15)).toContain('wrongOp');
  });

  it('56 : 8 = 7: ±1, dzielnik zamiast ilorazu (8)', () => {
    const seen = collect({ op: 'div', operands: [56, 8], answer: 7, categoryId: 'div.by8', format: 'choice' });
    expect(seen.get(6)).toContain('offByOne');
    expect(seen.get(8)).toContain('divisorInstead');
    expect(seen.has(0)).toBe(false);
  });

  it('24 : 6 = 4: inny iloraz z tabliczki (3, 8)', () => {
    const seen = collect({ op: 'div', operands: [24, 6], answer: 4, categoryId: 'div.by6', format: 'choice' });
    expect(seen.get(8)).toContain('tableNeighbor');
    expect(seen.get(6)).toContain('divisorInstead');
  });

  it('brakująca liczba: 8 + □ = 15 i 3 + □ = 10', () => {
    const a = collect({ op: 'add', operands: [8, 15], answer: 7, categoryId: 'add.cross10', format: 'missing' });
    expect(a.get(6)).toContain('offByOne');
    expect(a.get(8)).toContain('offByOne');
    expect(a.get(13)).toContain('swappedDigits'); // 15 − 8 liczone „mniejsza od większej”
    expect(a.get(15)).toContain('other'); // przepisany wynik
    expect(a.has(23)).toBe(false); // 8 + 15 — poza rozsądnym zakresem
    const c = collect({ op: 'add', operands: [3, 10], answer: 7, categoryId: 'add.complement10', format: 'missing' });
    expect(c.get(13)).toContain('wrongOp');
    expect(c.get(3)).toContain('other');
  });

  it('brakująca liczba: □ : 8 = 7 → sąsiedzi w tabliczce; □ − 8 = 7 → zamiana działania (1)', () => {
    const d = collect({ op: 'div', operands: [8, 7], answer: 56, categoryId: 'div.by8', format: 'missing', missingIndex: 0 });
    expect(d.get(48)).toContain('tableNeighbor');
    expect(d.get(64)).toContain('tableNeighbor');
    const s = collect({ op: 'sub', operands: [8, 7], answer: 15, categoryId: 'sub.missing', format: 'missing' });
    expect(s.get(1)).toContain('wrongOp');
    expect(s.get(5)).toContain('lostCarry');
  });

  it('trzy składniki: pominięty składnik', () => {
    const seen = collect({ op: 'add', operands: [4, 6, 3], answer: 13, categoryId: 'add.three', format: 'choice' });
    expect(seen.get(10)).toContain('other');
    expect(seen.get(9)).toContain('other');
  });
});

describe('makeDistractors — niezmienniki', () => {
  it('count = 0 → [], zła liczba → błąd', () => {
    const input: DistractorInput = { op: 'add', operands: [2, 3], answer: 5, categoryId: 'add.within10', format: 'choice' };
    expect(makeDistractors(input, 0, createRng(1))).toEqual([]);
    expect(() => makeDistractors(input, -1, createRng(1))).toThrow();
    expect(() => makeDistractors(input, 1.5, createRng(1))).toThrow();
  });

  it('uzupełnia bliskimi liczbami, gdy wiarygodnych brakuje (dużo opcji, mały wynik)', () => {
    const input: DistractorInput = { op: 'sub', operands: [2, 1], answer: 1, categoryId: 'sub.within10', format: 'choice' };
    for (let seed = 1; seed <= 50; seed++) expectInvariants(input, 12, seed);
    const mulInput: DistractorInput = { op: 'mul', operands: [1, 2], answer: 2, categoryId: 'mul.t2', format: 'choice' };
    for (let seed = 1; seed <= 50; seed++) {
      expectInvariants(mulInput, 8, seed);
      // W mnożeniu 0 nie jest opcją.
      expect(makeDistractors(mulInput, 8, createRng(seed)).map((d) => d.value)).not.toContain(0);
    }
  });

  it('właściwość: dowolne dodawanie/odejmowanie/mnożenie/dzielenie, dowolny format i liczba opcji', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('add', 'sub', 'mul', 'div' as const),
        fc.integer({ min: 0, max: 99 }),
        fc.integer({ min: 1, max: 99 }),
        fc.constantFrom('choice' as const, 'missing' as const),
        fc.integer({ min: 1, max: 6 }),
        fc.integer(),
        (op, x, y, format, count, seed) => {
          let a = x;
          let b = y;
          let answer: number;
          if (op === 'add') answer = a + b;
          else if (op === 'sub') {
            if (b > a) [a, b] = [b, a];
            answer = a - b;
          } else if (op === 'mul') answer = a * b;
          else {
            a = a * b; // podzielne bez reszty
            answer = a / b;
          }
          const input: DistractorInput =
            format === 'choice'
              ? { op, operands: [a, b], answer, categoryId: 'add.within10', format }
              : { op, operands: [a, answer], answer: b, categoryId: 'add.within10', format };
          expectInvariants(input, count, seed);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('liczba dystraktorów poniżej odpowiedzi jest zróżnicowana (poprawna nie zawsze w środku)', () => {
    const input: DistractorInput = { op: 'add', operands: [8, 7], answer: 15, categoryId: 'add.cross10', format: 'choice' };
    const below = [0, 0, 0, 0];
    for (let seed = 1; seed <= 2000; seed++) {
      const n = makeDistractors(input, 3, createRng(seed)).filter((d) => d.value < 15).length;
      below[n]!++;
    }
    for (const c of below) expect(c).toBeGreaterThan(2000 * 0.15);
  });

  it('deterministyczne dla tego samego ziarna', () => {
    const input: DistractorInput = { op: 'mul', operands: [7, 8], answer: 56, categoryId: 'mul.t8', format: 'choice' };
    expect(makeDistractors(input, 3, createRng(42))).toEqual(makeDistractors(input, 3, createRng(42)));
  });
});

describe('makeDistractors — regresje z przeglądu', () => {
  /** Czy v jest iloczynem dwóch czynników z tabliczki 1..10. */
  const inTable = (v: number): boolean => {
    for (let x = 1; x <= 10; x++) if (v % x === 0 && v / x >= 1 && v / x <= 10) return true;
    return false;
  };

  it('„sąsiedzi w tabliczce” pochodzą z tabliczki 1..10 (7 × 10 → nie 77 = 7 × 11; 10 × 10 → nie 110)', () => {
    for (let a = 1; a <= 10; a++) {
      for (let b = 1; b <= 10; b++) {
        if (a === 1 && b === 1) continue;
        const choice: DistractorInput = { op: 'mul', operands: [a, b], answer: a * b, categoryId: 'mul.t2', format: 'choice' };
        // □ : b = a  (dzielna niewiadoma)
        const missingDiv: DistractorInput = { op: 'div', operands: [b, a], answer: a * b, categoryId: 'div.by2', format: 'missing', missingIndex: 0 };
        for (const input of [choice, missingDiv]) {
          for (const [v, kinds] of collect(input, 3, 60)) {
            if (kinds.has('tableNeighbor')) expect(inTable(v), `${a}, ${b} (${input.format}) → ${v}`).toBe(true);
          }
        }
      }
    }
  });
});
