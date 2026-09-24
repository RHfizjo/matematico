import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import type { CategoryId, NumberRange, Task, TaskFormat } from '../types';
import { ALL_CATEGORY_IDS, CATEGORIES, isCategoryAvailable } from './categories';
import { MISSING_MARK, evalTerms, taskEquation } from './equation';
import { categoriesOfFact, factAnswer, factsOf, parseFact } from './facts';
import { generateTask } from './generators';
import { FORMATS, RANGES, makeSettings } from './testkit';

const COMBOS: { cat: CategoryId; range: NumberRange }[] = RANGES.flatMap((range) =>
  ALL_CATEGORY_IDS.filter((cat) => isCategoryAvailable(cat, makeSettings(range))).map((cat) => ({ cat, range })),
);

function gen(cat: CategoryId, range: NumberRange, format: TaskFormat, seed: number, optionsCount?: 3 | 4): Task {
  return generateTask({
    categoryId: cat,
    factId: null,
    rng: createRng(seed),
    settings: makeSettings(range),
    format,
    id: `t${seed}`,
    ...(optionsCount !== undefined ? { optionsCount } : {}),
  });
}

/** Sprawdza definicję kategorii dla pełnego działania. */
function checkCategoryDefinition(task: Task, range: NumberRange): void {
  const e = taskEquation(task);
  const [a = 0, b = 0, c = 0] = e.terms;
  const u = (n: number): number => n % 10;
  switch (task.categoryId) {
    case 'add.three':
      expect(e.terms).toHaveLength(3);
      for (const t of e.terms) expect(t >= 1 && t <= 9).toBe(true);
      expect(a + b + c).toBeLessThanOrEqual(Math.min(20, range));
      break;
    case 'add.2d':
      expect(a >= 10 && a <= 99 && b >= 10 && b <= 99).toBe(true);
      expect(u(a) + u(b)).toBeLessThanOrEqual(9);
      expect(e.result).toBeLessThanOrEqual(99);
      break;
    case 'add.2d.carry':
      expect(a >= 10 && a <= 99 && b >= 10 && b <= 99).toBe(true);
      expect(u(a) + u(b)).toBeGreaterThanOrEqual(10);
      expect(e.result).toBeLessThanOrEqual(100);
      break;
    case 'sub.2d':
      expect(a >= 10 && a <= 99 && b >= 10 && b <= 99).toBe(true);
      expect(u(a)).toBeGreaterThanOrEqual(u(b));
      expect(e.result).toBeGreaterThanOrEqual(1);
      break;
    case 'sub.2d.borrow':
      expect(a >= 10 && a <= 99 && b >= 10 && b <= 99).toBe(true);
      expect(u(a)).toBeLessThan(u(b));
      expect(e.result).toBeGreaterThanOrEqual(1);
      break;
    case 'sub.missing':
      expect(task.text).toContain(MISSING_MARK);
      expect(a).toBeLessThanOrEqual(Math.min(20, range));
      expect(e.result).toBeGreaterThanOrEqual(1);
      break;
    default:
      break;
  }
}

describe('generateTask — właściwości (wszystkie kategorie, zakresy, formaty)', () => {
  it('poprawna odpowiedź, tekst, opcje, kategorie', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...COMBOS),
        fc.constantFrom(...FORMATS),
        fc.constantFrom<3 | 4 | undefined>(3, 4, undefined),
        fc.integer(),
        ({ cat, range }, format, optionsCount, seed) => {
          const task = gen(cat, range, format, seed, optionsCount);
          const def = CATEGORIES[cat];

          // Podstawowe pola
          expect(task.id).toBe(`t${seed}`);
          expect(task.categoryId).toBe(cat);
          expect(task.op).toBe(def.op);
          expect(task.categories).toContain(cat);

          // Tekst: znaki działań, zakończenie
          expect(task.text).not.toMatch(/[-*x/]/);
          const hasBox = task.text.includes(MISSING_MARK);
          if (hasBox) expect(task.text).not.toContain('?');
          else expect(task.text.endsWith(' = ?')).toBe(true);

          // Format: complement10 i sub.missing zawsze z □
          if (cat === 'add.complement10' || cat === 'sub.missing') {
            expect(hasBox).toBe(true);
            expect(task.format).toBe(format === 'typed' ? 'typed' : 'missing');
          } else {
            expect(task.format).toBe(format);
            expect(hasBox).toBe(format === 'missing');
          }

          // Odpowiedź zgodna z działaniem
          const e = taskEquation(task);
          expect(evalTerms(e.op, e.terms)).toBe(e.result);
          expect(Number.isInteger(task.answer) && task.answer >= 0).toBe(true);
          for (const t of e.terms) expect(Number.isInteger(t) && t >= 0).toBe(true);
          if (e.missingIndex === null) expect(task.answer).toBe(e.result);
          else expect(e.terms[e.missingIndex]).toBe(task.answer);

          // Operands = widoczne liczby w kolejności
          const shown = task.text.split(' ').filter((tok) => /^\d+$/.test(tok)).map(Number);
          expect(task.operands).toEqual(shown);

          // Fakt: zgodny z kategorią i działaniem
          if (def.factBased) {
            expect(task.factId).not.toBeNull();
            const f = task.factId as string;
            expect(categoriesOfFact(f)).toContain(cat);
            expect(task.categories).toEqual(categoriesOfFact(f));
            const p = parseFact(f);
            if (p.op === 'cmp10') expect(e.terms).toEqual([p.a, 10 - p.a]);
            else {
              expect(e.terms).toEqual([p.a, p.b]);
              expect(e.result).toBe(factAnswer(f));
            }
          } else {
            expect(task.factId).toBeNull();
            expect(task.categories).toEqual([cat]);
          }

          // Zakres liczb dla dodawania i odejmowania
          if (def.op === 'add' || def.op === 'sub') {
            for (const n of [...e.terms, e.result]) expect(n).toBeLessThanOrEqual(range);
          } else {
            for (const n of [...e.terms, e.result]) expect(n).toBeLessThanOrEqual(100);
          }

          checkCategoryDefinition(task, range);

          // Opcje
          if (task.format === 'typed') {
            expect(task.options).toEqual([]);
            expect(task.distractorKinds).toEqual({});
          } else {
            expect(task.options).toHaveLength(optionsCount ?? 4);
            expect(new Set(task.options).size).toBe(task.options.length);
            expect(task.options).toContain(task.answer);
            for (const o of task.options) expect(Number.isInteger(o) && o >= 0).toBe(true);
            const wrong = task.options.filter((o) => o !== task.answer).map(String).sort();
            expect(Object.keys(task.distractorKinds).sort()).toEqual(wrong);
          }
        },
      ),
      { numRuns: 3000 },
    );
  });

  it('deterministyczne dla tego samego ziarna', () => {
    fc.assert(
      fc.property(fc.constantFrom(...COMBOS), fc.constantFrom(...FORMATS), fc.integer(), ({ cat, range }, format, seed) => {
        expect(gen(cat, range, format, seed)).toEqual(gen(cat, range, format, seed));
      }),
      { numRuns: 300 },
    );
  });
});

describe('generateTask — przypadki szczególne', () => {
  const s20 = makeSettings(20);

  it('zadany fakt: tekst i odpowiedź', () => {
    const t = generateTask({ categoryId: 'add.cross10', factId: 'add:8+7', rng: createRng(1), settings: s20, format: 'choice', id: 'a' });
    expect(t.text).toBe('8 + 7 = ?');
    expect(t.answer).toBe(15);
    expect(t.operands).toEqual([8, 7]);
    expect(t.categories).toEqual(['add.cross10']);

    const m = generateTask({ categoryId: 'mul.t8', factId: 'mul:7x8', rng: createRng(1), settings: s20, format: 'typed', id: 'b' });
    expect(m.text).toBe('7 × 8 = ?');
    expect(m.categories).toEqual(['mul.t7', 'mul.t8']);
    expect(m.options).toEqual([]);

    const s = generateTask({ categoryId: 'sub.cross10', factId: 'sub:15-8', rng: createRng(1), settings: s20, format: 'choice', id: 'c' });
    expect(s.text).toBe('15 − 8 = ?');

    const d = generateTask({ categoryId: 'div.by8', factId: 'div:56:8', rng: createRng(1), settings: s20, format: 'choice', id: 'd' });
    expect(d.text).toBe('56 : 8 = ?');
    expect(d.answer).toBe(7);
  });

  it('dopełnianie: zawsze "a + □ = 10"', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const t = generateTask({ categoryId: 'add.complement10', factId: 'cmp10:3', rng: createRng(seed), settings: s20, format: 'choice', id: 'x' });
      expect(t.text).toBe('3 + □ = 10');
      expect(t.answer).toBe(7);
      expect(t.format).toBe('missing');
      expect(t.operands).toEqual([3, 10]);
    }
  });

  it('format missing: "8 + □ = 15" lub "□ + 7 = 15"', () => {
    const texts = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) {
      const t = generateTask({ categoryId: 'add.cross10', factId: 'add:8+7', rng: createRng(seed), settings: s20, format: 'missing', id: 'x' });
      texts.add(`${t.text}|${t.answer}`);
    }
    expect(texts).toEqual(new Set(['8 + □ = 15|7', '□ + 7 = 15|8']));
  });

  it('błędy wywołania', () => {
    const base = { rng: createRng(1), format: 'choice' as const, id: 'x' };
    expect(() => generateTask({ ...base, categoryId: 'add.2d', factId: null, settings: s20 })).toThrow(RangeError);
    expect(() => generateTask({ ...base, categoryId: 'add.cross10', factId: null, settings: makeSettings(10) })).toThrow(RangeError);
    expect(() => generateTask({ ...base, categoryId: 'mul.t7', factId: 'mul:2x3', settings: s20 })).toThrow();
    expect(() => generateTask({ ...base, categoryId: 'add.three', factId: 'add:1+2', settings: s20 })).toThrow();
  });

  it('add.doubles przy zakresie 10 losuje tylko do 5 + 5', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const t = gen('add.doubles', 10, 'choice', seed);
      expect(t.answer).toBeLessThanOrEqual(10);
    }
  });

  it('kategorie faktowe losują wszystkie fakty kategorii', () => {
    const list = factsOf('mul.t7', s20) ?? [];
    const seen = new Set<string>();
    for (let seed = 1; seed <= 2000; seed++) seen.add(gen('mul.t7', 20, 'choice', seed).factId as string);
    expect(seen).toEqual(new Set(list));
  });
});

describe('generateTask — statystyka opcji', () => {
  it('pozycja poprawnej odpowiedzi jest równomierna (χ², 4 opcje)', () => {
    const counts = [0, 0, 0, 0];
    let n = 0;
    for (let seed = 1; n < 10000; seed++) {
      const { cat, range } = COMBOS[seed % COMBOS.length]!;
      const t = gen(cat, range, 'choice', seed * 7919);
      counts[t.options.indexOf(t.answer)]!++;
      n++;
    }
    const expected = n / 4;
    const chi2 = counts.reduce((acc, c) => acc + (c - expected) ** 2 / expected, 0);
    // df = 3, p = 0.001 → 16.27
    expect(chi2).toBeLessThan(16.27);
  });

  it('pozycja poprawnej odpowiedzi jest równomierna (χ², 3 opcje)', () => {
    const counts = [0, 0, 0];
    const n = 6000;
    for (let seed = 1; seed <= n; seed++) {
      const { cat, range } = COMBOS[seed % COMBOS.length]!;
      const t = gen(cat, range, 'missing', seed * 104729, 3);
      counts[t.options.indexOf(t.answer)]!++;
    }
    const expected = n / 3;
    const chi2 = counts.reduce((acc, c) => acc + (c - expected) ** 2 / expected, 0);
    // df = 2, p = 0.001 → 13.82
    expect(chi2).toBeLessThan(13.82);
  });

  it('poprawna odpowiedź nie jest systematycznie medianą ani średnią opcji', () => {
    const rankCounts = [0, 0, 0, 0];
    let isMean = 0;
    const n = 8000;
    for (let seed = 1; seed <= n; seed++) {
      const { cat, range } = COMBOS[seed % COMBOS.length]!;
      const t = gen(cat, range, seed % 2 === 0 ? 'choice' : 'missing', seed * 31337);
      const sorted = [...t.options].sort((x, y) => x - y);
      rankCounts[sorted.indexOf(t.answer)]!++;
      const mean = t.options.reduce((a, b) => a + b, 0) / t.options.length;
      if (Math.abs(mean - t.answer) < 1e-9) isMean++;
    }
    // Każda pozycja w kolejności rosnącej występuje często (środkowe nie dominują).
    for (const c of rankCounts) expect(c / n).toBeGreaterThan(0.15);
    const middle = (rankCounts[1]! + rankCounts[2]!) / n;
    expect(middle).toBeLessThan(0.65);
    expect(isMean / n).toBeLessThan(0.25);
  });

  it('dystraktory leżą i poniżej, i powyżej odpowiedzi (dla większości zadań z odpowiedzią ≥ 4)', () => {
    let mixed = 0;
    let total = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      const { cat, range } = COMBOS[seed % COMBOS.length]!;
      const t = gen(cat, range, 'choice', seed * 17);
      if (t.answer < 4) continue;
      total++;
      const lo = t.options.some((o) => o < t.answer);
      const hi = t.options.some((o) => o > t.answer);
      if (lo && hi) mixed++;
    }
    expect(mixed / total).toBeGreaterThan(0.4);
  });
});

describe('generateTask — regresje z przeglądu', () => {
  it('zadany fakt spoza puli kategorii przy danym zakresie (add:6+6 przy zakresie 10) → RangeError, bez wyniku > zakres', () => {
    const s10 = makeSettings(10);
    const base = { rng: createRng(1), format: 'choice' as const, id: 'x', settings: s10 };
    expect(() => generateTask({ ...base, categoryId: 'add.doubles', factId: 'add:6+6' })).toThrow(RangeError);
    expect(() => generateTask({ ...base, categoryId: 'add.doubles', factId: 'add:10+10' })).toThrow(RangeError);
    // W zakresie — działa.
    const ok = generateTask({ ...base, categoryId: 'add.doubles', factId: 'add:5+5' });
    expect(ok.answer).toBe(10);
    expect(generateTask({ ...base, categoryId: 'add.doubles', factId: 'add:6+6', settings: makeSettings(20) }).answer).toBe(12);
  });
});
