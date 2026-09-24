import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CategoryId } from '../types';
import { ALL_CATEGORY_IDS, CATEGORIES, MUL_TABLES } from './categories';
import {
  allFacts,
  categoriesOfFact,
  commutativePartner,
  factAnswer,
  factsOf,
  formatFact,
  parseFact,
} from './facts';
import { makeSettings } from './testkit';

const s10 = makeSettings(10);
const s20 = makeSettings(20);
const s100 = makeSettings(100);

function facts(cat: CategoryId, settings = s20): string[] {
  const list = factsOf(cat, settings);
  if (list === null) throw new Error(`${cat} nie jest faktowa`);
  return list;
}

function addParts(f: string): [number, number] {
  const p = parseFact(f);
  if (p.op !== 'add') throw new Error(f);
  return [p.a, p.b];
}

function subParts(f: string): [number, number] {
  const p = parseFact(f);
  if (p.op !== 'sub') throw new Error(f);
  return [p.a, p.b];
}

describe('parseFact / formatFact / factAnswer', () => {
  it('rozbiera wszystkie formaty', () => {
    expect(parseFact('add:8+7')).toEqual({ op: 'add', a: 8, b: 7 });
    expect(parseFact('sub:15-8')).toEqual({ op: 'sub', a: 15, b: 8 });
    expect(parseFact('mul:7x8')).toEqual({ op: 'mul', a: 7, b: 8 });
    expect(parseFact('div:56:8')).toEqual({ op: 'div', a: 56, b: 8 });
    expect(parseFact('cmp10:3')).toEqual({ op: 'cmp10', a: 3 });
  });

  it('odrzuca niepoprawne identyfikatory', () => {
    for (const bad of [
      '',
      'add:8 + 7',
      'add:08+7',
      'add:8+',
      'mul:7*8',
      'sub:3-5',
      'div:7:2',
      'div:5:0',
      'cmp10:11',
      'pow:2^3',
      'add:-1+2',
      'mul:7x8x9',
    ]) {
      expect(() => parseFact(bad), bad).toThrow();
    }
  });

  it('factAnswer', () => {
    expect(factAnswer('add:8+7')).toBe(15);
    expect(factAnswer('sub:15-8')).toBe(7);
    expect(factAnswer('mul:7x8')).toBe(56);
    expect(factAnswer('div:56:8')).toBe(7);
    expect(factAnswer('cmp10:3')).toBe(7);
  });

  it('formatFact jest odwrotnością parseFact dla całego uniwersum', () => {
    for (const f of allFacts(s100)) expect(formatFact(parseFact(f))).toBe(f);
  });
});

describe('commutativePartner', () => {
  it('dodawanie i mnożenie z różnymi składnikami', () => {
    expect(commutativePartner('mul:7x8')).toBe('mul:8x7');
    expect(commutativePartner('add:12+5')).toBe('add:5+12');
    expect(commutativePartner('mul:6x6')).toBeNull();
    expect(commutativePartner('add:3+3')).toBeNull();
    expect(commutativePartner('sub:15-8')).toBeNull();
    expect(commutativePartner('div:56:8')).toBeNull();
    expect(commutativePartner('cmp10:3')).toBeNull();
  });

  it('partner należy do tego samego rodzaju kategorii i ma ten sam wynik', () => {
    for (const f of allFacts(s20)) {
      const p = commutativePartner(f);
      if (p === null) continue;
      expect(factAnswer(p)).toBe(factAnswer(f));
      expect(commutativePartner(p)).toBe(f);
      expect(categoriesOfFact(p).sort()).toEqual(categoriesOfFact(f).sort());
    }
  });
});

describe('uniwersa kategorii', () => {
  it('liczności', () => {
    expect(facts('add.within10')).toHaveLength(45);
    expect(facts('add.complement10')).toHaveLength(9);
    expect(facts('add.doubles', s20)).toHaveLength(10);
    expect(facts('add.doubles', s10)).toHaveLength(5);
    expect(facts('add.within20')).toHaveLength(90);
    expect(facts('add.cross10')).toHaveLength(36);
    expect(facts('sub.within10')).toHaveLength(45);
    expect(facts('sub.within20')).toHaveLength(45);
    expect(facts('sub.cross10')).toHaveLength(36);
    for (const k of MUL_TABLES) {
      expect(facts(`mul.t${k}`)).toHaveLength(19);
      expect(facts(`div.by${k}`)).toHaveLength(10);
    }
  });

  it('kategorie proceduralne zwracają null', () => {
    for (const id of ALL_CATEGORY_IDS) {
      expect(factsOf(id, s100) === null, id).toBe(!CATEGORIES[id].factBased);
    }
  });

  it('add.within10: a, b ≥ 1, a + b ≤ 10', () => {
    for (const f of facts('add.within10')) {
      const [a, b] = addParts(f);
      expect(a >= 1 && b >= 1 && a + b <= 10, f).toBe(true);
    }
  });

  it('add.doubles: a + a, przy zakresie 10 tylko do 5 + 5', () => {
    expect(facts('add.doubles', s20)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((a) => `add:${a}+${a}`));
    expect(facts('add.doubles', s10)).toEqual([1, 2, 3, 4, 5].map((a) => `add:${a}+${a}`));
  });

  it('add.within20: liczba „naście” + jednocyfrowa, bez przekroczenia progu 10, suma 11..19', () => {
    const list = facts('add.within20');
    expect(list).toContain('add:12+5');
    expect(list).toContain('add:5+12');
    expect(list).toContain('add:10+4');
    expect(list).not.toContain('add:15+7');
    for (const f of list) {
      const [a, b] = addParts(f);
      const teen = Math.max(a, b);
      const unit = Math.min(a, b);
      expect(teen >= 10 && teen <= 19 && unit >= 1 && unit <= 9, f).toBe(true);
      expect((teen % 10) + unit, f).toBeLessThanOrEqual(9);
      expect(a + b).toBeGreaterThanOrEqual(11);
      expect(a + b).toBeLessThanOrEqual(19);
    }
  });

  it('add.cross10: oba składniki 2..9, suma ≥ 11', () => {
    for (const f of facts('add.cross10')) {
      const [a, b] = addParts(f);
      expect(a >= 2 && a <= 9 && b >= 2 && b <= 9 && a + b >= 11, f).toBe(true);
    }
  });

  it('add.complement10: cmp10:1..9', () => {
    expect(facts('add.complement10')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map((a) => `cmp10:${a}`));
  });

  it('sub.within10: m 2..10, s 1..m−1 (wynik ≥ 1)', () => {
    for (const f of facts('sub.within10')) {
      const [m, s] = subParts(f);
      expect(m >= 2 && m <= 10 && s >= 1 && s < m, f).toBe(true);
    }
  });

  it('sub.within20: m 11..19, s 1..9, jedności m ≥ s', () => {
    expect(facts('sub.within20')).toContain('sub:17-5');
    for (const f of facts('sub.within20')) {
      const [m, s] = subParts(f);
      expect(m >= 11 && m <= 19 && s >= 1 && s <= 9 && m % 10 >= s, f).toBe(true);
      expect(m - s).toBeGreaterThanOrEqual(10);
    }
  });

  it('sub.cross10: m 11..18, s 2..9, jedności m < s, wynik ≤ 9', () => {
    expect(facts('sub.cross10')).toContain('sub:15-8');
    for (const f of facts('sub.cross10')) {
      const [m, s] = subParts(f);
      expect(m >= 11 && m <= 18 && s >= 2 && s <= 9 && m % 10 < s, f).toBe(true);
      expect(m - s).toBeLessThanOrEqual(9);
      expect(m - s).toBeGreaterThanOrEqual(2);
    }
  });

  it('mul.tK: czynniki 1..10, jeden z nich = K; div.byK: dzielnik K, iloraz 1..10', () => {
    for (const k of MUL_TABLES) {
      for (const f of facts(`mul.t${k}`)) {
        const p = parseFact(f);
        if (p.op !== 'mul') throw new Error(f);
        expect(p.a === k || p.b === k, f).toBe(true);
        expect(p.a >= 1 && p.a <= 10 && p.b >= 1 && p.b <= 10, f).toBe(true);
      }
      for (const f of facts(`div.by${k}`)) {
        const p = parseFact(f);
        if (p.op !== 'div') throw new Error(f);
        expect(p.b).toBe(k);
        const q = p.a / p.b;
        expect(Number.isInteger(q) && q >= 1 && q <= 10, f).toBe(true);
      }
    }
  });
});

describe('categoriesOfFact', () => {
  it('przykłady z GDD', () => {
    expect(categoriesOfFact('add:6+6')).toEqual(['add.doubles', 'add.cross10']);
    expect(categoriesOfFact('add:3+3')).toEqual(['add.within10', 'add.doubles']);
    expect(categoriesOfFact('add:10+10')).toEqual(['add.doubles']);
    expect(categoriesOfFact('add:8+7')).toEqual(['add.cross10']);
    expect(categoriesOfFact('add:12+5')).toEqual(['add.within20']);
    expect(categoriesOfFact('mul:7x8')).toEqual(['mul.t7', 'mul.t8']);
    expect(categoriesOfFact('mul:1x7')).toEqual(['mul.t7']);
    expect(categoriesOfFact('mul:7x7')).toEqual(['mul.t7']);
    expect(categoriesOfFact('mul:1x1')).toEqual([]);
    expect(categoriesOfFact('div:56:8')).toEqual(['div.by8']);
    expect(categoriesOfFact('div:7:1')).toEqual([]);
    expect(categoriesOfFact('cmp10:3')).toEqual(['add.complement10']);
    expect(categoriesOfFact('cmp10:10')).toEqual([]);
    expect(categoriesOfFact('sub:15-8')).toEqual(['sub.cross10']);
    expect(categoriesOfFact('add:15+7')).toEqual([]);
  });

  it('niepoprawny identyfikator → []', () => {
    expect(categoriesOfFact('xyz')).toEqual([]);
    expect(categoriesOfFact('sub:3-5')).toEqual([]);
  });

  it('jest spójne z factsOf (w obie strony)', () => {
    for (const cat of ALL_CATEGORY_IDS) {
      const list = factsOf(cat, s20);
      if (list === null) continue;
      for (const f of list) expect(categoriesOfFact(f), f).toContain(cat);
    }
    for (const f of allFacts(s20)) {
      for (const cat of categoriesOfFact(f)) expect(factsOf(cat, s20), `${f} ∈ ${cat}`).toContain(f);
    }
  });

  it('fakty dodawania a, b ∈ 1..10 należą do co najmniej jednej kategorii (uniwersum GDD 5.1)', () => {
    for (let a = 1; a <= 10; a++) {
      for (let b = 1; b <= 10; b++) {
        expect(categoriesOfFact(`add:${a}+${b}`).length, `add:${a}+${b}`).toBeGreaterThan(0);
        if (a !== 1 || b !== 1) expect(categoriesOfFact(`mul:${a}x${b}`).length).toBeGreaterThan(0);
      }
    }
  });

  it('właściwość: każdy poprawny fakt mul ma kategorie odpowiadające czynnikom 2..10', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), fc.integer({ min: 1, max: 10 }), (a, b) => {
        const cats = categoriesOfFact(`mul:${a}x${b}`);
        const expected = [...new Set([a, b].filter((k) => k >= 2).sort((x, y) => x - y))].map((k) => `mul.t${k}`);
        expect(cats).toEqual(expected);
      }),
    );
  });
});

describe('allFacts', () => {
  it('bez powtórzeń; liczności dla zakresów', () => {
    for (const s of [s10, s20, s100]) {
      const list = allFacts(s);
      expect(new Set(list).size).toBe(list.length);
    }
    // Zakres 10: 45 (+ do 10) + 9 (dopełnianie) + 45 (− do 10) + 99 (×) + 90 (:)
    expect(allFacts(s10)).toHaveLength(45 + 9 + 45 + 99 + 90);
    // Zakres 20: dodawanie 45 + 90 + 36 + 1 (10+10) + 9, odejmowanie 45 + 45 + 36
    expect(allFacts(s20)).toHaveLength(45 + 90 + 36 + 1 + 9 + 126 + 99 + 90);
    expect(allFacts(s100)).toHaveLength(allFacts(s20).length);
  });

  it('respektuje wyłączone działania', () => {
    const onlyMul = makeSettings(20, { ops: { add: false, sub: false, mul: true, div: false } });
    const list = allFacts(onlyMul);
    expect(list).toHaveLength(99);
    expect(list.every((f) => f.startsWith('mul:'))).toBe(true);
    expect(list).not.toContain('mul:1x1');
  });

  it('każdy fakt ma poprawny, nieujemny, całkowity wynik', () => {
    for (const f of allFacts(s100)) {
      const v = factAnswer(f);
      expect(Number.isInteger(v) && v >= 0, f).toBe(true);
    }
  });
});
